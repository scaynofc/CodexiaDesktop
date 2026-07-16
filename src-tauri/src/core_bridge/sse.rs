//! Hand-rolled SSE client for `GET /tasks/{id}/events` - see
//! docs/adr/007-task-center-polling-and-sse.md for why this isn't built on
//! the `reqwest-eventsource` crate (it auto-reconnects by design, which
//! fights a server that deliberately closes the connection on every
//! terminal event).
//!
//! CodexiaCore's own encoder (`api/sse.py`'s `format_sse`) only ever emits
//! `event:`/`data:` lines, never `id:`/`retry:`/comments - a closed subset
//! fully controlled by the same repo, not the general SSE spec. This client
//! only needs to handle that subset.

use std::time::Duration;

use super::error::BridgeError;
use super::http::CoreHttpClient;
use super::tasks::{Task, TaskState};

/// Comfortably above CodexiaCore's own `DEFAULT_MAX_WAIT_SECONDS` (300s,
/// `api/sse.py`) so the *server's* `timeout` event fires first - the
/// blanket 5s timeout on `CoreHttpClient`'s shared `reqwest::Client` would
/// otherwise kill this connection long before the first event ever arrives.
const SSE_REQUEST_TIMEOUT: Duration = Duration::from_secs(330);

#[derive(Debug, Clone, PartialEq)]
pub enum TaskEvent {
    /// A full task snapshot - sent whenever it changes, not per poll tick.
    /// Boxed since `Task` is much larger than the other variants.
    Snapshot(Box<Task>),
    /// The stream reached a terminal state and is about to close.
    Done,
    /// The server rejected the request (e.g. unknown task id).
    Error(String),
    /// No terminal state within CodexiaCore's own wait budget.
    Timeout,
}

/// The only real decision logic in this module - pure, no I/O. Given one
/// parsed SSE block's event name and data, returns what it means. Unknown
/// event names are reported as an error so the caller can decide whether to
/// skip-and-continue or treat it as fatal, rather than silently swallowing
/// unrecognized protocol traffic here.
pub fn parse_task_event(event_name: &str, data: &str) -> Result<TaskEvent, BridgeError> {
    match event_name {
        "task" => {
            let task: Task = serde_json::from_str(data)
                .map_err(|e| BridgeError::DecodeFailure(e.to_string()))?;
            Ok(TaskEvent::Snapshot(Box::new(task)))
        }
        "done" => Ok(TaskEvent::Done),
        "error" => Ok(TaskEvent::Error(data.to_string())),
        "timeout" => Ok(TaskEvent::Timeout),
        other => Err(BridgeError::DecodeFailure(format!(
            "unrecognized SSE event type: {other}"
        ))),
    }
}

/// Splits one `event: ...\ndata: ...\n\n`-shaped block into (event name,
/// joined data). Mirrors CodexiaCore's own reference client-side parser
/// (`static/dashboard.html`'s inline block-splitting script) line for line.
fn parse_block(block: &str) -> (String, String) {
    let mut event_name = String::from("message");
    let mut data_lines = Vec::new();

    for line in block.split('\n') {
        if let Some(rest) = line.strip_prefix("event: ") {
            event_name = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("data: ") {
            data_lines.push(rest);
        }
    }

    (event_name, data_lines.join("\n"))
}

/// Pulls one complete `\n\n`-terminated block out of `buffer` if one is
/// present, leaving any trailing partial block in place for the next chunk
/// to complete - the same reassembly `dashboard.html` does client-side,
/// necessary because a real TCP read can split a block anywhere, including
/// mid-line.
fn extract_block(buffer: &mut Vec<u8>) -> Option<String> {
    const DELIMITER: &[u8] = b"\n\n";
    let position = buffer
        .windows(DELIMITER.len())
        .position(|window| window == DELIMITER)?;

    let drained: Vec<u8> = buffer.drain(..position + DELIMITER.len()).collect();
    Some(String::from_utf8_lossy(&drained[..position]).into_owned())
}

/// Opens `GET /tasks/{task_id}/events` and calls `on_event` for every parsed
/// event until the stream reaches a terminal event or simply closes (Core
/// restarting, network drop, ...). Returns the last task state actually
/// observed, so a caller can tell "genuinely finished" apart from
/// "connection dropped mid-flight" by comparing it against
/// [`TaskState::is_terminal`].
pub async fn watch_task(
    client: &CoreHttpClient,
    task_id: &str,
    mut on_event: impl FnMut(&TaskEvent),
) -> Result<Option<TaskState>, BridgeError> {
    let mut response = client
        .get_request_with_timeout(&format!("/tasks/{task_id}/events"), SSE_REQUEST_TIMEOUT)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
    }

    let mut buffer: Vec<u8> = Vec::new();
    let mut last_state: Option<TaskState> = None;

    while let Some(chunk) = response.chunk().await? {
        buffer.extend_from_slice(&chunk);

        while let Some(block) = extract_block(&mut buffer) {
            if block.trim().is_empty() {
                continue;
            }

            let (event_name, data) = parse_block(&block);
            match parse_task_event(&event_name, &data) {
                Ok(event) => {
                    if let TaskEvent::Snapshot(task) = &event {
                        last_state = Some(task.state);
                    }
                    on_event(&event);

                    if matches!(
                        event,
                        TaskEvent::Done | TaskEvent::Error(_) | TaskEvent::Timeout
                    ) {
                        return Ok(last_state);
                    }
                }
                Err(_) => {
                    eprintln!("[tasks] ignoring unrecognized SSE event: {event_name}");
                }
            }
        }
    }

    Ok(last_state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task_json(id: &str, state: &str) -> String {
        format!(
            r#"{{"id":"{id}","goal":"g","state":"{state}","steps":[],"error":null,
            "created_at":"c","updated_at":"u","validation_usage":null,"plan_revisions":0,
            "parent_task_id":null,"delegation_depth":0,"forced_role":null,"simulated":false}}"#
        )
    }

    #[test]
    fn parses_a_task_event_into_a_snapshot() {
        let data = task_json("t1", "running");

        let event = parse_task_event("task", &data).unwrap();

        assert!(
            matches!(event, TaskEvent::Snapshot(task) if task.id == "t1" && task.state == TaskState::Running)
        );
    }

    #[test]
    fn parses_a_done_event() {
        assert_eq!(parse_task_event("done", "").unwrap(), TaskEvent::Done);
    }

    #[test]
    fn parses_an_error_event_with_its_message() {
        let event = parse_task_event("error", "No such task: bogus").unwrap();

        assert_eq!(event, TaskEvent::Error("No such task: bogus".to_string()));
    }

    #[test]
    fn parses_a_timeout_event() {
        assert_eq!(parse_task_event("timeout", "").unwrap(), TaskEvent::Timeout);
    }

    #[test]
    fn rejects_an_unrecognized_event_name() {
        assert!(parse_task_event("mystery", "data").is_err());
    }

    #[test]
    fn rejects_malformed_task_json() {
        assert!(parse_task_event("task", "{not json").is_err());
    }

    #[test]
    fn parse_block_extracts_event_and_joined_multiline_data() {
        let block = "event: task\ndata: line one\ndata: line two";

        let (event_name, data) = parse_block(block);

        assert_eq!(event_name, "task");
        assert_eq!(data, "line one\nline two");
    }

    #[test]
    fn extract_block_leaves_a_trailing_partial_block_in_the_buffer() {
        let mut buffer = b"event: done\ndata: \n\nevent: tas".to_vec();

        let block = extract_block(&mut buffer).unwrap();

        assert_eq!(block, "event: done\ndata: ");
        assert_eq!(buffer, b"event: tas");
        assert!(extract_block(&mut buffer).is_none());
    }

    /// The one property neither `parse_task_event` nor `extract_block` in
    /// isolation can prove: that a real TCP read splitting a block anywhere
    /// (including mid-line, mid-JSON-string) still reassembles correctly.
    /// Mirrors `http.rs`'s real-`TcpListener` pattern rather than a mock.
    #[tokio::test]
    async fn watch_task_reassembles_an_sse_block_split_across_two_writes() {
        use std::io::{Read, Write};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request_buf = [0u8; 1024];
            let _ = stream.read(&mut request_buf);

            let headers =
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";
            let event_prefix = "event: task\ndata: {\"id\":\"t1\",\"goal\":\"g\",\"state\":\"run";
            let event_suffix = "ning\",\"steps\":[],\"error\":null,\"created_at\":\"c\",\"updated_at\":\"u\",\"validation_usage\":null,\"plan_revisions\":0,\"parent_task_id\":null,\"delegation_depth\":0,\"forced_role\":null,\"simulated\":false}\n\nevent: done\ndata: \n\n";

            stream
                .write_all(format!("{headers}{event_prefix}").as_bytes())
                .unwrap();
            stream.flush().unwrap();
            std::thread::sleep(Duration::from_millis(50));
            stream.write_all(event_suffix.as_bytes()).unwrap();
            stream.flush().unwrap();
        });

        let client = CoreHttpClient::new(format!("http://127.0.0.1:{port}"));
        let events = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events_for_callback = events.clone();

        let last_state = watch_task(&client, "t1", move |event: &TaskEvent| {
            events_for_callback.lock().unwrap().push(event.clone());
        })
        .await
        .unwrap();

        let recorded = events.lock().unwrap();
        assert_eq!(recorded.len(), 2, "expected exactly Snapshot + Done");
        assert!(
            matches!(&recorded[0], TaskEvent::Snapshot(task) if task.state == TaskState::Running)
        );
        assert_eq!(recorded[1], TaskEvent::Done);
        assert_eq!(last_state, Some(TaskState::Running));
    }
}

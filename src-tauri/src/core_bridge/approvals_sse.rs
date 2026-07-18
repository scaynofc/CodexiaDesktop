//! Hand-rolled SSE client for `GET /approvals/stream` - mirrors `sse.rs`'s
//! shape for `/tasks/{id}/events` exactly, sharing block-framing via
//! `sse_framing.rs`. See CodexiaCore's docs/adr/021-approval-aware-sse.md
//! and this repo's docs/adr/017-approval-awareness.md.

use std::time::Duration;

use super::approvals::Approval;
use super::error::BridgeError;
use super::http::CoreHttpClient;
use super::sse_framing::{extract_block, parse_block};

/// Same reasoning as `sse.rs`'s `SSE_REQUEST_TIMEOUT`: comfortably above
/// CodexiaCore's own `DEFAULT_MAX_WAIT_SECONDS` (300s) so the *server's*
/// `timeout` event fires first, not the client's blanket request timeout.
const SSE_REQUEST_TIMEOUT: Duration = Duration::from_secs(330);

#[derive(Debug, Clone, PartialEq)]
pub enum ApprovalStreamEvent {
    /// The full current pending-approvals list - sent whenever it changes,
    /// not per poll tick (CodexiaCore only emits on an actual diff).
    Snapshot(Vec<Approval>),
    /// No change within CodexiaCore's own wait budget - unlike a task
    /// stream, there's no terminal state to reach; the caller reopens the
    /// connection (the same reconnect-on-timeout convention `watch_task`
    /// already establishes).
    Timeout,
}

/// Pure decision logic - given one parsed SSE block's event name and data,
/// returns what it means. Unlike `parse_task_event`, there is no "error"
/// event: `GET /approvals/stream` has no invalid-id concept to reject (it
/// streams a list, not one resource), so CodexiaCore never emits one here.
pub fn parse_approval_stream_event(
    event_name: &str,
    data: &str,
) -> Result<ApprovalStreamEvent, BridgeError> {
    match event_name {
        "approvals" => {
            let approvals: Vec<Approval> =
                serde_json::from_str(data).map_err(|e| BridgeError::DecodeFailure(e.to_string()))?;
            Ok(ApprovalStreamEvent::Snapshot(approvals))
        }
        "timeout" => Ok(ApprovalStreamEvent::Timeout),
        other => Err(BridgeError::DecodeFailure(format!(
            "unrecognized SSE event type: {other}"
        ))),
    }
}

/// Opens `GET /approvals/stream` and calls `on_event` for every parsed
/// event until the stream times out or simply closes (Core restarting,
/// network drop, ...). Returns once the connection ends either way - the
/// caller (`services::approval_watch`) is responsible for reconnecting,
/// same division of responsibility `watch_task`'s own callers already use.
pub async fn watch_pending_approvals(
    client: &CoreHttpClient,
    mut on_event: impl FnMut(&ApprovalStreamEvent),
) -> Result<(), BridgeError> {
    let mut response = client
        .get_request_with_timeout("/approvals/stream", SSE_REQUEST_TIMEOUT)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
    }

    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = response.chunk().await? {
        buffer.extend_from_slice(&chunk);

        while let Some(block) = extract_block(&mut buffer) {
            if block.trim().is_empty() {
                continue;
            }

            let (event_name, data) = parse_block(&block);
            match parse_approval_stream_event(&event_name, &data) {
                Ok(event) => {
                    let is_timeout = matches!(event, ApprovalStreamEvent::Timeout);
                    on_event(&event);
                    if is_timeout {
                        return Ok(());
                    }
                }
                Err(_) => {
                    eprintln!("[approvals] ignoring unrecognized SSE event: {event_name}");
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::{ApprovalStatus, ApprovalType};

    fn approval_json(id: &str) -> String {
        format!(
            r#"{{"id":"{id}","task_id":null,"step_id":null,"type":"tool",
            "payload":{{"name":"write_file"}},"status":"pending","created_at":"c",
            "decided_at":null,"expires_at":null,"decision_reason":null}}"#
        )
    }

    #[test]
    fn parses_an_approvals_event_into_a_snapshot() {
        let data = format!("[{}]", approval_json("appr-1"));

        let event = parse_approval_stream_event("approvals", &data).unwrap();

        assert!(matches!(
            &event,
            ApprovalStreamEvent::Snapshot(approvals)
                if approvals.len() == 1
                && approvals[0].id == "appr-1"
                && approvals[0].approval_type == ApprovalType::Tool
                && approvals[0].status == ApprovalStatus::Pending
        ));
    }

    #[test]
    fn parses_an_empty_approvals_event() {
        let event = parse_approval_stream_event("approvals", "[]").unwrap();

        assert_eq!(event, ApprovalStreamEvent::Snapshot(Vec::new()));
    }

    #[test]
    fn parses_a_timeout_event() {
        assert_eq!(
            parse_approval_stream_event("timeout", "").unwrap(),
            ApprovalStreamEvent::Timeout
        );
    }

    #[test]
    fn rejects_an_unrecognized_event_name() {
        assert!(parse_approval_stream_event("mystery", "data").is_err());
    }

    #[test]
    fn rejects_malformed_approvals_json() {
        assert!(parse_approval_stream_event("approvals", "{not json").is_err());
    }

    /// The one property `parse_approval_stream_event` in isolation can't
    /// prove: that a real TCP read splitting a block anywhere (including
    /// mid-line, mid-JSON-string) still reassembles correctly. Mirrors
    /// sse.rs's own real-TcpListener test for watch_task.
    #[tokio::test]
    async fn watch_pending_approvals_reassembles_an_sse_block_split_across_two_writes() {
        use std::io::{Read, Write};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request_buf = [0u8; 1024];
            let _ = stream.read(&mut request_buf);

            let headers =
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";
            let event_prefix = "event: approvals\ndata: [{\"id\":\"appr-1\",\"task_id\":null,\"step_id\":null,\"type\":\"to";
            let event_suffix = "ol\",\"payload\":{\"name\":\"write_file\"},\"status\":\"pending\",\"created_at\":\"c\",\"decided_at\":null,\"expires_at\":null,\"decision_reason\":null}]\n\nevent: timeout\ndata: \n\n";

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

        watch_pending_approvals(&client, move |event: &ApprovalStreamEvent| {
            events_for_callback.lock().unwrap().push(event.clone());
        })
        .await
        .unwrap();

        let recorded = events.lock().unwrap();
        assert_eq!(recorded.len(), 2, "expected exactly Snapshot + Timeout");
        assert!(matches!(&recorded[0], ApprovalStreamEvent::Snapshot(a) if a.len() == 1));
        assert_eq!(recorded[1], ApprovalStreamEvent::Timeout);
    }
}

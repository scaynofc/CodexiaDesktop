//! SSE block framing, shared by every hand-rolled SSE client in this
//! module (`sse.rs` for `/tasks/{id}/events`, `approvals_sse.rs` for
//! `/approvals/stream`) - CodexiaCore's own encoder (`api/sse.py`'s
//! `format_sse`) only ever emits `event:`/`data:` lines, never
//! `id:`/`retry:`/comments, the same closed subset both clients only ever
//! need to handle. Extracted rather than duplicated once a second real
//! consumer needed the identical byte-buffer reassembly logic.

/// Splits one `event: ...\ndata: ...\n\n`-shaped block into (event name,
/// joined data). Mirrors CodexiaCore's own reference client-side parser
/// (`static/dashboard.html`'s inline block-splitting script) line for line.
pub(super) fn parse_block(block: &str) -> (String, String) {
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
/// to complete - necessary because a real TCP read can split a block
/// anywhere, including mid-line.
pub(super) fn extract_block(buffer: &mut Vec<u8>) -> Option<String> {
    const DELIMITER: &[u8] = b"\n\n";
    let position = buffer
        .windows(DELIMITER.len())
        .position(|window| window == DELIMITER)?;

    let drained: Vec<u8> = buffer.drain(..position + DELIMITER.len()).collect();
    Some(String::from_utf8_lossy(&drained[..position]).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}

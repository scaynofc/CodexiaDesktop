//! Project-memory wire types and one-shot HTTP calls for
//! `GET /projects/{id}/memory` and `DELETE /projects/{id}/memory/{key}`.
//! Mirrors CodexiaCore's `MemoryItem`/`MemoryItemType` field-for-field
//! (`models/memory_item.py`) - see CodexiaCore's ADR-014 and this repo's
//! docs/adr/011-memory-center-project-scoped-tasks.md. `embedding` is
//! deliberately not included in this struct - Desktop never renders it,
//! and it can be a real-sized vector; serde silently ignores an unmapped
//! JSON field on deserialize, so omitting it here is enough, no
//! CodexiaCore change needed.

use serde::{Deserialize, Serialize};

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryItemType {
    Fact,
    Pattern,
    Strategy,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryItem {
    pub id: String,
    pub project_id: String,
    pub key: String,
    pub value: String,
    #[serde(rename = "type")]
    pub item_type: MemoryItemType,
    pub version: u32,
    pub superseded_by: Option<String>,
    pub importance_score: f64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub source_session_id: Option<String>,
    #[serde(default)]
    pub access_count: u32,
    pub last_accessed_at: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ForgetResult {
    pub forgotten: u32,
}

/// Percent-encodes a single path segment (RFC 3986 unreserved characters
/// pass through unchanged, everything else becomes `%XX`) - `project_id`/
/// `key` are free-form, user-typed strings (unlike every other path
/// parameter this app builds, which is always a UUID hex task id), so
/// they need real encoding before landing in a URL path. Hand-rolled
/// rather than adding a URL-encoding crate: the unreserved-character rule
/// is small, fixed, and fully covers this case - the same "hand-roll
/// something this small" bias as `core_bridge::sse`'s parser.
fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

impl CoreHttpClient {
    pub async fn list_project_memory(
        &self,
        project_id: &str,
    ) -> Result<Vec<MemoryItem>, BridgeError> {
        let path = format!("/projects/{}/memory", encode_path_segment(project_id));
        let response = self.get_request(&path).send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response
            .json::<Vec<MemoryItem>>()
            .await
            .map_err(BridgeError::from)
    }

    pub async fn forget_project_memory(
        &self,
        project_id: &str,
        key: &str,
    ) -> Result<ForgetResult, BridgeError> {
        let path = format!(
            "/projects/{}/memory/{}",
            encode_path_segment(project_id),
            encode_path_segment(key)
        );
        let response = self.delete_request(&path).send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response
            .json::<ForgetResult>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_real_memory_item_ignoring_the_embedding_field() {
        let raw = r#"{
            "id": "item-1",
            "project_id": "proj-1",
            "key": "stack",
            "value": "FastAPI + SQLite",
            "type": "fact",
            "version": 1,
            "superseded_by": null,
            "importance_score": 0.8,
            "tags": ["backend"],
            "source_session_id": null,
            "access_count": 3,
            "last_accessed_at": "2026-07-17T00:00:00+00:00",
            "embedding": [0.1, 0.2, 0.3, 0.4],
            "expires_at": null,
            "created_at": "2026-07-16T00:00:00+00:00",
            "updated_at": "2026-07-16T00:00:00+00:00"
        }"#;

        let item: MemoryItem = serde_json::from_str(raw).unwrap();

        assert_eq!(item.key, "stack");
        assert_eq!(item.value, "FastAPI + SQLite");
        assert_eq!(item.item_type, MemoryItemType::Fact);
        assert_eq!(item.tags, vec!["backend".to_string()]);
        assert_eq!(item.importance_score, 0.8);
    }

    #[test]
    fn forget_result_deserializes() {
        let raw = r#"{"forgotten": 2}"#;

        let result: ForgetResult = serde_json::from_str(raw).unwrap();

        assert_eq!(result.forgotten, 2);
    }

    #[test]
    fn encode_path_segment_leaves_unreserved_characters_untouched() {
        assert_eq!(encode_path_segment("proj-1_test.v2~x"), "proj-1_test.v2~x");
    }

    #[test]
    fn encode_path_segment_percent_encodes_spaces_and_slashes() {
        assert_eq!(encode_path_segment("my project/v1"), "my%20project%2Fv1");
    }
}

//! System-event wire types and the one-shot `GET /events` call. Mirrors
//! CodexiaCore's `SystemEvent`/`SystemEventType`/`SystemEventSource`
//! field-for-field (`models/event.py`) - see CodexiaCore's ADR-015 and
//! this repo's docs/adr/012-log-center-derived-events.md.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemEventType {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemEventSource {
    Task,
    Provider,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemEvent {
    pub timestamp: String,
    #[serde(rename = "type")]
    pub event_type: SystemEventType,
    pub source: SystemEventSource,
    pub message: String,
    pub task_id: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl CoreHttpClient {
    pub async fn get_events(&self, limit: u32) -> Result<Vec<SystemEvent>, BridgeError> {
        let path = format!("/events?limit={limit}");
        let response = self.get_request(&path).send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response
            .json::<Vec<SystemEvent>>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_task_sourced_error_event() {
        let raw = r#"{
            "timestamp": "2026-07-17T00:00:00+00:00",
            "type": "error",
            "source": "task",
            "message": "'Ship a login page.' - step 1: step_failed (boom)",
            "task_id": "task-1",
            "metadata": {"kind": "step_failed", "step_number": "1"}
        }"#;

        let event: SystemEvent = serde_json::from_str(raw).unwrap();

        assert_eq!(event.event_type, SystemEventType::Error);
        assert_eq!(event.source, SystemEventSource::Task);
        assert_eq!(event.task_id.as_deref(), Some("task-1"));
        assert_eq!(
            event.metadata.get("kind").map(String::as_str),
            Some("step_failed")
        );
    }

    #[test]
    fn deserializes_a_provider_sourced_warning_event_with_no_task_id() {
        let raw = r#"{
            "timestamp": "2026-07-17T00:00:00+00:00",
            "type": "warning",
            "source": "provider",
            "message": "openrouter/model-a failed (rate_limit)",
            "task_id": null,
            "metadata": {"provider": "openrouter", "model": "model-a", "failure_kind": "rate_limit"}
        }"#;

        let event: SystemEvent = serde_json::from_str(raw).unwrap();

        assert_eq!(event.event_type, SystemEventType::Warning);
        assert_eq!(event.source, SystemEventSource::Provider);
        assert_eq!(event.task_id, None);
    }

    #[test]
    fn deserializes_an_event_with_no_metadata_key_at_all() {
        // Faz 44's SystemEvent.metadata defaults to {} server-side, but
        // still always serializes - this just confirms #[serde(default)]
        // tolerates a future/hypothetical omission too.
        let raw = r#"{
            "timestamp": "2026-07-17T00:00:00+00:00",
            "type": "info",
            "source": "task",
            "message": "m",
            "task_id": null
        }"#;

        let event: SystemEvent = serde_json::from_str(raw).unwrap();

        assert!(event.metadata.is_empty());
    }
}

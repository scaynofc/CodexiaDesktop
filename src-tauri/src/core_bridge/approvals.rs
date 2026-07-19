//! Approval wire types and one-shot HTTP calls for `GET /approvals/pending`,
//! `POST /approvals/{id}/approve`, `POST /approvals/{id}/reject`. Mirrors
//! CodexiaCore's `Approval`/`ApprovalType`/`ApprovalStatus` field-for-field
//! (`models/approval.py`, `models/enums.py`) - see CodexiaCore's
//! docs/adr/017-approval-system.md and this repo's
//! docs/adr/014-approval-center-human-in-the-loop.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalType {
    Tool,
    Memory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
    Cancelled,
}

impl ApprovalStatus {
    /// The lowercase wire value CodexiaCore's `?status=` query param expects
    /// (`GET /approvals`) - matches this enum's own `#[serde(rename_all)]`
    /// mapping, kept as an explicit match rather than reusing the Serialize
    /// impl so a query-string value never picks up JSON quoting.
    fn as_query_value(self) -> &'static str {
        match self {
            ApprovalStatus::Pending => "pending",
            ApprovalStatus::Approved => "approved",
            ApprovalStatus::Rejected => "rejected",
            ApprovalStatus::Expired => "expired",
            ApprovalStatus::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Approval {
    pub id: String,
    pub task_id: Option<String>,
    pub step_id: Option<u32>,
    /// `type` is a Rust reserved word - same rename precedent as
    /// `core_bridge::events::SystemEvent.event_type`.
    #[serde(rename = "type")]
    pub approval_type: ApprovalType,
    /// Untyped on the wire - CodexiaCore's own `Approval.payload` is a
    /// plain `dict[str, Any]` whose shape varies by `approval_type` (a tool
    /// call's name/arguments vs. a memory write's key/value), and this app
    /// only ever displays it, never acts on its shape. First use of
    /// `serde_json::Value` as a field type in this codebase.
    pub payload: Value,
    pub status: ApprovalStatus,
    pub created_at: String,
    pub decided_at: Option<String>,
    pub expires_at: Option<String>,
    pub decision_reason: Option<String>,
}

#[derive(Serialize)]
struct ApprovalDecisionRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'a str>,
}

/// Pure query-param builder for `GET /approvals`, kept separate from
/// `list_approval_history` below so the actual param shape (limit always
/// present, status only when filtering) is directly unit-testable without
/// a network call.
fn history_query_params(status: Option<ApprovalStatus>, limit: u32) -> Vec<(&'static str, String)> {
    let mut params = vec![("limit", limit.to_string())];
    if let Some(status) = status {
        params.push(("status", status.as_query_value().to_string()));
    }
    params
}

impl CoreHttpClient {
    pub async fn list_pending_approvals(&self) -> Result<Vec<Approval>, BridgeError> {
        let response = self.get_request("/approvals/pending").send().await?;
        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response
            .json::<Vec<Approval>>()
            .await
            .map_err(BridgeError::from)
    }

    /// `GET /approvals` - every approval regardless of status (newest
    /// request first), optionally narrowed to one via `status`. Distinct
    /// from `list_pending_approvals` (`/approvals/pending`, pending-only) -
    /// see CodexiaCore's docs/adr/022-approval-history.md and this repo's
    /// docs/adr/020-approval-history-view.md.
    pub async fn list_approval_history(
        &self,
        status: Option<ApprovalStatus>,
        limit: u32,
    ) -> Result<Vec<Approval>, BridgeError> {
        let response = self
            .get_request("/approvals")
            .query(&history_query_params(status, limit))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response
            .json::<Vec<Approval>>()
            .await
            .map_err(BridgeError::from)
    }

    pub async fn approve_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        let body = ApprovalDecisionRequest { reason };
        let response = self
            .post_request(&format!("/approvals/{approval_id}/approve"))
            .json(&body)
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response.json::<Approval>().await.map_err(BridgeError::from)
    }

    pub async fn reject_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        let body = ApprovalDecisionRequest { reason };
        let response = self
            .post_request(&format!("/approvals/{approval_id}/reject"))
            .json(&body)
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response.json::<Approval>().await.map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_real_pending_tool_approval() {
        let raw = r#"{
            "id": "appr-1",
            "task_id": "task-1",
            "step_id": 2,
            "type": "tool",
            "payload": {"name": "write_file", "arguments": {"path": "out.txt"}},
            "status": "pending",
            "created_at": "2026-07-18T00:00:00+00:00",
            "decided_at": null,
            "expires_at": "2026-07-18T00:02:00+00:00",
            "decision_reason": null
        }"#;

        let approval: Approval = serde_json::from_str(raw).unwrap();

        assert_eq!(approval.id, "appr-1");
        assert_eq!(approval.task_id, Some("task-1".to_string()));
        assert_eq!(approval.step_id, Some(2));
        assert_eq!(approval.approval_type, ApprovalType::Tool);
        assert_eq!(approval.payload["name"], "write_file");
        assert_eq!(approval.status, ApprovalStatus::Pending);
        assert_eq!(approval.decided_at, None);
    }

    #[test]
    fn deserializes_a_decided_memory_approval_with_a_reason() {
        let raw = r#"{
            "id": "appr-2",
            "task_id": null,
            "step_id": null,
            "type": "memory",
            "payload": {"key": "stack", "value": "FastAPI"},
            "status": "rejected",
            "created_at": "2026-07-18T00:00:00+00:00",
            "decided_at": "2026-07-18T00:01:00+00:00",
            "expires_at": null,
            "decision_reason": "Looks wrong"
        }"#;

        let approval: Approval = serde_json::from_str(raw).unwrap();

        assert_eq!(approval.approval_type, ApprovalType::Memory);
        assert_eq!(approval.status, ApprovalStatus::Rejected);
        assert_eq!(approval.decision_reason, Some("Looks wrong".to_string()));
        assert_eq!(approval.task_id, None);
    }

    #[test]
    fn approval_type_and_status_serialize_to_lowercase() {
        assert_eq!(
            serde_json::to_string(&ApprovalType::Tool).unwrap(),
            "\"tool\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalStatus::Expired).unwrap(),
            "\"expired\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalStatus::Cancelled).unwrap(),
            "\"cancelled\""
        );
    }

    #[test]
    fn approval_decision_request_omits_reason_when_none() {
        let body = ApprovalDecisionRequest { reason: None };

        let json = serde_json::to_value(&body).unwrap();

        assert!(!json.as_object().unwrap().contains_key("reason"));
    }

    #[test]
    fn approval_decision_request_includes_reason_when_set() {
        let body = ApprovalDecisionRequest {
            reason: Some("Looks fine"),
        };

        let json = serde_json::to_value(&body).unwrap();

        assert_eq!(json["reason"], "Looks fine");
    }

    #[test]
    fn history_query_params_always_includes_limit_and_omits_status_when_unset() {
        let params = history_query_params(None, 100);

        assert_eq!(params, vec![("limit", "100".to_string())]);
    }

    #[test]
    fn history_query_params_includes_status_when_filtering() {
        let params = history_query_params(Some(ApprovalStatus::Rejected), 50);

        assert_eq!(
            params,
            vec![("limit", "50".to_string()), ("status", "rejected".to_string())]
        );
    }

    #[test]
    fn deserializes_a_real_approval_history_list_with_mixed_statuses() {
        let raw = r#"[
            {
                "id": "appr-3", "task_id": "task-2", "step_id": 1, "type": "tool",
                "payload": {"name": "run_command"}, "status": "cancelled",
                "created_at": "2026-07-18T00:00:00+00:00",
                "decided_at": "2026-07-18T00:00:05+00:00", "expires_at": null,
                "decision_reason": "Task was cancelled."
            },
            {
                "id": "appr-4", "task_id": null, "step_id": null, "type": "memory",
                "payload": {"key": "stack"}, "status": "approved",
                "created_at": "2026-07-17T00:00:00+00:00",
                "decided_at": "2026-07-17T00:00:10+00:00", "expires_at": null,
                "decision_reason": null
            }
        ]"#;

        let approvals: Vec<Approval> = serde_json::from_str(raw).unwrap();

        assert_eq!(approvals.len(), 2);
        assert_eq!(approvals[0].status, ApprovalStatus::Cancelled);
        assert_eq!(approvals[1].status, ApprovalStatus::Approved);
    }
}

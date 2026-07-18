//! Task-related wire types and one-shot HTTP calls. Mirrors CodexiaCore's
//! `Task`/`TaskStep`/`TimelineEvent`/`Usage` models and `TaskState` enum
//! field-for-field (`src/codexia/models/task.py`, `models/enums.py`,
//! `models/usage.py`) - no renames needed except the enum, since Pydantic's
//! snake_case JSON already matches serde's default.

use serde::{Deserialize, Serialize};

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskState {
    Pending,
    Running,
    Blocked,
    Done,
    Failed,
    Cancelling,
    Cancelled,
}

impl TaskState {
    /// Mirrors CodexiaCore's own `sse.py` `TERMINAL_STATES` - a task in one
    /// of these states will not change further on its own.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            TaskState::Done | TaskState::Failed | TaskState::Blocked | TaskState::Cancelled
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: Option<u64>,
    pub completion_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub estimated_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub timestamp: String,
    pub kind: String,
    #[serde(default)]
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskStep {
    pub number: u32,
    pub description: String,
    pub state: TaskState,
    pub result: Option<String>,
    pub error: Option<String>,
    pub usage: Option<Usage>,
    #[serde(default)]
    pub reflection_attempts: u32,
    pub critique: Option<String>,
    #[serde(default)]
    pub depends_on: Vec<u32>,
    pub team: Option<String>,
    #[serde(default)]
    pub events: Vec<TimelineEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub goal: String,
    pub state: TaskState,
    #[serde(default)]
    pub steps: Vec<TaskStep>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub validation_usage: Option<Usage>,
    #[serde(default)]
    pub plan_revisions: u32,
    pub parent_task_id: Option<String>,
    #[serde(default)]
    pub delegation_depth: u32,
    /// A `RoleType` (`str, Enum`) on the wire - kept as a plain string since
    /// Desktop only ever displays it, never acts on its value.
    pub forced_role: Option<String>,
    #[serde(default)]
    pub simulated: bool,
    /// Faz 43 in CodexiaCore: the governed-project-memory scope this task
    /// ran under, `None` when project memory was disabled - see
    /// docs/adr/011-memory-center-project-scoped-tasks.md.
    #[serde(default)]
    pub project_id: Option<String>,
}

/// What CodexiaCore returns from `POST /tasks` and `POST /tasks/{id}/resume`
/// when `background: true` - which Desktop always sends, so this is the
/// *only* shape Desktop ever receives from those two endpoints (the full
/// `Task` body only comes back for the synchronous, non-background path,
/// which this client never takes).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskCreated {
    pub task_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CancelResult {
    pub cancelled: bool,
}

#[derive(Serialize)]
struct CreateTaskRequest<'a> {
    goal: &'a str,
    require_approval: bool,
    /// Always `true` - deliberately not a parameter anywhere in this API.
    /// CodexiaCore's synchronous (`background: false`) path blocks the HTTP
    /// request until the entire task finishes, which a GUI must never do.
    background: bool,
    simulate: bool,
    /// Faz 43 in CodexiaCore: enables governed project memory for this
    /// task (CLI: `--project`) - `None` (the default, omitted from every
    /// pre-existing call) matches project memory being disabled, same as
    /// the CLI's `--project` being left unset.
    #[serde(skip_serializing_if = "Option::is_none")]
    project_id: Option<&'a str>,
    /// Approval System phase in CodexiaCore: gates individual tool
    /// calls/memory writes through the Approval Center instead of denying
    /// them outright, while execution continues - a different,
    /// independently-usable gate from `require_approval` above (which
    /// blocks the whole task up front). Always sent (matching
    /// `require_approval`/`simulate`'s own plain-bool shape, not
    /// `Option`) - `false` is CodexiaCore's own default for an omitted
    /// field, so sending it explicitly changes nothing for a caller that
    /// leaves the new Approval Center checkbox unchecked.
    enable_approval_queue: bool,
}

impl CoreHttpClient {
    pub async fn list_tasks(&self) -> Result<Vec<Task>, BridgeError> {
        let response = self.get_request("/tasks").send().await?;
        Self::json_or_status_error(response).await
    }

    pub async fn get_task(&self, task_id: &str) -> Result<Task, BridgeError> {
        let response = self
            .get_request(&format!("/tasks/{task_id}"))
            .send()
            .await?;
        Self::json_or_status_error(response).await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_task(
        &self,
        goal: &str,
        require_approval: bool,
        simulate: bool,
        project_id: Option<&str>,
        enable_approval_queue: bool,
    ) -> Result<TaskCreated, BridgeError> {
        let body = CreateTaskRequest {
            goal,
            require_approval,
            background: true,
            simulate,
            project_id,
            enable_approval_queue,
        };
        let response = self.post_request("/tasks").json(&body).send().await?;
        Self::json_or_status_error(response).await
    }

    pub async fn resume_task(&self, task_id: &str) -> Result<TaskCreated, BridgeError> {
        let response = self
            .post_request(&format!("/tasks/{task_id}/resume?background=true"))
            .send()
            .await?;
        Self::json_or_status_error(response).await
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<CancelResult, BridgeError> {
        let response = self
            .post_request(&format!("/tasks/{task_id}/cancel"))
            .send()
            .await?;
        Self::json_or_status_error(response).await
    }

    async fn json_or_status_error<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T, BridgeError> {
        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }
        response.json::<T>().await.map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_real_multi_step_task_with_nested_steps_and_events() {
        let raw = r#"{
            "id": "task-1",
            "goal": "Write a haiku about Rust",
            "state": "running",
            "steps": [
                {
                    "number": 1,
                    "description": "Draft the haiku",
                    "state": "done",
                    "result": "Borrowed lines compile...",
                    "error": null,
                    "usage": {
                        "prompt_tokens": 120,
                        "completion_tokens": 40,
                        "total_tokens": 160,
                        "estimated_cost_usd": 0.002
                    },
                    "reflection_attempts": 1,
                    "critique": "Good rhythm.",
                    "depends_on": [],
                    "team": null,
                    "events": [
                        {"timestamp": "2026-07-16T00:00:00+00:00", "kind": "step_started", "detail": ""},
                        {"timestamp": "2026-07-16T00:00:02+00:00", "kind": "step_done", "detail": "ok"}
                    ]
                },
                {
                    "number": 2,
                    "description": "Polish the haiku",
                    "state": "running",
                    "result": null,
                    "error": null,
                    "usage": null,
                    "reflection_attempts": 0,
                    "critique": null,
                    "depends_on": [1],
                    "team": null,
                    "events": []
                }
            ],
            "error": null,
            "created_at": "2026-07-16T00:00:00+00:00",
            "updated_at": "2026-07-16T00:00:02+00:00",
            "validation_usage": null,
            "plan_revisions": 0,
            "parent_task_id": null,
            "delegation_depth": 0,
            "forced_role": null,
            "simulated": false
        }"#;

        let task: Task = serde_json::from_str(raw).unwrap();

        assert_eq!(task.id, "task-1");
        assert_eq!(task.state, TaskState::Running);
        assert_eq!(task.steps.len(), 2);
        assert_eq!(task.steps[0].state, TaskState::Done);
        assert_eq!(task.steps[0].events.len(), 2);
        assert_eq!(
            task.steps[0].usage.as_ref().unwrap().total_tokens,
            Some(160)
        );
        assert_eq!(task.steps[1].depends_on, vec![1]);
        assert!(!task.simulated);
        // Older-shape JSON (no project_id key at all, Faz 43 in CodexiaCore
        // predates it) still deserializes, defaulting to None.
        assert_eq!(task.project_id, None);
    }

    #[test]
    fn deserializes_a_task_with_a_project_id_set() {
        let raw = r#"{
            "id": "task-1", "goal": "g", "state": "done", "steps": [], "error": null,
            "created_at": "c", "updated_at": "u", "validation_usage": null, "plan_revisions": 0,
            "parent_task_id": null, "delegation_depth": 0, "forced_role": null, "simulated": false,
            "project_id": "proj-1"
        }"#;

        let task: Task = serde_json::from_str(raw).unwrap();

        assert_eq!(task.project_id, Some("proj-1".to_string()));
    }

    #[test]
    fn create_task_request_omits_project_id_when_none() {
        let body = CreateTaskRequest {
            goal: "g",
            require_approval: false,
            background: true,
            simulate: false,
            project_id: None,
            enable_approval_queue: false,
        };

        let json = serde_json::to_value(&body).unwrap();

        assert!(!json.as_object().unwrap().contains_key("project_id"));
    }

    #[test]
    fn create_task_request_includes_project_id_when_set() {
        let body = CreateTaskRequest {
            goal: "g",
            require_approval: false,
            background: true,
            simulate: false,
            project_id: Some("proj-1"),
            enable_approval_queue: false,
        };

        let json = serde_json::to_value(&body).unwrap();

        assert_eq!(json["project_id"], "proj-1");
    }

    #[test]
    fn create_task_request_always_includes_enable_approval_queue() {
        let body = CreateTaskRequest {
            goal: "g",
            require_approval: false,
            background: true,
            simulate: false,
            project_id: None,
            enable_approval_queue: true,
        };

        let json = serde_json::to_value(&body).unwrap();

        assert_eq!(json["enable_approval_queue"], true);
    }

    #[test]
    fn task_created_deserializes_the_background_response_shape() {
        let raw = r#"{"task_id": "task-1"}"#;

        let created: TaskCreated = serde_json::from_str(raw).unwrap();

        assert_eq!(created.task_id, "task-1");
    }

    #[test]
    fn task_state_is_terminal_matches_codexia_cores_sse_terminal_states() {
        assert!(TaskState::Done.is_terminal());
        assert!(TaskState::Failed.is_terminal());
        assert!(TaskState::Blocked.is_terminal());
        assert!(TaskState::Cancelled.is_terminal());
        assert!(!TaskState::Pending.is_terminal());
        assert!(!TaskState::Running.is_terminal());
        assert!(!TaskState::Cancelling.is_terminal());
    }

    #[test]
    fn task_state_serializes_to_lowercase_matching_the_wire_format() {
        assert_eq!(
            serde_json::to_string(&TaskState::Blocked).unwrap(),
            "\"blocked\""
        );
        assert_eq!(
            serde_json::to_string(&TaskState::Cancelling).unwrap(),
            "\"cancelling\""
        );
    }
}

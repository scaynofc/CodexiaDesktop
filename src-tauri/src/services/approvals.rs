//! Owns Approval Center's behavior: listing pending approvals and
//! deciding them via CodexiaCore. Deliberately thin, no shared state, no
//! background poll loop - polling here is screen-scoped (only while
//! Approval Center is the active screen), owned by the frontend itself via
//! a plain `useEffect`/`setInterval`, not a Rust background loop (unlike
//! `connectionStore`/`taskStore`, which are always-on regardless of the
//! active screen) - see docs/adr/014-approval-center-human-in-the-loop.md.

use crate::core_bridge::{Approval, BridgeError, CoreHttpClient};

/// What Core Bridge exposes for approvals - a trait (not the concrete
/// `CoreHttpClient`) so these functions can be tested with a scripted
/// fake, mirroring `services::memory`'s `ProjectMemoryClient`.
pub trait ApprovalClient: Send + Sync {
    fn list_pending_approvals(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<Approval>, BridgeError>> + Send;

    fn approve_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> impl std::future::Future<Output = Result<Approval, BridgeError>> + Send;

    fn reject_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> impl std::future::Future<Output = Result<Approval, BridgeError>> + Send;
}

impl ApprovalClient for CoreHttpClient {
    async fn list_pending_approvals(&self) -> Result<Vec<Approval>, BridgeError> {
        CoreHttpClient::list_pending_approvals(self).await
    }

    async fn approve_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        CoreHttpClient::approve_approval(self, approval_id, reason).await
    }

    async fn reject_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        CoreHttpClient::reject_approval(self, approval_id, reason).await
    }
}

impl<C: ApprovalClient> ApprovalClient for std::sync::Arc<C> {
    async fn list_pending_approvals(&self) -> Result<Vec<Approval>, BridgeError> {
        C::list_pending_approvals(self).await
    }

    async fn approve_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        C::approve_approval(self, approval_id, reason).await
    }

    async fn reject_approval(
        &self,
        approval_id: &str,
        reason: Option<&str>,
    ) -> Result<Approval, BridgeError> {
        C::reject_approval(self, approval_id, reason).await
    }
}

/// Fetches the current pending approvals - called on Approval Center's
/// mount and by its poll interval while the screen stays active.
pub async fn fetch_pending_approvals<C: ApprovalClient>(
    client: &C,
) -> Result<Vec<Approval>, BridgeError> {
    client.list_pending_approvals().await
}

/// Approves an approval, then re-fetches the pending list so the caller
/// gets a consistent post-decision snapshot in one round trip - mirrors
/// `services::memory::forget_and_refresh`'s "act, then refresh" shape. A
/// decided approval drops out of `GET /approvals/pending` on its own, so
/// no client-side filtering is needed here.
pub async fn approve_and_refresh<C: ApprovalClient>(
    client: &C,
    approval_id: &str,
    reason: Option<&str>,
) -> Result<Vec<Approval>, BridgeError> {
    client.approve_approval(approval_id, reason).await?;
    fetch_pending_approvals(client).await
}

/// Rejects an approval, then re-fetches the pending list - same shape as
/// [`approve_and_refresh`].
pub async fn reject_and_refresh<C: ApprovalClient>(
    client: &C,
    approval_id: &str,
    reason: Option<&str>,
) -> Result<Vec<Approval>, BridgeError> {
    client.reject_approval(approval_id, reason).await?;
    fetch_pending_approvals(client).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::{ApprovalStatus, ApprovalType};
    use std::sync::Mutex;

    fn approval(id: &str) -> Approval {
        Approval {
            id: id.to_string(),
            task_id: Some("task-1".to_string()),
            step_id: Some(1),
            approval_type: ApprovalType::Tool,
            payload: serde_json::json!({"name": "write_file"}),
            status: ApprovalStatus::Pending,
            created_at: "c".to_string(),
            decided_at: None,
            expires_at: None,
            decision_reason: None,
        }
    }

    struct ScriptedClient {
        list_responses: Mutex<std::vec::IntoIter<Result<Vec<Approval>, BridgeError>>>,
        decide_response: Result<Approval, BridgeError>,
        approved_calls: Mutex<Vec<(String, Option<String>)>>,
        rejected_calls: Mutex<Vec<(String, Option<String>)>>,
    }

    impl ScriptedClient {
        fn new(list_responses: Vec<Result<Vec<Approval>, BridgeError>>) -> Self {
            Self {
                list_responses: Mutex::new(list_responses.into_iter()),
                decide_response: Ok(approval("appr-1")),
                approved_calls: Mutex::new(Vec::new()),
                rejected_calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl ApprovalClient for ScriptedClient {
        async fn list_pending_approvals(&self) -> Result<Vec<Approval>, BridgeError> {
            self.list_responses
                .lock()
                .unwrap()
                .next()
                .unwrap_or(Ok(Vec::new()))
        }

        async fn approve_approval(
            &self,
            approval_id: &str,
            reason: Option<&str>,
        ) -> Result<Approval, BridgeError> {
            self.approved_calls
                .lock()
                .unwrap()
                .push((approval_id.to_string(), reason.map(str::to_string)));
            self.decide_response.clone()
        }

        async fn reject_approval(
            &self,
            approval_id: &str,
            reason: Option<&str>,
        ) -> Result<Approval, BridgeError> {
            self.rejected_calls
                .lock()
                .unwrap()
                .push((approval_id.to_string(), reason.map(str::to_string)));
            self.decide_response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_pending_approvals_returns_whatever_the_client_provides() {
        let client = ScriptedClient::new(vec![Ok(vec![approval("appr-1")])]);

        let approvals = fetch_pending_approvals(&client).await.unwrap();

        assert_eq!(approvals.len(), 1);
        assert_eq!(approvals[0].id, "appr-1");
    }

    #[tokio::test]
    async fn fetch_pending_approvals_propagates_a_transport_error() {
        let client = ScriptedClient::new(vec![Err(BridgeError::ConnectionRefused)]);

        let result = fetch_pending_approvals(&client).await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }

    #[tokio::test]
    async fn approve_and_refresh_calls_approve_then_returns_the_refreshed_list() {
        let client = ScriptedClient::new(vec![Ok(vec![approval("appr-2")])]);

        let approvals = approve_and_refresh(&client, "appr-1", Some("Looks fine"))
            .await
            .unwrap();

        assert_eq!(
            client.approved_calls.lock().unwrap().as_slice(),
            [("appr-1".to_string(), Some("Looks fine".to_string()))]
        );
        assert_eq!(approvals.len(), 1);
        assert_eq!(approvals[0].id, "appr-2");
    }

    #[tokio::test]
    async fn reject_and_refresh_calls_reject_then_returns_the_refreshed_list() {
        let client = ScriptedClient::new(vec![Ok(Vec::new())]);

        let approvals = reject_and_refresh(&client, "appr-1", None).await.unwrap();

        assert_eq!(
            client.rejected_calls.lock().unwrap().as_slice(),
            [("appr-1".to_string(), None)]
        );
        assert!(approvals.is_empty());
    }
}

//! Owns Memory Center's behavior: listing and forgetting a project's
//! governed-memory items via CodexiaCore. Deliberately thin, no shared
//! state, no poll loop - same reasoning as `services::metrics`/
//! `services::runtime`: memory only changes as a side effect of a task
//! actually running (or an explicit forget), so there's no independent
//! event source to poll for. See
//! docs/adr/011-memory-center-project-scoped-tasks.md.

use crate::core_bridge::{BridgeError, CoreHttpClient, ForgetResult, MemoryItem};

/// What Core Bridge exposes for project memory - a trait (not the
/// concrete `CoreHttpClient`) so these functions can be tested with a
/// scripted fake, mirroring `services::metrics`'s `MetricsFetcher`.
pub trait ProjectMemoryClient: Send + Sync {
    fn list_project_memory(
        &self,
        project_id: &str,
    ) -> impl std::future::Future<Output = Result<Vec<MemoryItem>, BridgeError>> + Send;

    fn forget_project_memory(
        &self,
        project_id: &str,
        key: &str,
    ) -> impl std::future::Future<Output = Result<ForgetResult, BridgeError>> + Send;
}

impl ProjectMemoryClient for CoreHttpClient {
    async fn list_project_memory(&self, project_id: &str) -> Result<Vec<MemoryItem>, BridgeError> {
        CoreHttpClient::list_project_memory(self, project_id).await
    }

    async fn forget_project_memory(
        &self,
        project_id: &str,
        key: &str,
    ) -> Result<ForgetResult, BridgeError> {
        CoreHttpClient::forget_project_memory(self, project_id, key).await
    }
}

impl<C: ProjectMemoryClient> ProjectMemoryClient for std::sync::Arc<C> {
    async fn list_project_memory(&self, project_id: &str) -> Result<Vec<MemoryItem>, BridgeError> {
        C::list_project_memory(self, project_id).await
    }

    async fn forget_project_memory(
        &self,
        project_id: &str,
        key: &str,
    ) -> Result<ForgetResult, BridgeError> {
        C::forget_project_memory(self, project_id, key).await
    }
}

/// Fetches the current memory items for a project - called on Memory
/// Center's mount/project-id change and by its "Refresh" button.
pub async fn fetch_project_memory<C: ProjectMemoryClient>(
    client: &C,
    project_id: &str,
) -> Result<Vec<MemoryItem>, BridgeError> {
    client.list_project_memory(project_id).await
}

/// Forgets a key, then re-fetches the list so the caller gets a
/// consistent post-delete snapshot in one round trip - mirrors
/// `services::tasks`'s create/resume/cancel "act, then refresh" shape.
pub async fn forget_and_refresh<C: ProjectMemoryClient>(
    client: &C,
    project_id: &str,
    key: &str,
) -> Result<Vec<MemoryItem>, BridgeError> {
    client.forget_project_memory(project_id, key).await?;
    fetch_project_memory(client, project_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::MemoryItemType;
    use std::sync::Mutex;

    fn item(key: &str) -> MemoryItem {
        MemoryItem {
            id: "item-1".to_string(),
            project_id: "proj-1".to_string(),
            key: key.to_string(),
            value: "some value".to_string(),
            item_type: MemoryItemType::Fact,
            version: 1,
            superseded_by: None,
            importance_score: 0.5,
            tags: Vec::new(),
            source_session_id: None,
            access_count: 0,
            last_accessed_at: None,
            expires_at: None,
            created_at: "c".to_string(),
            updated_at: "u".to_string(),
        }
    }

    struct ScriptedClient {
        list_responses: Mutex<std::vec::IntoIter<Result<Vec<MemoryItem>, BridgeError>>>,
        forget_response: Result<ForgetResult, BridgeError>,
        forgotten_calls: Mutex<Vec<(String, String)>>,
    }

    impl ScriptedClient {
        fn new(list_responses: Vec<Result<Vec<MemoryItem>, BridgeError>>) -> Self {
            Self {
                list_responses: Mutex::new(list_responses.into_iter()),
                forget_response: Ok(ForgetResult { forgotten: 1 }),
                forgotten_calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl ProjectMemoryClient for ScriptedClient {
        async fn list_project_memory(
            &self,
            _project_id: &str,
        ) -> Result<Vec<MemoryItem>, BridgeError> {
            self.list_responses
                .lock()
                .unwrap()
                .next()
                .unwrap_or(Ok(Vec::new()))
        }

        async fn forget_project_memory(
            &self,
            project_id: &str,
            key: &str,
        ) -> Result<ForgetResult, BridgeError> {
            self.forgotten_calls
                .lock()
                .unwrap()
                .push((project_id.to_string(), key.to_string()));
            self.forget_response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_project_memory_returns_whatever_the_client_provides() {
        let client = ScriptedClient::new(vec![Ok(vec![item("stack")])]);

        let items = fetch_project_memory(&client, "proj-1").await.unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].key, "stack");
    }

    #[tokio::test]
    async fn fetch_project_memory_propagates_a_transport_error() {
        let client = ScriptedClient::new(vec![Err(BridgeError::ConnectionRefused)]);

        let result = fetch_project_memory(&client, "proj-1").await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }

    #[tokio::test]
    async fn forget_and_refresh_calls_forget_then_returns_the_refreshed_list() {
        let client = ScriptedClient::new(vec![Ok(vec![item("kept")])]);

        let items = forget_and_refresh(&client, "proj-1", "stack")
            .await
            .unwrap();

        assert_eq!(
            client.forgotten_calls.lock().unwrap().as_slice(),
            [("proj-1".to_string(), "stack".to_string())]
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].key, "kept");
    }
}

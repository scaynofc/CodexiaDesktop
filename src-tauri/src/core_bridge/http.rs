//! Pure transport: one-shot HTTP calls to Codexia Core. No retry loop, no
//! polling, no interpretation of what a failure means - see `error.rs` and
//! the module docstring in `mod.rs`.

use std::sync::RwLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::error::BridgeError;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HealthResponse {
    pub status: String,
    pub alive: bool,
    pub core_version: String,
    pub api_version: u32,
    pub protocol_version: u32,
    pub instance_id: String,
    pub timestamp: String,
}

/// `base_url`/`bearer_token` are `RwLock`, not plain fields - Phase 11
/// (Settings) needs to change Core's connection URL/token at runtime, on
/// the same shared `Arc<CoreHttpClient>` every command and the background
/// connection-poll loop already hold, with no app restart and no
/// re-`app.manage()` (Tauri doesn't support replacing managed state). See
/// docs/adr/013-settings-local-desktop-configuration.md.
pub struct CoreHttpClient {
    client: reqwest::Client,
    base_url: RwLock<String>,
    bearer_token: RwLock<Option<String>>,
}

impl CoreHttpClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            // A dedicated short timeout - the health check is meant to be cheap and
            // frequent, so a slow/hanging Core must fail fast rather than tie up
            // Desktop Services' poll loop for the default reqwest timeout.
            client: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("reqwest client with a fixed timeout must always build"),
            base_url: RwLock::new(base_url.into()),
            bearer_token: RwLock::new(None),
        }
    }

    /// Consuming builder for a freshly-constructed client - used both at
    /// app startup (seeding the shared client from the loaded config) and
    /// by Settings' "Test Connection" (a throwaway client probing a URL/
    /// token pair the user hasn't saved yet).
    pub fn with_bearer_token(self, bearer_token: Option<String>) -> Self {
        *self
            .bearer_token
            .write()
            .expect("bearer_token lock poisoned") = bearer_token;
        self
    }

    /// Updates the live connection in place so every future request -
    /// including the ones the background connection-poll loop is already
    /// mid-cycle on - uses the new URL/token immediately. This is the only
    /// way Core's connection ever changes after startup; a fresh client is
    /// never re-`app.manage()`'d (see the struct docstring).
    pub fn set_connection(&self, base_url: impl Into<String>, bearer_token: Option<String>) {
        *self.base_url.write().expect("base_url lock poisoned") = base_url.into();
        *self
            .bearer_token
            .write()
            .expect("bearer_token lock poisoned") = bearer_token;
    }

    fn current_base_url(&self) -> String {
        self.base_url
            .read()
            .expect("base_url lock poisoned")
            .clone()
    }

    /// A GET request builder pre-populated with the current base URL and
    /// (if set) the current bearer token - the shared starting point every
    /// Core Bridge method builds its request from, so auth wiring only has
    /// to happen in one place. Reads the locks fresh on every call so a
    /// `set_connection` takes effect on the very next request, in-flight
    /// requests notwithstanding.
    pub(super) fn get_request(&self, path: &str) -> reqwest::RequestBuilder {
        self.authorize(
            self.client
                .get(format!("{}{path}", self.current_base_url())),
        )
    }

    pub(super) fn post_request(&self, path: &str) -> reqwest::RequestBuilder {
        self.authorize(
            self.client
                .post(format!("{}{path}", self.current_base_url())),
        )
    }

    pub(super) fn delete_request(&self, path: &str) -> reqwest::RequestBuilder {
        self.authorize(
            self.client
                .delete(format!("{}{path}", self.current_base_url())),
        )
    }

    /// Builds a GET request with a caller-supplied timeout instead of this
    /// client's blanket [`REQUEST_TIMEOUT`] - needed for the SSE task-events
    /// stream, which must stay open far longer than a normal health/task
    /// call (see `core_bridge::sse`).
    pub(super) fn get_request_with_timeout(
        &self,
        path: &str,
        timeout: std::time::Duration,
    ) -> reqwest::RequestBuilder {
        self.get_request(path).timeout(timeout)
    }

    fn authorize(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self
            .bearer_token
            .read()
            .expect("bearer_token lock poisoned")
            .as_ref()
        {
            Some(token) => builder.bearer_auth(token),
            None => builder,
        }
    }

    pub async fn get_health(&self) -> Result<HealthResponse, BridgeError> {
        let response = self.get_request("/health").send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }

        response
            .json::<HealthResponse>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_response_deserializes_the_real_core_shape() {
        let raw = r#"{
            "status": "ok",
            "alive": true,
            "core_version": "2.0.0",
            "api_version": 1,
            "protocol_version": 1,
            "instance_id": "abc123",
            "timestamp": "2026-07-16T12:00:00+00:00"
        }"#;

        let parsed: HealthResponse = serde_json::from_str(raw).unwrap();

        assert_eq!(parsed.status, "ok");
        assert!(parsed.alive);
        assert_eq!(parsed.core_version, "2.0.0");
        assert_eq!(parsed.api_version, 1);
        assert_eq!(parsed.instance_id, "abc123");
    }

    #[tokio::test]
    async fn get_health_reports_connection_refused_when_nothing_is_listening() {
        // Bind then immediately drop a real local listener - the OS reliably
        // answers the next connection attempt to that now-closed port with a
        // real "connection refused", deterministically, unlike a fixed port
        // number that might be filtered/dropped instead of refused on some
        // systems (same pattern CodexiaCore's own network-probe tests use).
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let client = CoreHttpClient::new(format!("http://127.0.0.1:{port}"));

        let result = client.get_health().await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }

    #[test]
    fn get_request_builds_a_url_from_the_current_base_url() {
        let client = CoreHttpClient::new("http://original-host:1000");

        let built = client.get_request("/health").build().unwrap();

        assert_eq!(built.url().as_str(), "http://original-host:1000/health");
    }

    #[test]
    fn set_connection_changes_the_url_subsequent_requests_use() {
        let client = CoreHttpClient::new("http://original-host:1000");

        client.set_connection("http://updated-host:2000", None);
        let built = client.get_request("/health").build().unwrap();

        assert_eq!(built.url().as_str(), "http://updated-host:2000/health");
    }

    #[test]
    fn get_request_omits_the_authorization_header_when_no_token_is_set() {
        let client = CoreHttpClient::new("http://original-host:1000");

        let built = client.get_request("/health").build().unwrap();

        assert!(built
            .headers()
            .get(reqwest::header::AUTHORIZATION)
            .is_none());
    }

    #[test]
    fn with_bearer_token_attaches_an_authorization_header() {
        let client = CoreHttpClient::new("http://original-host:1000")
            .with_bearer_token(Some("secret".to_string()));

        let built = client.get_request("/health").build().unwrap();

        assert_eq!(
            built.headers().get(reqwest::header::AUTHORIZATION).unwrap(),
            "Bearer secret",
        );
    }

    #[test]
    fn set_connection_changes_the_token_subsequent_requests_use() {
        let client = CoreHttpClient::new("http://original-host:1000");

        client.set_connection("http://original-host:1000", Some("new-token".to_string()));
        let built = client.get_request("/health").build().unwrap();

        assert_eq!(
            built.headers().get(reqwest::header::AUTHORIZATION).unwrap(),
            "Bearer new-token",
        );
    }

    #[test]
    fn set_connection_can_clear_a_previously_set_token() {
        let client = CoreHttpClient::new("http://original-host:1000")
            .with_bearer_token(Some("secret".to_string()));

        client.set_connection("http://original-host:1000", None);
        let built = client.get_request("/health").build().unwrap();

        assert!(built
            .headers()
            .get(reqwest::header::AUTHORIZATION)
            .is_none());
    }
}

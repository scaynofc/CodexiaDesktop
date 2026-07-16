//! Pure transport: one-shot HTTP calls to Codexia Core. No retry loop, no
//! polling, no interpretation of what a failure means - see `error.rs` and
//! the module docstring in `mod.rs`.

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

#[derive(Clone)]
pub struct CoreHttpClient {
    client: reqwest::Client,
    base_url: String,
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
            base_url: base_url.into(),
        }
    }

    pub async fn get_health(&self) -> Result<HealthResponse, BridgeError> {
        let response = self
            .client
            .get(format!("{}/health", self.base_url))
            .send()
            .await?;

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
}

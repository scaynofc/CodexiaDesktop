//! Owns Capability Registry's behavior: fetching CodexiaCore's registered
//! tool list via `GET /capabilities`. Deliberately thin, no shared state,
//! no poll loop - same reasoning as `services::runtime` (a tool registry
//! only changes on Core restart/config reload, not mid-session), see
//! docs/adr/022-capability-registry.md.

use crate::core_bridge::{BridgeError, Capability, CoreHttpClient};

/// What Core Bridge exposes for fetching the capability registry - a trait
/// (not the concrete `CoreHttpClient`) so `fetch_capabilities` can be
/// tested with a scripted fake, mirroring `services::runtime`'s
/// `OllamaRuntimeFetcher`.
pub trait CapabilitiesFetcher: Send + Sync {
    fn get_capabilities(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<Capability>, BridgeError>> + Send;
}

impl CapabilitiesFetcher for CoreHttpClient {
    async fn get_capabilities(&self) -> Result<Vec<Capability>, BridgeError> {
        CoreHttpClient::get_capabilities(self).await
    }
}

impl<F: CapabilitiesFetcher> CapabilitiesFetcher for std::sync::Arc<F> {
    async fn get_capabilities(&self) -> Result<Vec<Capability>, BridgeError> {
        F::get_capabilities(self).await
    }
}

/// Fetches the current capability registry - called both on the screen's
/// mount and its "Refresh" button, always a fresh round trip.
pub async fn fetch_capabilities<F: CapabilitiesFetcher>(
    fetcher: &F,
) -> Result<Vec<Capability>, BridgeError> {
    fetcher.get_capabilities().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::CapabilitySource;

    struct ScriptedFetcher {
        response: Result<Vec<Capability>, BridgeError>,
    }

    impl CapabilitiesFetcher for ScriptedFetcher {
        async fn get_capabilities(&self) -> Result<Vec<Capability>, BridgeError> {
            self.response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_capabilities_returns_whatever_the_fetcher_provides() {
        let fetcher = ScriptedFetcher {
            response: Ok(vec![Capability {
                name: "read_file".to_string(),
                description: "Reads a file.".to_string(),
                parameters: serde_json::json!({}),
                requires_approval: false,
                source: CapabilitySource::BuiltIn,
            }]),
        };

        let result = fetch_capabilities(&fetcher).await.unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "read_file");
    }

    #[tokio::test]
    async fn fetch_capabilities_propagates_a_transport_error() {
        let fetcher = ScriptedFetcher {
            response: Err(BridgeError::ConnectionRefused),
        };

        let result = fetch_capabilities(&fetcher).await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }
}

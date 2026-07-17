//! Owns Runtime Center's behavior: fetching Ollama's runtime status via
//! CodexiaCore's `GET /providers/ollama/runtime`. Deliberately thin, no
//! shared state, no poll loop - same reasoning as `services::metrics`
//! (loaded-model state only changes when a task actually runs inference),
//! see docs/adr/010-runtime-center-ollama-proxy.md. Talks only to Core,
//! never to Ollama directly - ADR-003/ADR-004 require every capability
//! Desktop needs to be a CodexiaCore API endpoint, not a second transport
//! target bypassing Core Bridge.

use crate::core_bridge::{BridgeError, CoreHttpClient, OllamaRuntimeStatus};

/// What Core Bridge exposes for fetching Ollama's runtime status - a trait
/// (not the concrete `CoreHttpClient`) so `fetch_ollama_runtime` can be
/// tested with a scripted fake, mirroring `services::metrics`'s
/// `MetricsFetcher`.
pub trait OllamaRuntimeFetcher: Send + Sync {
    fn get_ollama_runtime(
        &self,
    ) -> impl std::future::Future<Output = Result<OllamaRuntimeStatus, BridgeError>> + Send;
}

impl OllamaRuntimeFetcher for CoreHttpClient {
    async fn get_ollama_runtime(&self) -> Result<OllamaRuntimeStatus, BridgeError> {
        CoreHttpClient::get_ollama_runtime(self).await
    }
}

impl<F: OllamaRuntimeFetcher> OllamaRuntimeFetcher for std::sync::Arc<F> {
    async fn get_ollama_runtime(&self) -> Result<OllamaRuntimeStatus, BridgeError> {
        F::get_ollama_runtime(self).await
    }
}

/// Fetches the current Ollama runtime status - called both on Runtime
/// Center's mount and by its "Refresh" button, always a fresh round trip.
pub async fn fetch_ollama_runtime<F: OllamaRuntimeFetcher>(
    fetcher: &F,
) -> Result<OllamaRuntimeStatus, BridgeError> {
    fetcher.get_ollama_runtime().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::OllamaRuntimeModel;

    struct ScriptedFetcher {
        response: Result<OllamaRuntimeStatus, BridgeError>,
    }

    impl OllamaRuntimeFetcher for ScriptedFetcher {
        async fn get_ollama_runtime(&self) -> Result<OllamaRuntimeStatus, BridgeError> {
            self.response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_ollama_runtime_returns_whatever_the_fetcher_provides() {
        let fetcher = ScriptedFetcher {
            response: Ok(OllamaRuntimeStatus {
                reachable: true,
                models: vec![OllamaRuntimeModel {
                    name: "qwen2.5:7b".to_string(),
                    size_vram_bytes: Some(4800000),
                    expires_at: None,
                }],
            }),
        };

        let result = fetch_ollama_runtime(&fetcher).await.unwrap();

        assert!(result.reachable);
        assert_eq!(result.models[0].name, "qwen2.5:7b");
    }

    #[tokio::test]
    async fn fetch_ollama_runtime_propagates_a_transport_error() {
        let fetcher = ScriptedFetcher {
            response: Err(BridgeError::ConnectionRefused),
        };

        let result = fetch_ollama_runtime(&fetcher).await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }
}

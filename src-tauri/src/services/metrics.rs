//! Owns Provider Center's behavior: fetching CodexiaCore's metrics
//! snapshot. Deliberately thin - see
//! docs/adr/009-provider-center-metrics-snapshot.md for why this has no
//! shared state and no periodic poll loop, unlike `services::tasks`: cost/
//! model-health data only changes as a side effect of a task actually
//! running, so there's no independent-of-Desktop event source (unlike the
//! task list, which can change via CodexiaCore's webhook endpoint or a
//! concurrent CLI session) that would justify polling Core for it on a
//! timer. Still routed through Desktop Services rather than called
//! straight from a Tauri command, per ADR-003's layering rule - this keeps
//! the same swap-the-transport/test-in-isolation properties every other
//! screen's data path already has, and is where a future caching or
//! refresh-cadence decision would land without moving the call site.

use crate::core_bridge::{BridgeError, CoreHttpClient, MetricsSnapshot};

/// What Core Bridge exposes for fetching metrics - a trait (not the
/// concrete `CoreHttpClient`) so `fetch_metrics` can be tested with a
/// scripted fake, mirroring `services::tasks`'s `TaskLister`.
pub trait MetricsFetcher: Send + Sync {
    fn get_metrics(
        &self,
    ) -> impl std::future::Future<Output = Result<MetricsSnapshot, BridgeError>> + Send;
}

impl MetricsFetcher for CoreHttpClient {
    async fn get_metrics(&self) -> Result<MetricsSnapshot, BridgeError> {
        CoreHttpClient::get_metrics(self).await
    }
}

impl<F: MetricsFetcher> MetricsFetcher for std::sync::Arc<F> {
    async fn get_metrics(&self) -> Result<MetricsSnapshot, BridgeError> {
        F::get_metrics(self).await
    }
}

/// Fetches the current metrics snapshot - called both on Provider Center's
/// mount and by its "Refresh" button, always a fresh network round trip
/// (no cache to invalidate, nothing to diff against).
pub async fn fetch_metrics<F: MetricsFetcher>(fetcher: &F) -> Result<MetricsSnapshot, BridgeError> {
    fetcher.get_metrics().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::{DailyCostSummary, ModelHealth, ProviderType};
    use std::collections::HashMap;

    fn snapshot() -> MetricsSnapshot {
        MetricsSnapshot {
            total_cost_usd: Some(1.23),
            total_calls: 4,
            daily_costs: vec![DailyCostSummary {
                date: "2026-07-17".to_string(),
                calls: 4,
                total_tokens: 1000,
                cost_usd: Some(1.23),
            }],
            model_health: vec![ModelHealth {
                provider: ProviderType::Ollama,
                model: "qwen2.5:7b".to_string(),
                sample_count: 4,
                success_rate: 1.0,
                median_latency_ms: Some(500.0),
                avg_cost_usd: None,
                consecutive_failures: 0,
                in_cooldown: false,
            }],
            router_accuracy: Some(1.0),
            router_accuracy_by_role: HashMap::new(),
        }
    }

    struct ScriptedFetcher {
        response: Result<MetricsSnapshot, BridgeError>,
    }

    impl MetricsFetcher for ScriptedFetcher {
        async fn get_metrics(&self) -> Result<MetricsSnapshot, BridgeError> {
            self.response.clone()
        }
    }

    #[tokio::test]
    async fn fetch_metrics_returns_whatever_the_fetcher_provides() {
        let fetcher = ScriptedFetcher {
            response: Ok(snapshot()),
        };

        let result = fetch_metrics(&fetcher).await.unwrap();

        assert_eq!(result.total_calls, 4);
        assert_eq!(result.model_health[0].model, "qwen2.5:7b");
    }

    #[tokio::test]
    async fn fetch_metrics_propagates_a_transport_error() {
        let fetcher = ScriptedFetcher {
            response: Err(BridgeError::ConnectionRefused),
        };

        let result = fetch_metrics(&fetcher).await;

        assert_eq!(result, Err(BridgeError::ConnectionRefused));
    }
}

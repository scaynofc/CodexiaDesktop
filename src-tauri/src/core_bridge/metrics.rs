//! Metrics wire types and the one-shot `GET /metrics` call. Mirrors
//! CodexiaCore's `MetricsSnapshot`/`ModelHealth`/`DailyCostSummary` models
//! and `ProviderType` enum field-for-field (`core/metrics_facade.py`,
//! `models/model_health.py`, `models/ledger.py`, `models/enums.py`) - all
//! added together in CodexiaCore's own `GET /metrics` (ADR-012 in the
//! CodexiaCore repo), so unlike `tasks.rs`'s older fields, nothing here
//! needs `#[serde(default)]` for backward compatibility with a Core
//! version that predates any of these fields existing at all.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Openrouter,
    Ollama,
    Generic,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelHealth {
    pub provider: ProviderType,
    pub model: String,
    pub sample_count: u32,
    pub success_rate: f64,
    pub median_latency_ms: Option<f64>,
    pub avg_cost_usd: Option<f64>,
    pub consecutive_failures: u32,
    pub in_cooldown: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DailyCostSummary {
    pub date: String,
    pub calls: u32,
    pub total_tokens: u64,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub total_cost_usd: Option<f64>,
    pub total_calls: u32,
    pub daily_costs: Vec<DailyCostSummary>,
    pub model_health: Vec<ModelHealth>,
    pub router_accuracy: Option<f64>,
    pub router_accuracy_by_role: HashMap<String, Option<f64>>,
}

impl CoreHttpClient {
    pub async fn get_metrics(&self) -> Result<MetricsSnapshot, BridgeError> {
        let response = self.get_request("/metrics").send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }

        response
            .json::<MetricsSnapshot>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_real_metrics_snapshot_with_model_health_and_daily_costs() {
        let raw = r#"{
            "total_cost_usd": 0.42,
            "total_calls": 11,
            "daily_costs": [
                {"date": "2026-07-16", "calls": 11, "total_tokens": 4400, "cost_usd": 0.42}
            ],
            "model_health": [
                {
                    "provider": "ollama",
                    "model": "qwen2.5:7b",
                    "sample_count": 11,
                    "success_rate": 0.9090909090909091,
                    "median_latency_ms": 850.5,
                    "avg_cost_usd": null,
                    "consecutive_failures": 0,
                    "in_cooldown": false
                }
            ],
            "router_accuracy": 1.0,
            "router_accuracy_by_role": {"coder": 1.0, "planner": null}
        }"#;

        let snapshot: MetricsSnapshot = serde_json::from_str(raw).unwrap();

        assert_eq!(snapshot.total_cost_usd, Some(0.42));
        assert_eq!(snapshot.total_calls, 11);
        assert_eq!(snapshot.daily_costs.len(), 1);
        assert_eq!(snapshot.daily_costs[0].date, "2026-07-16");
        assert_eq!(snapshot.model_health.len(), 1);
        assert_eq!(snapshot.model_health[0].provider, ProviderType::Ollama);
        assert_eq!(snapshot.model_health[0].avg_cost_usd, None);
        assert!(!snapshot.model_health[0].in_cooldown);
        assert_eq!(
            snapshot.router_accuracy_by_role.get("coder"),
            Some(&Some(1.0))
        );
        assert_eq!(snapshot.router_accuracy_by_role.get("planner"), Some(&None));
    }

    #[test]
    fn deserializes_the_empty_shape_with_no_data_yet() {
        let raw = r#"{
            "total_cost_usd": null,
            "total_calls": 0,
            "daily_costs": [],
            "model_health": [],
            "router_accuracy": null,
            "router_accuracy_by_role": {}
        }"#;

        let snapshot: MetricsSnapshot = serde_json::from_str(raw).unwrap();

        assert_eq!(snapshot.total_cost_usd, None);
        assert_eq!(snapshot.total_calls, 0);
        assert!(snapshot.daily_costs.is_empty());
        assert!(snapshot.model_health.is_empty());
    }

    #[test]
    fn provider_type_serializes_to_lowercase_matching_the_wire_format() {
        assert_eq!(
            serde_json::to_string(&ProviderType::Openrouter).unwrap(),
            "\"openrouter\""
        );
        assert_eq!(
            serde_json::to_string(&ProviderType::Generic).unwrap(),
            "\"generic\""
        );
    }
}

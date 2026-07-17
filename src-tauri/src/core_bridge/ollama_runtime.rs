//! Ollama runtime wire types and the one-shot `GET /providers/ollama/runtime`
//! call. Mirrors CodexiaCore's `OllamaRuntimeStatus`/`OllamaRuntimeModel`
//! field-for-field (`models/ollama_runtime.py`) - see CodexiaCore's
//! ADR-013 and this repo's docs/adr/010-runtime-center-ollama-proxy.md.

use serde::{Deserialize, Serialize};

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OllamaRuntimeModel {
    pub name: String,
    pub size_vram_bytes: Option<u64>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OllamaRuntimeStatus {
    pub reachable: bool,
    pub models: Vec<OllamaRuntimeModel>,
}

impl CoreHttpClient {
    pub async fn get_ollama_runtime(&self) -> Result<OllamaRuntimeStatus, BridgeError> {
        let response = self.get_request("/providers/ollama/runtime").send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }

        response
            .json::<OllamaRuntimeStatus>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_reachable_status_with_a_loaded_model() {
        let raw = r#"{
            "reachable": true,
            "models": [
                {"name": "qwen2.5:7b", "size_vram_bytes": 4800000, "expires_at": "2026-07-17T12:00:00Z"}
            ]
        }"#;

        let status: OllamaRuntimeStatus = serde_json::from_str(raw).unwrap();

        assert!(status.reachable);
        assert_eq!(status.models.len(), 1);
        assert_eq!(status.models[0].name, "qwen2.5:7b");
        assert_eq!(status.models[0].size_vram_bytes, Some(4800000));
    }

    #[test]
    fn deserializes_an_unreachable_status_with_no_models() {
        let raw = r#"{"reachable": false, "models": []}"#;

        let status: OllamaRuntimeStatus = serde_json::from_str(raw).unwrap();

        assert!(!status.reachable);
        assert!(status.models.is_empty());
    }

    #[test]
    fn deserializes_a_model_with_no_vram_or_expiry_info() {
        let raw = r#"{"reachable": true, "models": [{"name": "mistral:latest", "size_vram_bytes": null, "expires_at": null}]}"#;

        let status: OllamaRuntimeStatus = serde_json::from_str(raw).unwrap();

        assert_eq!(status.models[0].size_vram_bytes, None);
        assert_eq!(status.models[0].expires_at, None);
    }
}

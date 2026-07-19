//! Capability Registry wire types and the one-shot `GET /capabilities`
//! call. Mirrors CodexiaCore's `Capability` field-for-field
//! (`models/capability.py`) - see CodexiaCore's ADR-026 and this repo's
//! docs/adr/022-capability-registry.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::error::BridgeError;
use super::http::CoreHttpClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilitySource {
    BuiltIn,
    Mcp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Capability {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub requires_approval: bool,
    pub source: CapabilitySource,
}

impl CoreHttpClient {
    pub async fn get_capabilities(&self) -> Result<Vec<Capability>, BridgeError> {
        let response = self.get_request("/capabilities").send().await?;

        if !response.status().is_success() {
            return Err(BridgeError::UnexpectedStatus(response.status().as_u16()));
        }

        response
            .json::<Vec<Capability>>()
            .await
            .map_err(BridgeError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_built_in_tool() {
        let raw = r#"[{
            "name": "read_file",
            "description": "Reads a file.",
            "parameters": {"type": "object", "properties": {}},
            "requires_approval": false,
            "source": "built_in"
        }]"#;

        let capabilities: Vec<Capability> = serde_json::from_str(raw).unwrap();

        assert_eq!(capabilities.len(), 1);
        assert_eq!(capabilities[0].name, "read_file");
        assert_eq!(capabilities[0].source, CapabilitySource::BuiltIn);
        assert!(!capabilities[0].requires_approval);
    }

    #[test]
    fn deserializes_an_mcp_sourced_tool() {
        let raw = r#"[{
            "name": "mcp__github__create_issue",
            "description": "Creates a GitHub issue.",
            "parameters": {},
            "requires_approval": true,
            "source": "mcp"
        }]"#;

        let capabilities: Vec<Capability> = serde_json::from_str(raw).unwrap();

        assert_eq!(capabilities[0].source, CapabilitySource::Mcp);
        assert!(capabilities[0].requires_approval);
    }

    #[test]
    fn deserializes_an_empty_registry() {
        let capabilities: Vec<Capability> = serde_json::from_str("[]").unwrap();

        assert!(capabilities.is_empty());
    }

    #[test]
    fn capability_source_serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_string(&CapabilitySource::BuiltIn).unwrap(),
            "\"built_in\""
        );
        assert_eq!(
            serde_json::to_string(&CapabilitySource::Mcp).unwrap(),
            "\"mcp\""
        );
    }
}

//! Owns Settings (Phase 11): user-editable Desktop configuration - Core's
//! connection URL, an optional bearer token, a default project id, and a
//! reserved debug-mode flag. Local to Desktop only, never sent to Core as
//! a concept (see docs/adr/003-layered-architecture.md,
//! docs/adr/004-core-never-knows-about-desktop.md: Core stays stateless
//! and config-free) - see
//! docs/adr/013-settings-local-desktop-configuration.md.

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::services::default_core_base_url;

const CONFIG_FILE_NAME: &str = "codexia_config.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_core_base_url")]
    pub core_url: String,
    #[serde(default)]
    pub auth_token: Option<String>,
    #[serde(default)]
    pub default_project_id: Option<String>,
    /// Reserved - not wired to any behavior yet, same "add the field now,
    /// give it teeth later" precedent as `CoreHttpClient::bearer_token` was
    /// itself before this phase. See ADR-013's Consequences.
    #[serde(default)]
    pub debug_mode: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            core_url: default_core_base_url(),
            auth_token: None,
            default_project_id: None,
            debug_mode: false,
        }
    }
}

/// Shared, thread-safe handle to the in-memory config - populated once at
/// startup from disk (see `lib.rs`'s `setup()`), read by `get_config`,
/// written by `save_config`. Mirrors `SharedConnectionStatus`/
/// `SharedTaskList`'s plain `Arc<Mutex<_>>`-family shape (an `RwLock` here
/// since reads vastly outnumber writes - every command reads it, only a
/// Settings save ever writes it).
pub type SharedConfig = Arc<RwLock<Config>>;

pub fn shared_config(config: Config) -> SharedConfig {
    Arc::new(RwLock::new(config))
}

/// Resolves where the config file lives - Tauri's own app-config directory
/// (e.g. `%APPDATA%\com.codexia.desktop\` on Windows, keyed off
/// `tauri.conf.json`'s `identifier`), not a hand-rolled per-OS path, so
/// this does the right thing on every platform Tauri supports without this
/// codebase tracking OS-specific paths itself. Thin glue over Tauri's own
/// (already-tested) API - not unit tested here, same trust boundary as any
/// other `app.manage(...)`/`app.path()` call in this codebase.
pub fn resolve_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join(CONFIG_FILE_NAME))
}

/// Loads config from an explicit path. A missing file (first run) or
/// corrupt/unparseable JSON both fall back to [`Config::default`] rather
/// than failing - a broken config file must never block app launch.
pub fn load_config_from(path: &Path) -> Config {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Config::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Persists config to an explicit path, creating the parent directory
/// first if it doesn't exist yet (first run - Tauri's app-config directory
/// is not guaranteed to exist before something writes into it).
pub fn save_config_to(path: &Path, config: &Config) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    std::fs::write(path, raw).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A per-test, per-process-unique temp path - avoids collisions between
    /// tests run in parallel (Rust's default test runner) without needing a
    /// temp-file crate this project doesn't otherwise depend on.
    fn temp_config_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codexia_desktop_test_config_{label}_{}_{:?}.json",
            std::process::id(),
            std::thread::current().id(),
        ))
    }

    #[test]
    fn default_config_uses_the_default_core_url_and_no_auth() {
        let config = Config::default();

        assert_eq!(config.core_url, default_core_base_url());
        assert_eq!(config.auth_token, None);
        assert_eq!(config.default_project_id, None);
        assert!(!config.debug_mode);
    }

    #[test]
    fn load_config_from_a_missing_file_returns_the_default() {
        let path = temp_config_path("missing");
        let _ = std::fs::remove_file(&path);

        let config = load_config_from(&path);

        assert_eq!(config, Config::default());
    }

    #[test]
    fn load_config_from_a_corrupted_file_falls_back_to_the_default() {
        let path = temp_config_path("corrupted");
        std::fs::write(&path, "{ this is not valid json").unwrap();

        let config = load_config_from(&path);

        assert_eq!(config, Config::default());

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_config_from_a_partial_older_file_fills_in_defaults_for_missing_fields() {
        // Simulates a config file written by an older Desktop build that
        // predates `debug_mode`/`default_project_id` - forward compatible
        // via serde's per-field `#[serde(default)]`, same pattern
        // `core_bridge::tasks::Task.project_id` already established for
        // Core's own backward-compat story (ADR-011 in this repo).
        let path = temp_config_path("partial");
        std::fs::write(&path, r#"{"core_url": "http://legacy-host:9999"}"#).unwrap();

        let config = load_config_from(&path);

        assert_eq!(config.core_url, "http://legacy-host:9999");
        assert_eq!(config.auth_token, None);
        assert_eq!(config.default_project_id, None);
        assert!(!config.debug_mode);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_then_load_round_trips_every_field() {
        let path = temp_config_path("roundtrip");
        let config = Config {
            core_url: "http://example.com:9000".to_string(),
            auth_token: Some("secret-token".to_string()),
            default_project_id: Some("proj-1".to_string()),
            debug_mode: true,
        };

        save_config_to(&path, &config).unwrap();
        let loaded = load_config_from(&path);

        assert_eq!(loaded, config);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_creates_the_parent_directory_if_missing() {
        let dir = std::env::temp_dir().join(format!(
            "codexia_desktop_test_config_newdir_{}",
            std::process::id()
        ));
        let path = dir.join(CONFIG_FILE_NAME);
        let _ = std::fs::remove_dir_all(&dir);

        save_config_to(&path, &Config::default()).unwrap();

        assert!(path.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn shared_config_reads_back_the_value_it_was_created_with() {
        let config = Config {
            core_url: "http://shared-test:1234".to_string(),
            ..Config::default()
        };

        let shared = shared_config(config.clone());

        assert_eq!(*shared.read().unwrap(), config);
    }
}

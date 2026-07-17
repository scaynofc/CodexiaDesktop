//! Desktop Services - owns all UI-facing behavior: reconnect, retry,
//! offline mode, notifications, polling, local cache, and desktop-side
//! state. Consumes Core Bridge, never talks HTTP/SSE directly itself.

pub mod config;
pub mod connection;
pub mod events;
pub mod memory;
pub mod metrics;
pub mod runtime;
pub mod tasks;

/// Where Core is expected to be running before Settings' saved config (or
/// its absence, e.g. first run) has anything to say - `services::config`'s
/// `Config::default()` falls back to this, and it's also the field-level
/// serde default for a config file written before `core_url` existed. Kept
/// as a function rather than a hardcoded literal scattered across call
/// sites, so there is exactly one place a fallback host/port is defined.
pub fn default_core_base_url() -> String {
    "http://127.0.0.1:8000".to_string()
}

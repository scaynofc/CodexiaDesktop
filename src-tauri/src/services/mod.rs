//! Desktop Services - owns all UI-facing behavior: reconnect, retry,
//! offline mode, notifications, polling, local cache, and desktop-side
//! state. Consumes Core Bridge, never talks HTTP/SSE directly itself.

pub mod connection;

/// Where Core is expected to be running - a plain default for now (matches
/// `codexia.api.app.main()`'s own default host/port); Phase 11 (Settings)
/// lets a user change it. Kept as a function rather than a hardcoded
/// literal scattered across call sites, so that Settings has one place to
/// override later.
pub fn default_core_base_url() -> String {
    "http://127.0.0.1:8000".to_string()
}

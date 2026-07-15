//! Desktop Services - owns all UI-facing behavior: reconnect, retry,
//! offline mode, notifications, polling, local cache, and desktop-side
//! state. Consumes Core Bridge, never talks HTTP/SSE directly itself.
//! Empty in Phase 1 - filled in starting Phase 2.

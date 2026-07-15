//! Core Bridge - the only layer that talks HTTP/SSE to Codexia Core.
//!
//! Pure transport, nothing else (see docs/adr/003-layered-architecture.md):
//! no business logic, no decisions, no data interpretation, no UI state,
//! no caching. Desktop Services owns all of that. Empty in Phase 1 - filled
//! in during Phase 2 (Core Bridge) with an HTTP client, an SSE client, and
//! reconnect/health-check logic.

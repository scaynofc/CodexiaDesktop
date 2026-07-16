//! Core Bridge - the only layer that talks HTTP/SSE to Codexia Core.
//!
//! Pure transport, nothing else (see docs/adr/003-layered-architecture.md):
//! no business logic, no decisions, no data interpretation, no UI state,
//! no caching. Desktop Services owns all of that - Core Bridge's functions
//! are one-shot: make a single call, return a `Result`, done.
//!
//! An SSE client (for `/ask/stream` and `/tasks/{id}/events`) is deliberately
//! not built yet - nothing in this phase consumes it. It lands in whichever
//! later phase (Task Center / Timeline) is the first real consumer, per this
//! project's "reuse, don't invent ahead of need" convention.

mod error;
mod http;

pub use error::BridgeError;
pub use http::{CoreHttpClient, HealthResponse};

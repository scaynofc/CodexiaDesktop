//! Core Bridge - the only layer that talks HTTP/SSE to Codexia Core.
//!
//! Pure transport, nothing else (see docs/adr/003-layered-architecture.md):
//! no business logic, no decisions, no data interpretation, no UI state,
//! no caching. Desktop Services owns all of that - Core Bridge's functions
//! are one-shot: make a single call, return a `Result`, done.
//!
//! The SSE client (`sse.rs`, for `/tasks/{id}/events`) is hand-rolled on top
//! of `reqwest::Response::chunk()` rather than a dedicated SSE crate - see
//! docs/adr/007-task-center-polling-and-sse.md for why.

mod error;
mod http;
mod metrics;
mod ollama_runtime;
mod sse;
mod tasks;

pub use error::BridgeError;
pub use http::{CoreHttpClient, HealthResponse};
pub use metrics::{DailyCostSummary, MetricsSnapshot, ModelHealth, ProviderType};
pub use ollama_runtime::{OllamaRuntimeModel, OllamaRuntimeStatus};
pub use sse::{watch_task, TaskEvent};
pub use tasks::{CancelResult, Task, TaskCreated, TaskState, TaskStep, TimelineEvent, Usage};

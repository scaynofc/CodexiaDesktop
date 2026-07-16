//! Tauri commands - the thin `invoke()` surface the Presentation layer
//! calls. Each command dispatches to Desktop Services; commands never
//! contain business logic themselves.

use tauri::State;

use crate::services::connection::{ConnectionStatus, SharedConnectionStatus};

/// Reads the current connection status synchronously - lets the frontend
/// fetch a value on mount instead of waiting for the next
/// `connection-status-changed` event. The background poll loop
/// (`services::connection::run_connection_loop`) is the only writer.
#[tauri::command]
pub fn get_connection_status(state: State<SharedConnectionStatus>) -> ConnectionStatus {
    state.lock().unwrap().clone()
}

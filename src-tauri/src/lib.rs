//! Codexia Desktop - a native control center for the Codexia Core runtime.
//!
//! Layered architecture (see docs/adr/003-layered-architecture.md):
//! Presentation (React) -> Desktop Services -> Core Bridge -> Codexia Core.
//! Inference never runs here - Core stays the only place that talks to a
//! model provider.

pub mod commands;
pub mod core_bridge;
pub mod services;

use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::core_bridge::CoreHttpClient;
use crate::services::connection::{
    run_connection_loop, run_supervised, ConnectionStatus, SUPERVISOR_RESTART_DELAY,
};
use crate::services::default_core_base_url;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![commands::get_connection_status])
        .setup(|app| {
            let shared_status = ConnectionStatus::shared_initial();
            // Both the command (below) and the poll loop (spawned below) hold
            // a clone of the same `Arc<Mutex<_>>` - a plain shared cell, not
            // `tokio::sync::watch` (see connection.rs's module docstring for
            // the real bug that shape caused).
            app.manage(shared_status.clone());

            let app_handle = app.handle().clone();
            let probe = Arc::new(CoreHttpClient::new(default_core_base_url()));

            // Wrapped in `run_supervised`: if `run_connection_loop` ever
            // panics, it gets respawned instead of silently leaving the UI
            // frozen on its last-known status with no indication anything
            // is wrong (see docs/adr/005-connection-state-machine.md).
            tauri::async_runtime::spawn(run_supervised(
                move || {
                    let probe = probe.clone();
                    let shared_status = shared_status.clone();
                    let app_handle = app_handle.clone();
                    run_connection_loop(probe, shared_status, move |status| {
                        // Best-effort: a failed emit means no window is
                        // listening yet, not a reason to crash the poll loop.
                        let _ = app_handle.emit("connection-status-changed", status);
                    })
                },
                SUPERVISOR_RESTART_DELAY,
            ));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

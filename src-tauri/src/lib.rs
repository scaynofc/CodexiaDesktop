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
use tauri_plugin_notification::NotificationExt;

use crate::core_bridge::CoreHttpClient;
use crate::services::approval_watch::{run_approval_watch_loop, shared_pending_approvals_initial};
use crate::services::config;
use crate::services::connection::{
    run_connection_loop, run_supervised, ConnectionStatus, SUPERVISOR_RESTART_DELAY,
};
use crate::services::tasks::{
    run_task_list_poll_loop, shared_task_list_initial, shared_task_watch_handle_initial,
    shared_watched_task_initial,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::get_tasks,
            commands::refresh_tasks,
            commands::watch_task,
            commands::create_task,
            commands::resume_task,
            commands::cancel_task,
            commands::get_metrics,
            commands::get_ollama_runtime,
            commands::get_project_memory,
            commands::forget_project_memory,
            commands::get_events,
            commands::get_config,
            commands::save_config,
            commands::test_connection,
            commands::get_pending_approvals,
            commands::approve_approval,
            commands::reject_approval,
            commands::get_pending_approval_count,
            commands::get_approval_history,
            commands::get_capabilities,
        ])
        .setup(|app| {
            let shared_status = ConnectionStatus::shared_initial();
            // Both commands and the poll loops (spawned below) hold a clone
            // of the same `Arc<Mutex<_>>` cells - plain shared cells, not
            // `tokio::sync::watch` (see connection.rs's module docstring for
            // the real bug that shape caused).
            app.manage(shared_status.clone());

            // Loaded synchronously, before the client below, so the very
            // first request this app ever makes already uses a saved
            // Core URL/token - not a default that flips a moment later
            // (see docs/adr/013-settings-local-desktop-configuration.md).
            // A missing or corrupt config file both fall back to
            // `Config::default()` rather than failing app startup.
            let config_path = config::resolve_config_path(app.handle())?;
            let loaded_config = config::load_config_from(&config_path);
            app.manage(config::shared_config(loaded_config.clone()));

            let client = Arc::new(
                CoreHttpClient::new(loaded_config.core_url)
                    .with_bearer_token(loaded_config.auth_token),
            );
            app.manage(client.clone());

            let shared_task_list = shared_task_list_initial();
            app.manage(shared_task_list.clone());

            let shared_watched_task = shared_watched_task_initial();
            app.manage(shared_watched_task);

            let shared_task_watch_handle = shared_task_watch_handle_initial();
            app.manage(shared_task_watch_handle);

            let shared_pending_approvals = shared_pending_approvals_initial();
            app.manage(shared_pending_approvals.clone());

            let app_handle = app.handle().clone();

            // Grabbed now, before the two existing spawns below each move
            // their own captures of `client`/`shared_status`/`app_handle` -
            // this is the approval-watch loop's own independent set, not
            // reused from (or by) the connection/task-list loops.
            let approval_client = client.clone();
            let approval_status = shared_status.clone();
            let approval_app_handle = app_handle.clone();

            // Wrapped in `run_supervised`: if `run_connection_loop` ever
            // panics, it gets respawned instead of silently leaving the UI
            // frozen on its last-known status with no indication anything
            // is wrong (see docs/adr/005-connection-state-machine.md).
            tauri::async_runtime::spawn(run_supervised(
                {
                    let client = client.clone();
                    let shared_status = shared_status.clone();
                    let app_handle = app_handle.clone();
                    move || {
                        let client = client.clone();
                        let shared_status = shared_status.clone();
                        let app_handle = app_handle.clone();
                        run_connection_loop(client, shared_status, move |status| {
                            // Best-effort: a failed emit means no window is
                            // listening yet, not a reason to crash the poll
                            // loop.
                            let _ = app_handle.emit("connection-status-changed", status);
                        })
                    }
                },
                SUPERVISOR_RESTART_DELAY,
            ));

            // Same supervision, for the task-list poll loop (see
            // docs/adr/007-task-center-polling-and-sse.md) - gated on the
            // connection status above so it skips calling a Core we already
            // know is unreachable.
            tauri::async_runtime::spawn(run_supervised(
                move || {
                    let client = client.clone();
                    let shared_task_list = shared_task_list.clone();
                    let shared_status = shared_status.clone();
                    let app_handle = app_handle.clone();
                    run_task_list_poll_loop(client, shared_task_list, shared_status, move |tasks| {
                        let _ = app_handle.emit("tasks-changed", tasks);
                    })
                },
                SUPERVISOR_RESTART_DELAY,
            ));

            // Same supervision, for the approval-watch loop (see
            // docs/adr/017-approval-awareness.md) - runs for the app's
            // whole lifetime (unlike Approval Center's own screen-scoped
            // polling in Approvals.tsx), so the sidebar badge and OS
            // notifications below stay accurate on every screen.
            tauri::async_runtime::spawn(run_supervised(
                move || {
                    let client = approval_client.clone();
                    let shared_pending_approvals = shared_pending_approvals.clone();
                    let approval_status = approval_status.clone();
                    let app_handle = approval_app_handle.clone();
                    let notify_handle = approval_app_handle.clone();
                    run_approval_watch_loop(
                        client,
                        shared_pending_approvals,
                        approval_status,
                        move |approvals| {
                            let _ = app_handle.emit("approvals-changed", approvals);
                        },
                        move |new_approvals| {
                            // Best-effort, same as every other emit here - a
                            // failed notification (permission denied, no
                            // notification daemon on this OS, ...) must
                            // never break the watch loop itself.
                            let body = if new_approvals.len() == 1 {
                                "A new approval is waiting for your decision.".to_string()
                            } else {
                                format!(
                                    "{} new approvals are waiting for your decision.",
                                    new_approvals.len()
                                )
                            };
                            let _ = notify_handle
                                .notification()
                                .builder()
                                .title("Codexia Desktop")
                                .body(body)
                                .show();
                        },
                    )
                },
                SUPERVISOR_RESTART_DELAY,
            ));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

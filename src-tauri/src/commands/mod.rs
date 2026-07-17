//! Tauri commands - the thin `invoke()` surface the Presentation layer
//! calls. Each command dispatches to Desktop Services; commands never
//! contain business logic themselves.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::core_bridge::{
    CancelResult, CoreHttpClient, MemoryItem, MetricsSnapshot, OllamaRuntimeStatus, SystemEvent,
    Task, TaskCreated,
};
use crate::services::connection::{ConnectionStatus, SharedConnectionStatus};
use crate::services::events;
use crate::services::memory;
use crate::services::metrics;
use crate::services::runtime;
use crate::services::tasks::{self, SharedTaskList, SharedTaskWatchHandle, SharedWatchedTask};

/// Reads the current connection status synchronously - lets the frontend
/// fetch a value on mount instead of waiting for the next
/// `connection-status-changed` event. The background poll loop
/// (`services::connection::run_connection_loop`) is the only writer.
#[tauri::command]
pub fn get_connection_status(state: State<SharedConnectionStatus>) -> ConnectionStatus {
    state.lock().unwrap().clone()
}

/// Reads the current task list synchronously - same "fetch on mount, then
/// listen for events" pattern as [`get_connection_status`]. The periodic
/// list-poll loop (`services::tasks::run_task_list_poll_loop`) is the usual
/// writer; actions below also refresh it after they run.
#[tauri::command]
pub fn get_tasks(state: State<SharedTaskList>) -> Vec<Task> {
    state.lock().unwrap().clone()
}

/// Forces an immediate list refresh (a "Refresh" button, or the initial
/// fetch a screen does on mount) instead of waiting for the next periodic
/// tick.
#[tauri::command]
pub async fn refresh_tasks(
    client: State<'_, Arc<CoreHttpClient>>,
    task_list: State<'_, SharedTaskList>,
    app: AppHandle,
) -> Result<Vec<Task>, String> {
    tasks::refresh_task_list(client.inner(), task_list.inner(), &{
        let app = app.clone();
        move |updated: &[Task]| {
            let _ = app.emit("tasks-changed", updated);
        }
    })
    .await
    .map_err(|error| error.to_string())?;

    Ok(task_list.lock().unwrap().clone())
}

/// Starts (or switches to) watching one task's live updates - see
/// `services::tasks::start_watching_task`. Fire-and-forget: the watch runs
/// in the background and reports back via `task-detail-changed`/
/// `tasks-changed` events, not a return value.
///
/// Deliberately `async fn`, even though its body never awaits anything:
/// `start_watching_task` calls plain `tokio::spawn` internally (see
/// `services/tasks.rs`'s module docstring for why it's plain `tokio::spawn`
/// and not `tauri::async_runtime::spawn`), which needs an ambient Tokio
/// reactor to attach to. Tauri only guarantees that for `async fn`
/// commands, which it dispatches through its own (Tokio-backed) async
/// runtime; a plain sync `fn` command runs on a bare OS thread with no
/// reactor at all, and `tokio::spawn` panics immediately in that context
/// ("there is no reactor running") - a real crash this project's own
/// manual verification caught (see docs/adr/007-task-center-polling-and-sse.md).
#[tauri::command]
pub async fn watch_task(
    task_id: String,
    client: State<'_, Arc<CoreHttpClient>>,
    watched: State<'_, SharedWatchedTask>,
    watch_handle: State<'_, SharedTaskWatchHandle>,
    task_list: State<'_, SharedTaskList>,
    app: AppHandle,
) -> Result<(), String> {
    tasks::start_watching_task(
        client.inner().clone(),
        task_id,
        watched.inner().clone(),
        watch_handle.inner().clone(),
        task_list.inner().clone(),
        {
            let app = app.clone();
            move |task: &Task| {
                let _ = app.emit("task-detail-changed", task);
            }
        },
        {
            let app = app.clone();
            move |updated: &[Task]| {
                let _ = app.emit("tasks-changed", updated);
            }
        },
    );
    Ok(())
}

/// Creates a task (always `background: true` under the hood - see
/// `core_bridge::tasks`) and immediately starts watching it, matching
/// CodexiaCore's own reference dashboard's behavior of watching a task the
/// instant it's created.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_task(
    goal: String,
    require_approval: bool,
    simulate: bool,
    project_id: Option<String>,
    client: State<'_, Arc<CoreHttpClient>>,
    task_list: State<'_, SharedTaskList>,
    watched: State<'_, SharedWatchedTask>,
    watch_handle: State<'_, SharedTaskWatchHandle>,
    app: AppHandle,
) -> Result<TaskCreated, String> {
    let created = tasks::create_task_and_refresh(
        client.inner(),
        &goal,
        require_approval,
        simulate,
        project_id.as_deref(),
        task_list.inner(),
        &{
            let app = app.clone();
            move |updated: &[Task]| {
                let _ = app.emit("tasks-changed", updated);
            }
        },
    )
    .await
    .map_err(|error| error.to_string())?;

    tasks::start_watching_task(
        client.inner().clone(),
        created.task_id.clone(),
        watched.inner().clone(),
        watch_handle.inner().clone(),
        task_list.inner().clone(),
        {
            let app = app.clone();
            move |task: &Task| {
                let _ = app.emit("task-detail-changed", task);
            }
        },
        {
            let app = app.clone();
            move |updated: &[Task]| {
                let _ = app.emit("tasks-changed", updated);
            }
        },
    );

    Ok(created)
}

/// Resumes a blocked task and re-opens its watch (with the bounded
/// premature-`blocked` retry - see `services::tasks::resume_task_and_rewatch`
/// and docs/adr/007-task-center-polling-and-sse.md).
#[tauri::command]
pub async fn resume_task(
    task_id: String,
    client: State<'_, Arc<CoreHttpClient>>,
    task_list: State<'_, SharedTaskList>,
    watched: State<'_, SharedWatchedTask>,
    watch_handle: State<'_, SharedTaskWatchHandle>,
    app: AppHandle,
) -> Result<(), String> {
    tasks::resume_task_and_rewatch(
        client.inner().clone(),
        task_id,
        watched.inner().clone(),
        watch_handle.inner().clone(),
        task_list.inner().clone(),
        {
            let app = app.clone();
            move |task: &Task| {
                let _ = app.emit("task-detail-changed", task);
            }
        },
        {
            let app = app.clone();
            move |updated: &[Task]| {
                let _ = app.emit("tasks-changed", updated);
            }
        },
    )
    .await
    .map_err(|error| error.to_string())
}

/// Fetches CodexiaCore's metrics snapshot fresh - called both on Provider
/// Center's mount and by its "Refresh" button (see `services::metrics`).
/// Unlike `get_tasks`, there's no synchronous state-read counterpart: no
/// background poll loop keeps a metrics snapshot warm, so every read is
/// this same round trip.
#[tauri::command]
pub async fn get_metrics(
    client: State<'_, Arc<CoreHttpClient>>,
) -> Result<MetricsSnapshot, String> {
    metrics::fetch_metrics(client.inner())
        .await
        .map_err(|error| error.to_string())
}

/// Fetches Ollama's runtime status (loaded models/VRAM) fresh - called
/// both on Runtime Center's mount and by its "Refresh" button, same shape
/// as `get_metrics` (see `services::runtime`).
#[tauri::command]
pub async fn get_ollama_runtime(
    client: State<'_, Arc<CoreHttpClient>>,
) -> Result<OllamaRuntimeStatus, String> {
    runtime::fetch_ollama_runtime(client.inner())
        .await
        .map_err(|error| error.to_string())
}

/// Fetches a project's current memory items fresh - called both on
/// Memory Center's mount/project-id change and by its "Refresh" button
/// (see `services::memory`).
#[tauri::command]
pub async fn get_project_memory(
    project_id: String,
    client: State<'_, Arc<CoreHttpClient>>,
) -> Result<Vec<MemoryItem>, String> {
    memory::fetch_project_memory(client.inner(), &project_id)
        .await
        .map_err(|error| error.to_string())
}

/// Forgets a memory key, then returns the refreshed list in the same
/// round trip (see `services::memory::forget_and_refresh`).
#[tauri::command]
pub async fn forget_project_memory(
    project_id: String,
    key: String,
    client: State<'_, Arc<CoreHttpClient>>,
) -> Result<Vec<MemoryItem>, String> {
    memory::forget_and_refresh(client.inner(), &project_id, &key)
        .await
        .map_err(|error| error.to_string())
}

/// Fetches CodexiaCore's derived event log fresh - called both on Log
/// Center's mount and by its "Refresh" button (see `services::events`).
#[tauri::command]
pub async fn get_events(
    limit: u32,
    client: State<'_, Arc<CoreHttpClient>>,
) -> Result<Vec<SystemEvent>, String> {
    events::fetch_events(client.inner(), limit)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn cancel_task(
    task_id: String,
    client: State<'_, Arc<CoreHttpClient>>,
    task_list: State<'_, SharedTaskList>,
    app: AppHandle,
) -> Result<CancelResult, String> {
    tasks::cancel_task_and_refresh(client.inner(), &task_id, task_list.inner(), &{
        let app = app.clone();
        move |updated: &[Task]| {
            let _ = app.emit("tasks-changed", updated);
        }
    })
    .await
    .map_err(|error| error.to_string())
}

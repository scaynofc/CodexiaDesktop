//! Tauri commands - the thin `invoke()` surface the Presentation layer
//! calls. Each command dispatches to Desktop Services; commands never
//! contain business logic themselves.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::core_bridge::{CancelResult, CoreHttpClient, Task, TaskCreated};
use crate::services::connection::{ConnectionStatus, SharedConnectionStatus};
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
#[tauri::command]
pub fn watch_task(
    task_id: String,
    client: State<'_, Arc<CoreHttpClient>>,
    watched: State<'_, SharedWatchedTask>,
    watch_handle: State<'_, SharedTaskWatchHandle>,
    task_list: State<'_, SharedTaskList>,
    app: AppHandle,
) {
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

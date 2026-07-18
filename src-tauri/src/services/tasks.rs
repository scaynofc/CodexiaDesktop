//! Owns Task Center's behavior: list refresh cadence, the currently-watched
//! task's live SSE updates, and the create/resume/cancel actions. Core
//! Bridge only knows how to make one call or open one stream; this module
//! decides when to do that and what the results mean (see
//! docs/adr/003-layered-architecture.md, docs/adr/007-task-center-polling-and-sse.md).

use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::core_bridge::{self, BridgeError, CoreHttpClient, Task, TaskEvent, TaskState};
use crate::services::connection::{ConnectionState, SharedConnectionStatus};

const TASK_LIST_POLL_INTERVAL: Duration = Duration::from_secs(5);
const RESUME_RETRY_DELAY: Duration = Duration::from_millis(600);
const RESUME_RETRY_ATTEMPTS: u32 = 3;

pub type SharedTaskList = Arc<Mutex<Vec<Task>>>;
pub type SharedWatchedTask = Arc<Mutex<Option<Task>>>;
pub type SharedTaskWatchHandle = Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>;

pub fn shared_task_list_initial() -> SharedTaskList {
    Arc::new(Mutex::new(Vec::new()))
}

pub fn shared_watched_task_initial() -> SharedWatchedTask {
    Arc::new(Mutex::new(None))
}

pub fn shared_task_watch_handle_initial() -> SharedTaskWatchHandle {
    Arc::new(Mutex::new(None))
}

/// What Core Bridge exposes for listing tasks - a trait (not the concrete
/// `CoreHttpClient`) so `refresh_task_list` can be tested with a scripted
/// fake, mirroring `services::connection`'s `HealthProbe`.
pub trait TaskLister: Send + Sync {
    fn list_tasks(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<Task>, BridgeError>> + Send;
}

impl TaskLister for CoreHttpClient {
    async fn list_tasks(&self) -> Result<Vec<Task>, BridgeError> {
        CoreHttpClient::list_tasks(self).await
    }
}

impl<L: TaskLister> TaskLister for Arc<L> {
    async fn list_tasks(&self) -> Result<Vec<Task>, BridgeError> {
        L::list_tasks(self).await
    }
}

/// Fetches the task list and updates `shared`, firing `on_change` only if it
/// actually differs from what's already stored - mirrors
/// `services::connection::poll_once`'s discipline exactly.
pub async fn refresh_task_list<L: TaskLister>(
    lister: &L,
    shared: &SharedTaskList,
    on_change: &impl Fn(&[Task]),
) -> Result<(), BridgeError> {
    let previous = shared.lock().unwrap().clone();
    let tasks = lister.list_tasks().await?;

    if tasks != previous {
        on_change(&tasks);
    }
    *shared.lock().unwrap() = tasks;

    Ok(())
}

/// Pure gate: should the periodic list poll actually call Core right now?
/// Skipping while not `Connected` avoids hammering a Core we already know
/// is unreachable - `services::connection` is the sole authority on that.
fn should_poll_task_list(connection_state: ConnectionState) -> bool {
    connection_state == ConnectionState::Connected
}

/// Runs forever (wrap in `services::connection::run_supervised` at the call
/// site - reused, not reimplemented), refreshing the task list every
/// [`TASK_LIST_POLL_INTERVAL`] while Core is reachable. This is a
/// deliberate addition beyond CodexiaCore's own reference dashboard (which
/// only refreshes on explicit user actions) - tasks can also appear via
/// CodexiaCore's webhook endpoint or a concurrent CLI session, which this
/// app has no event-based way to learn about.
pub async fn run_task_list_poll_loop<L: TaskLister>(
    lister: L,
    shared: SharedTaskList,
    connection_status: SharedConnectionStatus,
    on_change: impl Fn(&[Task]),
) {
    loop {
        let current_state = connection_status.lock().unwrap().state;
        if should_poll_task_list(current_state) {
            if let Err(error) = refresh_task_list(&lister, &shared, &on_change).await {
                eprintln!("[tasks] list refresh failed: {error}");
            }
        }
        tokio::time::sleep(TASK_LIST_POLL_INTERVAL).await;
    }
}

/// Pure decision at the heart of the resume race fix: `BLOCKED` is a
/// stream-terminal state server-side, so resuming a task means re-opening
/// its watch - but re-opening immediately can race the background resume
/// actually starting, in which case the new watch's first cycle still sees
/// `blocked` and looks identical to steady-state "nothing happened."
/// Distinguishes the two: only retry when this watch was itself started
/// with retries available (i.e. triggered by a resume, never a plain
/// user-selects-an-already-blocked-task open, which always starts with
/// exactly one attempt) AND the state was `Blocked` both before this watch
/// attempt and at the point the stream ended.
fn should_retry_after_blocked(
    state_before_this_attempt: Option<TaskState>,
    state_when_stream_ended: Option<TaskState>,
    attempts_remaining: u32,
) -> bool {
    attempts_remaining > 1
        && state_before_this_attempt == Some(TaskState::Blocked)
        && state_when_stream_ended == Some(TaskState::Blocked)
}

fn abort_previous_watch(watch_handle: &SharedTaskWatchHandle) {
    if let Some(handle) = watch_handle.lock().unwrap().take() {
        handle.abort();
    }
}

/// Starts (or switches to) watching one task's live SSE updates. Aborts any
/// previous watch first, so only one is ever running - switching tasks in
/// the UI must not leave a stale watch silently updating the wrong state.
/// Deliberately NOT wrapped in `run_supervised`: this task is naturally
/// bounded (ends at a terminal state or Core's own ~300s timeout) and gets
/// recreated fresh every time the user selects a task, so a panic here
/// degrades to "this one task's live view stops a bit early," not a
/// silent-forever failure - see docs/adr/007-task-center-polling-and-sse.md.
pub fn start_watching_task(
    client: Arc<CoreHttpClient>,
    task_id: String,
    watched: SharedWatchedTask,
    watch_handle: SharedTaskWatchHandle,
    task_list: SharedTaskList,
    on_task_change: impl Fn(&Task) + Send + Sync + 'static,
    on_list_change: impl Fn(&[Task]) + Send + Sync + 'static,
) {
    spawn_watch(
        client,
        task_id,
        watched,
        watch_handle,
        task_list,
        on_task_change,
        on_list_change,
        1,
    );
}

/// Resumes a blocked task, then re-opens its watch with retries available
/// (see [`should_retry_after_blocked`]) - unlike [`start_watching_task`],
/// which always starts with exactly one attempt.
pub async fn resume_task_and_rewatch(
    client: Arc<CoreHttpClient>,
    task_id: String,
    watched: SharedWatchedTask,
    watch_handle: SharedTaskWatchHandle,
    task_list: SharedTaskList,
    on_task_change: impl Fn(&Task) + Send + Sync + 'static,
    on_list_change: impl Fn(&[Task]) + Send + Sync + 'static,
) -> Result<(), BridgeError> {
    client.resume_task(&task_id).await?;

    spawn_watch(
        client,
        task_id,
        watched,
        watch_handle,
        task_list,
        on_task_change,
        on_list_change,
        RESUME_RETRY_ATTEMPTS,
    );

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn spawn_watch(
    client: Arc<CoreHttpClient>,
    task_id: String,
    watched: SharedWatchedTask,
    watch_handle: SharedTaskWatchHandle,
    task_list: SharedTaskList,
    on_task_change: impl Fn(&Task) + Send + Sync + 'static,
    on_list_change: impl Fn(&[Task]) + Send + Sync + 'static,
    attempts_remaining: u32,
) {
    abort_previous_watch(&watch_handle);

    let handle = tokio::spawn(async move {
        run_watch_with_retry(
            &client,
            &task_id,
            &watched,
            &on_task_change,
            attempts_remaining,
        )
        .await;
        let _ = refresh_task_list(&client, &task_list, &on_list_change).await;
    });

    *watch_handle.lock().unwrap() = Some(handle);
}

async fn run_watch_with_retry(
    client: &CoreHttpClient,
    task_id: &str,
    watched: &SharedWatchedTask,
    on_task_change: &impl Fn(&Task),
    mut attempts_remaining: u32,
) {
    let state_before = watched.lock().unwrap().as_ref().map(|task| task.state);

    loop {
        let result = core_bridge::watch_task(client, task_id, |event| {
            if let TaskEvent::Snapshot(task) = event {
                *watched.lock().unwrap() = Some((**task).clone());
                on_task_change(task);
            }
        })
        .await;

        let ended_state = match result {
            Ok(state) => state,
            Err(error) => {
                eprintln!("[tasks] watch for {task_id} failed: {error}");
                return;
            }
        };

        if should_retry_after_blocked(state_before, ended_state, attempts_remaining) {
            attempts_remaining -= 1;
            tokio::time::sleep(RESUME_RETRY_DELAY).await;
            continue;
        }

        return;
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_task_and_refresh(
    client: &CoreHttpClient,
    goal: &str,
    require_approval: bool,
    simulate: bool,
    project_id: Option<&str>,
    enable_approval_queue: bool,
    task_list: &SharedTaskList,
    on_list_change: &impl Fn(&[Task]),
) -> Result<core_bridge::TaskCreated, BridgeError> {
    let created = client
        .create_task(
            goal,
            require_approval,
            simulate,
            project_id,
            enable_approval_queue,
        )
        .await?;
    refresh_task_list(client, task_list, on_list_change).await?;
    Ok(created)
}

pub async fn cancel_task_and_refresh(
    client: &CoreHttpClient,
    task_id: &str,
    task_list: &SharedTaskList,
    on_list_change: &impl Fn(&[Task]),
) -> Result<core_bridge::CancelResult, BridgeError> {
    let result = client.cancel_task(task_id).await?;
    refresh_task_list(client, task_list, on_list_change).await?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str, state: TaskState) -> Task {
        Task {
            id: id.to_string(),
            goal: "goal".to_string(),
            state,
            steps: Vec::new(),
            error: None,
            created_at: "c".to_string(),
            updated_at: "u".to_string(),
            validation_usage: None,
            plan_revisions: 0,
            parent_task_id: None,
            delegation_depth: 0,
            forced_role: None,
            simulated: false,
            project_id: None,
        }
    }

    struct ScriptedTaskLister {
        responses: std::sync::Mutex<std::vec::IntoIter<Result<Vec<Task>, BridgeError>>>,
    }

    impl ScriptedTaskLister {
        fn new(responses: Vec<Result<Vec<Task>, BridgeError>>) -> Self {
            Self {
                responses: std::sync::Mutex::new(responses.into_iter()),
            }
        }
    }

    impl TaskLister for ScriptedTaskLister {
        async fn list_tasks(&self) -> Result<Vec<Task>, BridgeError> {
            self.responses
                .lock()
                .unwrap()
                .next()
                .unwrap_or(Ok(Vec::new()))
        }
    }

    #[tokio::test]
    async fn refresh_task_list_only_fires_on_change_when_the_list_actually_differs() {
        let lister = ScriptedTaskLister::new(vec![
            Ok(vec![task("t1", TaskState::Running)]),
            Ok(vec![task("t1", TaskState::Running)]), // unchanged
            Ok(vec![task("t1", TaskState::Done)]),    // changed
        ]);
        let shared = shared_task_list_initial();
        let changes = Arc::new(Mutex::new(Vec::new()));

        for _ in 0..3 {
            let changes_clone = changes.clone();
            refresh_task_list(&lister, &shared, &move |tasks: &[Task]| {
                changes_clone.lock().unwrap().push(tasks.to_vec());
            })
            .await
            .unwrap();
        }

        let recorded = changes.lock().unwrap();
        assert_eq!(recorded.len(), 2, "initial fetch + the one real change");
        assert_eq!(shared.lock().unwrap()[0].state, TaskState::Done);
    }

    #[test]
    fn should_poll_task_list_only_when_connected() {
        assert!(should_poll_task_list(ConnectionState::Connected));
        assert!(!should_poll_task_list(ConnectionState::Connecting));
        assert!(!should_poll_task_list(ConnectionState::Reconnecting));
        assert!(!should_poll_task_list(ConnectionState::Disconnected));
    }

    #[test]
    fn does_not_retry_a_plain_selection_of_an_already_blocked_task() {
        // attempts_remaining=1 is exactly what start_watching_task always
        // passes - a resume was never issued, so blocked-before/blocked-after
        // is the correct steady state, not a race to retry through.
        assert!(!should_retry_after_blocked(
            Some(TaskState::Blocked),
            Some(TaskState::Blocked),
            1,
        ));
    }

    #[test]
    fn retries_when_a_resume_is_in_flight_and_the_watch_still_ends_blocked() {
        assert!(should_retry_after_blocked(
            Some(TaskState::Blocked),
            Some(TaskState::Blocked),
            RESUME_RETRY_ATTEMPTS,
        ));
    }

    #[test]
    fn does_not_retry_once_the_resume_has_visibly_taken_effect() {
        assert!(!should_retry_after_blocked(
            Some(TaskState::Blocked),
            Some(TaskState::Running),
            RESUME_RETRY_ATTEMPTS,
        ));
        assert!(!should_retry_after_blocked(
            Some(TaskState::Blocked),
            Some(TaskState::Done),
            RESUME_RETRY_ATTEMPTS,
        ));
    }

    #[test]
    fn stops_retrying_once_attempts_are_exhausted() {
        assert!(!should_retry_after_blocked(
            Some(TaskState::Blocked),
            Some(TaskState::Blocked),
            1,
        ));
    }

    #[test]
    fn does_not_retry_when_there_was_no_prior_snapshot() {
        // First-ever watch of a task Desktop has no earlier snapshot for -
        // can't have raced a resume it never issued.
        assert!(!should_retry_after_blocked(
            None,
            Some(TaskState::Blocked),
            RESUME_RETRY_ATTEMPTS
        ));
    }
}

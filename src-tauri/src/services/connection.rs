//! Owns Core connectivity: polling cadence, backoff, the connection state
//! machine, and restart detection. Core Bridge only knows how to make one
//! HTTP call; this module decides what a sequence of results *means* and
//! when the frontend should be told about it (see
//! docs/adr/003-layered-architecture.md).
//!
//! State is shared via a plain `Arc<Mutex<ConnectionStatus>>`, not
//! `tokio::sync::watch` - deliberately, after a real bug found during Phase
//! 2's manual verification: `watch::Sender::send()` only actually stores a
//! new value when at least one `Receiver` is alive, and this module never
//! needed "await the next change" semantics (only "poll, push, and let a
//! command read the latest value on demand"), so `watch` was the wrong
//! primitive for what this code actually does - see
//! docs/adr/005-connection-state-machine.md for the full account.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;

use crate::core_bridge::{BridgeError, HealthResponse};

const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(3);
const INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

pub type SharedConnectionStatus = Arc<Mutex<ConnectionStatus>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ConnectionState {
    /// No successful health check yet, and the first attempt hasn't
    /// completed - the state shown the instant the app starts.
    Connecting,
    /// The most recent health check succeeded.
    Connected,
    /// Was Connected before; the most recent health check failed and
    /// we're retrying with backoff.
    Reconnecting,
    /// Never connected, or connecting failed enough that there's nothing
    /// to "re" about it yet.
    Disconnected,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConnectionStatus {
    pub state: ConnectionState,
    pub health: Option<HealthResponse>,
    /// True only on the one status update where a new instance_id was
    /// observed after a previously-known one - a real Core restart, not a
    /// transient network failure. Callers that only care about the current
    /// snapshot (e.g. a command reading the latest status) should treat
    /// this as informational, not sticky - it describes what just changed.
    pub restarted: bool,
}

impl ConnectionStatus {
    pub fn initial() -> Self {
        Self {
            state: ConnectionState::Connecting,
            health: None,
            restarted: false,
        }
    }

    pub fn shared_initial() -> SharedConnectionStatus {
        Arc::new(Mutex::new(Self::initial()))
    }
}

/// The only real decision logic in this module - pure, no I/O, no timing.
/// Given the previous status and one poll result, computes the next status.
pub fn next_status(
    previous: &ConnectionStatus,
    poll_result: Result<HealthResponse, BridgeError>,
) -> ConnectionStatus {
    match poll_result {
        Ok(health) => {
            let restarted = previous
                .health
                .as_ref()
                .is_some_and(|prev| prev.instance_id != health.instance_id);
            ConnectionStatus {
                state: ConnectionState::Connected,
                health: Some(health),
                restarted,
            }
        }
        Err(_) => {
            let state = match previous.state {
                ConnectionState::Connected | ConnectionState::Reconnecting => {
                    ConnectionState::Reconnecting
                }
                ConnectionState::Connecting | ConnectionState::Disconnected => {
                    ConnectionState::Disconnected
                }
            };
            ConnectionStatus {
                state,
                health: previous.health.clone(),
                restarted: false,
            }
        }
    }
}

/// Doubles on every consecutive failure, capped, resets to the initial
/// delay on any success - a small, self-contained backoff schedule (no new
/// dependency needed for something this simple).
struct Backoff {
    current: Duration,
}

impl Backoff {
    fn new() -> Self {
        Self {
            current: INITIAL_BACKOFF,
        }
    }

    fn on_success(&mut self) -> Duration {
        self.current = INITIAL_BACKOFF;
        DEFAULT_POLL_INTERVAL
    }

    fn on_failure(&mut self) -> Duration {
        let delay = self.current;
        self.current = (self.current * 2).min(MAX_BACKOFF);
        delay
    }
}

/// What Core Bridge exposes to Desktop Services - a trait (not the concrete
/// `CoreHttpClient`) so the polling loop and, more importantly, `next_status`
/// above can be exercised in tests with a scripted fake, no real HTTP.
pub trait HealthProbe: Send + Sync {
    fn get_health(
        &self,
    ) -> impl std::future::Future<Output = Result<HealthResponse, BridgeError>> + Send;
}

impl HealthProbe for crate::core_bridge::CoreHttpClient {
    async fn get_health(&self) -> Result<HealthResponse, BridgeError> {
        crate::core_bridge::CoreHttpClient::get_health(self).await
    }
}

/// Lets an `Arc<P>` stand in for `P` itself, so a single probe can be
/// shared (cheaply cloned) across repeated `run_connection_loop` spawns in
/// `run_supervised` below, without requiring `P` itself to implement
/// `Clone`.
impl<P: HealthProbe> HealthProbe for Arc<P> {
    async fn get_health(&self) -> Result<HealthResponse, BridgeError> {
        P::get_health(self).await
    }
}

/// How long to wait before respawning a supervised task that just exited
/// (whether by panic or, unexpectedly, by returning) - short enough that a
/// transient crash barely delays reconnection, long enough to not spin a
/// tight loop if the task fails immediately every time.
pub const SUPERVISOR_RESTART_DELAY: Duration = Duration::from_secs(1);

/// Runs `make_task()` forever, restarting it if it ever panics or returns.
/// `run_connection_loop` below is itself an infinite loop that should only
/// ever stop via a bug (a panic), and a silently-dead poll loop would freeze
/// the UI's last-known status forever with no indication anything is
/// wrong - this is the fix for that failure mode, not a hypothetical.
///
/// Deliberately plain `tokio::spawn` (not `tauri::async_runtime::spawn`), so
/// this stays Tauri-agnostic and directly unit-testable with `#[tokio::test]`.
/// Tauri's own async runtime is tokio, so the supervised task still runs on
/// the same runtime regardless of how the *outer* future (this one) got
/// there.
pub async fn run_supervised<Fut>(make_task: impl Fn() -> Fut, restart_delay: Duration)
where
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    loop {
        let handle = tokio::spawn(make_task());
        match handle.await {
            Ok(()) => {
                eprintln!("[connection] supervised task exited normally; restarting");
            }
            Err(join_error) => {
                eprintln!("[connection] supervised task panicked: {join_error}; restarting");
            }
        }
        tokio::time::sleep(restart_delay).await;
    }
}

/// Runs forever, polling `probe` and updating `shared_status`. `on_change`
/// fires only when the status actually changes (not on every poll tick) -
/// Tauri event emission happens there, keeping this function itself
/// independent of any Tauri type.
pub async fn run_connection_loop<P: HealthProbe>(
    probe: P,
    shared_status: SharedConnectionStatus,
    on_change: impl Fn(&ConnectionStatus),
) {
    let mut backoff = Backoff::new();
    loop {
        let delay = poll_once(&probe, &shared_status, &mut backoff, &on_change).await;
        tokio::time::sleep(delay).await;
    }
}

/// One iteration of the loop above, factored out so tests can drive the
/// real production code path directly - no sleeping, no infinite loop -
/// instead of a second copy of the same logic. Returns the delay the caller
/// should wait before the next poll.
async fn poll_once<P: HealthProbe>(
    probe: &P,
    shared_status: &SharedConnectionStatus,
    backoff: &mut Backoff,
    on_change: &impl Fn(&ConnectionStatus),
) -> Duration {
    let previous = shared_status.lock().unwrap().clone();
    let result = probe.get_health().await;
    let next = next_status(&previous, result.clone());
    let delay = if result.is_ok() {
        backoff.on_success()
    } else {
        backoff.on_failure()
    };

    if next != previous {
        on_change(&next);
    }
    *shared_status.lock().unwrap() = next;

    delay
}

#[cfg(test)]
mod tests {
    use super::*;

    fn health(instance_id: &str) -> HealthResponse {
        HealthResponse {
            status: "ok".into(),
            alive: true,
            core_version: "2.0.0".into(),
            api_version: 1,
            protocol_version: 1,
            instance_id: instance_id.into(),
            timestamp: "2026-07-16T00:00:00+00:00".into(),
        }
    }

    #[test]
    fn initial_status_is_connecting_with_no_health() {
        let status = ConnectionStatus::initial();

        assert_eq!(status.state, ConnectionState::Connecting);
        assert!(status.health.is_none());
        assert!(!status.restarted);
    }

    #[test]
    fn first_successful_poll_transitions_to_connected() {
        let previous = ConnectionStatus::initial();

        let next = next_status(&previous, Ok(health("boot-1")));

        assert_eq!(next.state, ConnectionState::Connected);
        assert_eq!(next.health.unwrap().instance_id, "boot-1");
        assert!(!next.restarted, "first-ever connection is not a restart");
    }

    #[test]
    fn repeated_success_with_the_same_instance_id_is_not_a_restart() {
        let previous = next_status(&ConnectionStatus::initial(), Ok(health("boot-1")));

        let next = next_status(&previous, Ok(health("boot-1")));

        assert_eq!(next.state, ConnectionState::Connected);
        assert!(!next.restarted);
    }

    #[test]
    fn a_new_instance_id_after_a_known_one_is_detected_as_a_restart() {
        let previous = next_status(&ConnectionStatus::initial(), Ok(health("boot-1")));

        let next = next_status(&previous, Ok(health("boot-2")));

        assert_eq!(next.state, ConnectionState::Connected);
        assert!(next.restarted);
    }

    #[test]
    fn failure_before_ever_connecting_goes_to_disconnected_not_reconnecting() {
        let previous = ConnectionStatus::initial();

        let next = next_status(&previous, Err(BridgeError::ConnectionRefused));

        assert_eq!(next.state, ConnectionState::Disconnected);
    }

    #[test]
    fn failure_after_being_connected_goes_to_reconnecting() {
        let previous = next_status(&ConnectionStatus::initial(), Ok(health("boot-1")));

        let next = next_status(&previous, Err(BridgeError::ConnectionRefused));

        assert_eq!(next.state, ConnectionState::Reconnecting);
        // Last-known health is preserved while reconnecting, not wiped out.
        assert_eq!(next.health.unwrap().instance_id, "boot-1");
    }

    #[test]
    fn recovering_from_reconnecting_clears_back_to_connected() {
        let connected = next_status(&ConnectionStatus::initial(), Ok(health("boot-1")));
        let reconnecting = next_status(&connected, Err(BridgeError::Timeout));

        let recovered = next_status(&reconnecting, Ok(health("boot-1")));

        assert_eq!(recovered.state, ConnectionState::Connected);
        assert!(
            !recovered.restarted,
            "recovering from a blip, same instance_id, is not a restart"
        );
    }

    #[test]
    fn recovering_from_reconnecting_with_a_new_instance_id_is_a_restart() {
        let connected = next_status(&ConnectionStatus::initial(), Ok(health("boot-1")));
        let reconnecting = next_status(&connected, Err(BridgeError::ConnectionRefused));

        let recovered = next_status(&reconnecting, Ok(health("boot-2")));

        assert_eq!(recovered.state, ConnectionState::Connected);
        assert!(
            recovered.restarted,
            "reconnected to a genuinely different process"
        );
    }

    #[test]
    fn backoff_doubles_on_consecutive_failures_and_caps() {
        let mut backoff = Backoff::new();

        assert_eq!(backoff.on_failure(), Duration::from_secs(1));
        assert_eq!(backoff.on_failure(), Duration::from_secs(2));
        assert_eq!(backoff.on_failure(), Duration::from_secs(4));
        assert_eq!(backoff.on_failure(), Duration::from_secs(8));
        assert_eq!(backoff.on_failure(), Duration::from_secs(16));
        assert_eq!(
            backoff.on_failure(),
            Duration::from_secs(30),
            "capped at MAX_BACKOFF"
        );
        assert_eq!(
            backoff.on_failure(),
            Duration::from_secs(30),
            "stays capped"
        );
    }

    #[test]
    fn backoff_resets_to_the_initial_delay_after_a_success() {
        let mut backoff = Backoff::new();
        backoff.on_failure();
        backoff.on_failure();

        let after_success = backoff.on_success();
        let next_failure_delay = backoff.on_failure();

        assert_eq!(after_success, DEFAULT_POLL_INTERVAL);
        assert_eq!(next_failure_delay, INITIAL_BACKOFF);
    }

    struct ScriptedProbe {
        responses: std::sync::Mutex<std::vec::IntoIter<Result<HealthResponse, BridgeError>>>,
    }

    impl ScriptedProbe {
        fn new(responses: Vec<Result<HealthResponse, BridgeError>>) -> Self {
            Self {
                responses: std::sync::Mutex::new(responses.into_iter()),
            }
        }
    }

    impl HealthProbe for ScriptedProbe {
        async fn get_health(&self) -> Result<HealthResponse, BridgeError> {
            self.responses
                .lock()
                .unwrap()
                .next()
                .unwrap_or(Err(BridgeError::ConnectionRefused))
        }
    }

    /// Drives `poll_once` directly (the exact function `run_connection_loop`
    /// calls every iteration) - no sleeping, no infinite loop, but genuinely
    /// the production code path, not a re-implementation of its logic.
    /// Deliberately drops every local reference to `shared_status` between
    /// iterations except the one `Arc` clone passed to `poll_once` each
    /// time, mirroring exactly how `lib.rs` holds only one long-lived `Arc`
    /// - this is the shape that caught the real `watch`-channel bug this
    /// module used to have (see the module docstring).
    #[tokio::test]
    async fn poll_once_only_invokes_on_change_when_the_status_actually_changes() {
        // success, success (same instance - no change), failure (change)
        let probe = ScriptedProbe::new(vec![
            Ok(health("boot-1")),
            Ok(health("boot-1")),
            Err(BridgeError::ConnectionRefused),
        ]);
        let shared_status = ConnectionStatus::shared_initial();
        let changes = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut backoff = Backoff::new();

        for _ in 0..3 {
            let changes_clone = changes.clone();
            poll_once(
                &probe,
                &shared_status,
                &mut backoff,
                &move |status: &ConnectionStatus| {
                    changes_clone.lock().unwrap().push(status.clone());
                },
            )
            .await;
        }

        let recorded = changes.lock().unwrap();
        assert_eq!(
            recorded.len(),
            2,
            "connecting->connected, then connected->reconnecting"
        );
        assert_eq!(recorded[0].state, ConnectionState::Connected);
        assert_eq!(recorded[1].state, ConnectionState::Reconnecting);
        // The shared status genuinely persisted the last computed value -
        // this is exactly the assertion the old watch-based bug would fail.
        assert_eq!(
            shared_status.lock().unwrap().state,
            ConnectionState::Reconnecting
        );
    }

    #[tokio::test]
    async fn poll_once_returns_the_normal_poll_interval_after_success_and_a_short_delay_after_failure(
    ) {
        let probe = ScriptedProbe::new(vec![Ok(health("boot-1")), Err(BridgeError::Timeout)]);
        let shared_status = ConnectionStatus::shared_initial();
        let mut backoff = Backoff::new();

        let after_success = poll_once(
            &probe,
            &shared_status,
            &mut backoff,
            &|_: &ConnectionStatus| {},
        )
        .await;
        let after_failure = poll_once(
            &probe,
            &shared_status,
            &mut backoff,
            &|_: &ConnectionStatus| {},
        )
        .await;

        assert_eq!(after_success, DEFAULT_POLL_INTERVAL);
        assert_eq!(after_failure, INITIAL_BACKOFF);
    }

    /// The actual regression test for the bug this refactor fixes: a fresh
    /// `Arc<Mutex<_>>` with NO other clones kept alive anywhere (unlike the
    /// old `watch::channel` whose `Sender::send()` silently no-oped without
    /// a live `Receiver`) must still persist updates across iterations.
    #[tokio::test]
    async fn shared_status_persists_across_iterations_with_no_other_handles_alive() {
        let probe = ScriptedProbe::new(vec![Ok(health("boot-1")), Ok(health("boot-1"))]);
        let shared_status = ConnectionStatus::shared_initial();
        let mut backoff = Backoff::new();

        poll_once(
            &probe,
            &shared_status,
            &mut backoff,
            &|_: &ConnectionStatus| {},
        )
        .await;
        assert_eq!(
            shared_status.lock().unwrap().state,
            ConnectionState::Connected
        );

        // If this were still watch-channel-backed with no receiver, the second
        // poll's "previous" read would incorrectly see Connecting again.
        poll_once(
            &probe,
            &shared_status,
            &mut backoff,
            &|_: &ConnectionStatus| {},
        )
        .await;
        assert_eq!(
            shared_status.lock().unwrap().state,
            ConnectionState::Connected
        );
    }

    /// The actual regression test for the "silent death" failure mode this
    /// supervisor exists to fix: a task that panics on its first attempt
    /// must still be running (and making progress) afterward, not just
    /// caught-and-abandoned.
    #[tokio::test]
    async fn run_supervised_restarts_the_task_after_it_panics() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let attempts = Arc::new(AtomicUsize::new(0));
        let attempts_for_task = attempts.clone();

        let supervisor = tokio::spawn(run_supervised(
            move || {
                let attempts = attempts_for_task.clone();
                async move {
                    let n = attempts.fetch_add(1, Ordering::SeqCst);
                    if n == 0 {
                        panic!("simulated panic on the first attempt");
                    }
                }
            },
            Duration::from_millis(5),
        ));

        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        while attempts.load(Ordering::SeqCst) < 2 && tokio::time::Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }

        assert!(
            attempts.load(Ordering::SeqCst) >= 2,
            "supervisor did not restart the task after it panicked"
        );

        supervisor.abort();
    }
}

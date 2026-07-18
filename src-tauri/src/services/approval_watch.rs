//! Background watcher for CodexiaCore's approval-aware SSE stream
//! (`GET /approvals/stream`, CodexiaCore's docs/adr/021-approval-aware-sse.md).
//! Unlike Approval Center's own screen-scoped polling (the interval lives
//! directly in `Approvals.tsx`, not in this codebase's Rust layer at all -
//! see docs/adr/014-approval-center-human-in-the-loop.md), this loop runs
//! for the app's entire lifetime, spawned once in `lib.rs`'s `setup()`, so
//! a sidebar badge and OS notifications stay accurate regardless of which
//! screen is active. See docs/adr/017-approval-awareness.md.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::core_bridge::{Approval, ApprovalStreamEvent, CoreHttpClient};
use crate::services::connection::{ConnectionState, SharedConnectionStatus};

pub type SharedPendingApprovals = Arc<Mutex<Vec<Approval>>>;

pub fn shared_pending_approvals_initial() -> SharedPendingApprovals {
    Arc::new(Mutex::new(Vec::new()))
}

/// How long to wait before reconnecting after the SSE connection itself
/// failed (not a clean server-side timeout, which reconnects immediately -
/// see `run_approval_watch_loop` below). Same value as
/// `connection::SUPERVISOR_RESTART_DELAY` - short enough not to leave the
/// badge/notifications stale for long, long enough not to spin on a
/// genuinely down Core.
const RECONNECT_DELAY: Duration = Duration::from_secs(1);

/// Pure decision: which approvals in `current` weren't present in
/// `previous`, by id. This is what "worth an OS notification" means here -
/// a decided approval disappearing, or an unchanged list arriving again,
/// must never notify; only a genuinely new pending approval should.
pub fn newly_appeared_approvals(previous: &[Approval], current: &[Approval]) -> Vec<Approval> {
    let previous_ids: HashSet<&str> = previous.iter().map(|a| a.id.as_str()).collect();
    current
        .iter()
        .filter(|a| !previous_ids.contains(a.id.as_str()))
        .cloned()
        .collect()
}

/// Runs forever (wrap in `services::connection::run_supervised` at the
/// call site, reused not reimplemented). Skips connecting while Core is
/// known unreachable, mirroring `services::tasks::should_poll_task_list`'s
/// identical gate. A clean server-side timeout (CodexiaCore's own 300s
/// wait budget, `ApprovalStreamEvent::Timeout`) reconnects immediately -
/// it's the *expected* steady state of a long-lived SSE connection, not a
/// failure; only a genuine connection error waits `RECONNECT_DELAY`.
pub async fn run_approval_watch_loop(
    client: Arc<CoreHttpClient>,
    shared: SharedPendingApprovals,
    connection_status: SharedConnectionStatus,
    on_change: impl Fn(&[Approval]) + Send + Sync + 'static,
    on_new_approvals: impl Fn(&[Approval]) + Send + Sync + 'static,
) {
    loop {
        let current_state = connection_status.lock().unwrap().state;
        if current_state != ConnectionState::Connected {
            tokio::time::sleep(RECONNECT_DELAY).await;
            continue;
        }

        let mut previous = shared.lock().unwrap().clone();
        let result = crate::core_bridge::watch_pending_approvals(&client, |event| {
            if let ApprovalStreamEvent::Snapshot(current) = event {
                let new_ones = newly_appeared_approvals(&previous, current);
                if !new_ones.is_empty() {
                    on_new_approvals(&new_ones);
                }
                previous = current.clone();
                *shared.lock().unwrap() = current.clone();
                on_change(current);
            }
        })
        .await;

        if let Err(error) = result {
            eprintln!("[approvals] watch connection failed: {error}");
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_bridge::{ApprovalStatus, ApprovalType};

    fn approval(id: &str) -> Approval {
        Approval {
            id: id.to_string(),
            task_id: None,
            step_id: None,
            approval_type: ApprovalType::Tool,
            payload: serde_json::json!({}),
            status: ApprovalStatus::Pending,
            created_at: "c".to_string(),
            decided_at: None,
            expires_at: None,
            decision_reason: None,
        }
    }

    #[test]
    fn empty_previous_reports_every_current_approval_as_new() {
        let current = vec![approval("a"), approval("b")];

        let new_ones = newly_appeared_approvals(&[], &current);

        assert_eq!(new_ones.len(), 2);
    }

    #[test]
    fn an_unchanged_list_reports_nothing_new() {
        let list = vec![approval("a")];

        let new_ones = newly_appeared_approvals(&list, &list);

        assert!(new_ones.is_empty());
    }

    #[test]
    fn only_the_genuinely_new_id_is_reported() {
        let previous = vec![approval("a")];
        let current = vec![approval("a"), approval("b")];

        let new_ones = newly_appeared_approvals(&previous, &current);

        assert_eq!(new_ones.len(), 1);
        assert_eq!(new_ones[0].id, "b");
    }

    #[test]
    fn a_decided_approval_disappearing_reports_nothing_new() {
        let previous = vec![approval("a"), approval("b")];
        let current = vec![approval("a")]; // "b" got decided and dropped off

        let new_ones = newly_appeared_approvals(&previous, &current);

        assert!(new_ones.is_empty());
    }

    #[test]
    fn empty_to_empty_reports_nothing_new() {
        let new_ones = newly_appeared_approvals(&[], &[]);

        assert!(new_ones.is_empty());
    }
}

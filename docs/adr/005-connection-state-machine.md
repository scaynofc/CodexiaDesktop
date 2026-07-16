# ADR-005: Core Bridge Connection State Machine

**Status:** Accepted

## Context

Phase 2 needed a way for the Desktop app to know, at all times, whether
Codexia Core is reachable - and to tell a genuine Core restart apart from
a transient network blip, since the two warrant different treatment (a
restart may mean in-flight state on the Desktop side is stale; a blip
usually doesn't). This needed to be built as the first real thing living
in Desktop Services (per `docs/adr/003-layered-architecture.md`), on top
of a Core Bridge that only knows how to make one HTTP call at a time.

## Decision

Four states - `Connecting`, `Connected`, `Reconnecting`, `Disconnected` -
computed by a single pure function, `next_status(previous, poll_result)`
(`src-tauri/src/services/connection.rs`), with no I/O and no timing inside
it: given the last known status and the outcome of one health check, it
returns the next status. `Connecting` is the state shown before the very
first poll resolves; `Reconnecting` is only reached from a prior
`Connected` (so the UI can distinguish "never got through yet" from "was
fine, now isn't"); `Disconnected` is reached from `Connecting` or itself
(repeated failures with no prior success).

Restart detection reuses the `instance_id` Core's `/health` now returns
(CodexiaCore ADR-011): if a new successful poll's `instance_id` differs
from the last _known_ one, `restarted: true` is set on that one status
update - a transient failure followed by recovery with the _same_
`instance_id` is correctly not flagged as a restart.

The actual polling loop (`run_connection_loop`) is a thin wrapper: call
`poll_once` (probe -> `next_status` -> store into a shared
`Arc<Mutex<ConnectionStatus>>` -> fire `on_change` only if the status
actually changed), sleep, repeat. Backoff (`Backoff` struct: doubles per
consecutive failure, capped at 30s, resets to 1s on success) is a small,
self-contained schedule - not a new dependency, since the need was this
simple.

State is shared via a plain `Arc<Mutex<ConnectionStatus>>`
(`SharedConnectionStatus`), not `tokio::sync::watch` - see "A `watch`
channel for shared state" below for why that was tried first and reverted.

`HealthProbe` is a trait (Core Bridge's `CoreHttpClient` is the only real
implementor), specifically so `next_status`, `poll_once`, and the backoff
schedule can all be tested with a scripted fake and zero real HTTP or
timing - see the test module in `connection.rs`.

`lib.rs` never spawns `run_connection_loop` directly; it spawns
`run_supervised(make_task, SUPERVISOR_RESTART_DELAY)`, where `make_task` is
a closure that builds a fresh `run_connection_loop(...)` invocation each
time it's called. `run_supervised` awaits the task's `JoinHandle` and, on
either a panic or an (unexpected, since the loop is infinite) normal
return, waits `SUPERVISOR_RESTART_DELAY` and calls `make_task` again - so a
bug inside the poll loop degrades to "a ~1s gap in polling," not "the
connection status is frozen for the rest of the app's life with no
indication anything is wrong." `run_supervised` itself uses plain
`tokio::spawn`, not `tauri::async_runtime::spawn`, keeping `connection.rs`
free of any Tauri dependency and directly testable with `#[tokio::test]`
(Tauri's own async runtime is tokio, so this still runs on the same
runtime once the outer future is spawned via `tauri::async_runtime::spawn`
in `lib.rs`). The same `Arc<Mutex<ConnectionStatus>>` is reused across
restarts, so a recovered poll loop resumes from the last known status
instead of resetting the UI to `Connecting`.

The frontend's "Core restarted" notice is **not** driven directly by
`status.restarted` - see "Deriving persistence from a transient signal"
under Consequences for why, and how `connectionStore.ts` solves it instead.

## Alternatives Considered

- **A boolean "connected" flag instead of four states** - simpler, but
  can't distinguish "still trying for the first time" from "was working,
  now isn't," which matters for what the UI should say (and, later, for
  whether cached data from before a disconnection is still trustworthy).
- **Detecting restarts via a timestamp gap instead of `instance_id`** -
  would require picking an arbitrary "this gap means a restart" threshold,
  and produces false positives from an ordinary slow poll or false
  negatives from a fast restart. A per-process identifier that changes
  exactly once per real restart has no such ambiguity.
- **A real exponential-backoff crate** - more configurable, but this
  project's own "reuse, don't invent... but don't pull in a dependency for
  something this simple" convention (see CodexiaCore's own precedent of
  hand-rolling small schedules rather than reaching for a crate every
  time) applies here too - four lines of doubling-with-a-cap needed no
  library.
- **A `watch` channel for shared state** - the first implementation used
  `tokio::sync::watch::channel` to publish `ConnectionStatus` from the poll
  loop to the `get_connection_status` command, since "one writer, many
  readers, only the latest value matters" is exactly what `watch` is for.
  Manual verification (real Core process, stopped and restarted while
  watching the running app) caught a real bug this shape produces:
  `watch::Sender::send()` only actually stores the new value when at least
  one `Receiver` is still alive; `lib.rs`'s `.setup()` closure bound its
  receiver to a named variable (`_status_rx`, not the wildcard `_`), which
  kept it alive only until `.setup()` returned - dropping it almost
  immediately and silently breaking every subsequent `.send()` for the rest
  of the app's life. The visible symptom: stopping Core showed
  `Disconnected` instead of the expected `Reconnecting`, because
  `poll_once` kept reading back the stale `Connecting` value it had stored
  before the receiver was dropped. Unit tests didn't catch it, because a
  test function's own `_rx` binding stays alive for the test's whole body
  (across multiple `poll_once` calls), accidentally keeping a receiver
  alive throughout - masking the exact short-lived-scope failure mode that
  `.setup()` hits in the real app. Fixed by replacing `watch` with a plain
  `Arc<Mutex<ConnectionStatus>>`: the actual usage pattern (poll-and-push
  via a callback, read-on-demand via a command) never needed `watch`'s
  "await the next change" semantics, so a simpler primitive removes the
  entire bug class rather than working around it. A regression test
  (`shared_status_persists_across_iterations_with_no_other_handles_alive`)
  encodes this: it asserts the second poll's "previous status" reflects the
  first poll's result even with no other handle to the shared state alive
  in the test itself - the exact condition `.setup()` creates.
- **`std::panic::catch_unwind` around the poll loop** - proposed during
  Phase 2 review as a guard against the poll loop dying silently. Rejected:
  it doesn't work for async code. `catch_unwind`'s closure only _constructs_
  a `Future` when called with an async fn - it returns immediately without
  polling it, so no panic occurring later, while the future is actually
  driven elsewhere, is ever inside that closure's call frame for
  `catch_unwind` to catch. Tokio already isolates panics at the task
  boundary (a panicking spawned task turns into an `Err(JoinError)` on its
  `JoinHandle`, without crashing the process); the real gap was that
  `lib.rs` discarded that `JoinHandle` instead of watching it. `run_supervised`
  fixes the actual gap.

## Recommendation deviations (from Phase 2 review feedback)

Two mandatory conditions from the Phase 2 review were implemented
differently than first proposed, after a closer look:

- **Restart notice as a Rust-side "dismissed" flag** - proposed so the
  badge persists until the user acknowledges it. Rejected in that form: it
  would add a second writer to `ConnectionStatus` (the poll loop plus a new
  dismiss command), breaking the single-writer invariant documented on
  `commands::get_connection_status`. Solved entirely in `connectionStore.ts`
  instead (see below) - `ConnectionStatus` itself stays exactly as designed
  above.
- **`clear_all_caches()` on restart** - proposed as a Phase 2 deliverable.
  Deferred: Desktop has no caches yet (Task cache, Memory cache, Provider
  status cache are Phase 4+ concerns), so there is nothing to invalidate
  today. The `connection-status-changed` event already carries `restarted`
  on the wire, which is the contract those future caches will subscribe to
  - no code needed now beyond this note.

### Deriving persistence from a transient signal

The Rust-computed `restarted` field is deliberately transient - see
"Decision" above, it describes what just changed on _this_ update, not an
ongoing condition. A first attempt at a persistent "Core restarted" badge
read `status.restarted` directly into the UI condition
(`showRestart = status.restarted && !dismissed`); this doesn't actually
work, because `restarted` is back to `false` by the very next successful
poll (~3s later, same instance) regardless of any dismiss state - the same
narrow window that took repeated 400ms-interval screenshots to even
capture during manual verification. A user would very likely never see it.

Fixed in `connectionStore.ts`: the store itself tracks the last-seen
`instance_id` across every update (not just the one Rust flags as a
restart) and sets its own `showRestartNotice` flag when that value changes
between two consecutive updates. This flag only clears via
`dismissRestartNotice()`, so it survives any number of subsequent
same-instance polls. This is pure frontend/presentation state - it never
writes back into `ConnectionStatus` or any Rust-owned state, so the
single-writer invariant is untouched.

## Consequences

- Any future screen that cares about connectivity (all of them, sooner or
  later) reads the same `ConnectionStatus` via the `connectionStore.ts`
  Zustand store - no screen reimplements its own "is Core up" logic.
- The state machine's correctness is fully covered by fast, deterministic
  unit tests (no real network, no real sleeping). Manual verification
  against a real running Core process (stop/restart, screenshotted) is
  still what actually caught the `watch`-channel bug above - the unit
  tests alone did not, which is why Phase 2's end-of-phase report treats
  that manual pass as load-bearing, not a formality.
- Adding a fifth state later (if a genuine need arises) means extending
  `next_status`'s match arms - the function's exhaustive `match` on
  `ConnectionState` means the compiler forces every call site touching
  state transitions to be updated, not just the ones a developer remembers.

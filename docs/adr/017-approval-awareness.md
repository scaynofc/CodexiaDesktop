# ADR-017: Approval Awareness — Sidebar Badge and OS Notification

**Status:** Accepted

## Context

Approval Center (Phase 10, ADR-014) only shows pending approvals to a
user who has already navigated there. A roadmap review flagged the real
consequence: a user on Task Center or any other screen has no way to
know a gated tool call is blocked waiting on their decision - the only
signal is a countdown silently running out (ADR-016's own countdown
feature made the deadline visible, but only once the user is already on
the right screen). CodexiaCore's new `GET /approvals/stream` (its own
ADR-021) gives Desktop a way to learn about pending-approval changes
without polling from every screen that might care - this phase is the
Desktop-side consumer of that primitive.

## Decision

**A new background loop, `services::approval_watch::
run_approval_watch_loop`, spawned once in `lib.rs`'s `setup()`** -
architecturally identical to `run_connection_loop`/
`run_task_list_poll_loop`: wrapped in `run_supervised` for panic
resilience, gated on `ConnectionState::Connected` (mirrors
`should_poll_task_list`'s exact gate), holding its own
`SharedPendingApprovals` cell. This is deliberately **separate** from
Approval Center's own screen-scoped polling in `Approvals.tsx` (ADR-014) -
that polling stays exactly as it is; this loop exists for consumers that
need to know about pending approvals regardless of which screen is
active.

**SSE framing logic (`parse_block`/`extract_block`) was extracted from
`sse.rs` into a new shared `sse_framing.rs`**, once a second real
consumer (`approvals_sse.rs`, for `GET /approvals/stream`) needed the
identical byte-buffer reassembly logic `watch_task` already had. Not
extracted preemptively - duplicating it once would have been fine
("three similar lines"), but this is ~30 lines of subtle mid-chunk
block-splitting logic, not three, and a second real caller is what
justified the extraction, not anticipation of one.

**A pure decision function, `newly_appeared_approvals(previous,
current)`, decides what's "worth notifying about."** An approval
disappearing (decided elsewhere) or an unchanged snapshot arriving again
must never trigger a notification - only an id present in `current` but
absent from `previous` is genuinely new. Kept as a standalone, directly
unit-testable function (5 tests, no I/O) rather than inlined into the
loop, the same "extract the one real decision, test it without a fake
server" discipline `services::connection`'s `next_status`/
`should_poll_task_list` already established.

**The actual `NotificationExt` call (`tauri-plugin-notification`) and
`app_handle.emit("approvals-changed", ...)` both live in `lib.rs`, not in
`services::approval_watch`** - the loop itself takes plain `on_change`/
`on_new_approvals` closures, staying Tauri-agnostic per ADR-003's
Desktop-Services-never-touches-Tauri-types rule, exactly like every
existing background loop's `on_change` callback already does.

**The notification plugin is Rust-only for this phase - no
`@tauri-apps/plugin-notification` JS dependency.** The notification is
triggered entirely from the background loop (Rust), never from the
frontend; Tauri's capability/permission system governs the JS↔Rust IPC
boundary, which this feature never crosses for its notification path.
Added, then removed once actually unused - a real example of not
carrying a dependency past the point it stopped being needed.

**`get_pending_approval_count` returns a `usize`, not the full
`Vec<Approval>`** - the sidebar badge only ever needs a number;
`get_pending_approvals` (Approval Center's own command) already exists
for full detail. `approvalStore.pendingCount` is fed by the same
`approvals-changed` event's payload length, following the exact
`connectionStore`/`taskStore` `init()`-guards-a-single-subscription
pattern already established.

## Alternatives Considered

- **Reusing Approval Center's screen-scoped polling for the badge too**
  (e.g. hoisting it to `App.tsx`) - rejected: would make the "only polls
  while relevant" property ADR-014 established for that screen no longer
  true, and conflates two different consumers (a screen showing full
  detail vs. an always-on background indicator) that have different
  actual lifecycles.
- **Polling `GET /approvals/pending` from a Rust background loop instead
  of consuming the new SSE stream** - rejected: CodexiaCore's own
  ADR-021 built the push-based endpoint specifically for this consumer;
  polling it from Rust would ignore the primitive that phase exists to
  provide.
- **Emitting the full `Approval[]` list to the frontend and deriving
  `pendingCount` there** - this is in fact what happens (`approvals-
  changed`'s payload is the full list); `pendingCount` is derived
  client-side from `event.payload.length` rather than the Rust side
  pre-computing a count, keeping the wire event shape identical to what
  a future consumer wanting more than a count (e.g. per-item detail)
  would already need.
- **Requesting explicit OS notification permission (macOS's
  `request_permission()`)** - deferred, not rejected: not exercised in
  this phase's live verification environment (Windows); a real gap if
  this ships to macOS, worth revisiting there specifically rather than
  guessing at behavior this environment can't verify.

## Consequences

- The sidebar badge and OS notifications depend on a *second*,
  independent SSE connection to CodexiaCore (the first being Task
  Center's `watch_task`) - two long-lived connections per running
  Desktop instance instead of one. CodexiaCore's own `ApprovalStore`/
  `TaskStore` reads are cheap local SQLite, so this is an accepted,
  low-cost tradeoff, not a scaling concern at this project's single-user
  scale (ADR-008 in CodexiaCore).
- A user who never grants OS notification permission (or is on a
  platform/session with no notification daemon) simply sees no
  notification - the `let _ = ....show()` call is deliberately
  best-effort, matching every other `app_handle.emit(...)` call in this
  codebase's background loops; the sidebar badge remains the reliable
  fallback signal.
- `newly_appeared_approvals` compares by id only, not full equality - an
  approval whose `payload`/`expires_at` somehow changed in place without
  a new id would not be treated as "new" (not a real scenario today:
  `Approval.id` is immutable for a row's lifetime in CodexiaCore).
- 17 new tests: 11 Rust (6 in `approvals_sse.rs` covering event parsing
  and real block reassembly, 5 in `approval_watch.rs` covering
  `newly_appeared_approvals` - `sse_framing.rs`'s own 2 tests were moved,
  not added, during the extraction from `sse.rs`) and 6 TypeScript (4
  `approvalStore.init()` cases, 2 sidebar badge cases) - full suite
  passing, ESLint/tsc/clippy/cargo fmt/prettier all clean.

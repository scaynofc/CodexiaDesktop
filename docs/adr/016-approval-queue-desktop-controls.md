# ADR-016: Approval Queue Desktop Controls (Checkbox, Countdown, Log Center)

**Status:** Accepted

## Context

Phase 10 (ADR-014) shipped Approval Center - a real screen that reads and
decides CodexiaCore's persisted `Approval` rows - but Desktop itself had
no way to actually create an approval-queue-enabled task. Task Center's
`POST /tasks` call never sent CodexiaCore's `enable_approval_queue`
field, so every task Desktop created ran with the default (`false`):
gated tool calls/memory writes were silently denied, never routed through
Approval Center at all. The entire feature was only reachable from the
CLI or raw HTTP - a real gap identified during roadmap review as the
single highest-priority fix, since it meant the two most recent major
phases (Approval System in CodexiaCore, Approval Center here) didn't
actually connect for a real Desktop user.

Two smaller gaps were fixed alongside it, both surfaced by the same
review: a pending approval's `expires_at` was already in the data Desktop
receives but never displayed (a user has no way to know a 120s clock is
running), and CodexiaCore's own Approval System phase (via this repo's
companion ADR-020) added approval decisions to `GET /events`, which this
repo's Log Center had no way to render (a new `source` value it didn't
know about).

## Decision

**`enable_approval_queue: bool` threaded end-to-end**: `core_bridge::
tasks::CreateTaskRequest` (always sent, matching `require_approval`/
`simulate`'s own plain-bool shape, not `Option`) → `services::tasks::
create_task_and_refresh` → the `create_task` command → `taskStore.
createTask` → a new checkbox in `Tasks.tsx`'s `NewTaskForm`, labeled "Gate
tool calls/memory writes through Approval Center" - deliberately distinct
wording from the existing "Require approval before running" checkbox
(`require_approval`), matching CodexiaCore's own ADR-017 distinction
between the two gates (one blocks the whole task up front; the other
gates individual calls while execution continues).

**A live per-card countdown, ticking independently of the 3s poll
interval.** `lib/approvals.ts`'s new `formatApprovalCountdown(expiresAt,
now)` is a pure function - `now` is an injected parameter, not read
internally via `Date.now()`, keeping it directly unit-testable exactly
like every other formatter in that file. `Approvals.tsx` supplies the
ticking `now` via its own second `useEffect`/`setInterval` (1000ms,
`COUNTDOWN_TICK_MS`), separate from `POLL_INTERVAL_MS` (3000ms): the
approvals *list* only needs to change when the server's state changes,
but a countdown that only moved every 3s would look broken/jumpy. Only
rendered for `status === "pending"` rows - a decided approval's countdown
is meaningless.

**Log Center's `SystemEventSource` widened to include `"approval"`** -
`eventsStore.ts`'s type, `lib/events.ts`'s `SOURCE_LABEL` map, and
`Log.tsx`'s `SOURCE_FILTERS` array all gained the new value, mirroring
exactly how `"task"`/`"provider"` were already wired. No new component or
screen - the existing filter/badge/detail-pane machinery already
generalizes to a third source with no structural change.

## Alternatives Considered

- **A separate "Enable approval queue" toggle living in Settings instead
  of a per-task checkbox** - rejected: `enable_approval_queue` is a
  per-task decision in CodexiaCore's own model (opt-in per `POST /tasks`
  call, not a global mode), and `require_approval`/`simulate` already
  established the "per-task checkbox in the creation form" precedent this
  should follow, not a new configuration shape.
- **Updating the countdown only on each 3s poll tick** (no separate
  timer) - rejected: would make the countdown visibly jump in 3-second
  steps instead of counting down smoothly, undermining the whole point of
  showing it - a user should be able to see "how much time do I actually
  have left" at a glance.
- **A dedicated color/severity for the `"approval"` Log Center source**
  (beyond reusing the existing `type`-based warning/error color-coding)
  - rejected: `SystemEventType` (error/warning/info) already carries
    severity; `source` is an origin label, not a second severity axis -
    CodexiaCore's ADR-020 already made rejected/expired/cancelled
    approvals `WARNING`-typed, which renders with the existing amber
    styling with zero new code here.

## Consequences

- Approval Center is now reachable end-to-end from a cold start: create a
  task with the new checkbox checked, watch a real pending approval
  appear with a live countdown, decide it, and (once CodexiaCore's
  ADR-020 change is deployed) see the decision show up in Log Center
  under the "Approval" source filter - the gap that motivated this ADR is
  closed.
- The countdown is client-computed from `expires_at`, not re-fetched from
  the server every second - if the viewer's system clock is meaningfully
  wrong relative to the machine running CodexiaCore, the displayed
  countdown will be off by the same amount (an accepted, unremarkable
  tradeoff for a local-first, single-user tool per CodexiaCore's own
  ADR-008).
- 13 new tests (2 Task Center checkbox-wiring cases, 10 countdown cases
  split across `lib/approvals.test.ts`'s pure-function coverage and
  `Approvals.test.tsx`'s ticking-display behavior, 1 Log Center filter
  case for the new `"approval"` source) - full suite (207 tests) passing,
  ESLint/tsc/clippy/cargo fmt/prettier all clean.

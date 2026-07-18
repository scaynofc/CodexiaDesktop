# ADR-014: Approval Center — Human-in-the-Loop UI Over CodexiaCore's Approval System

**Status:** Accepted

## Context

Approval Center is Phase 10's original slot (ADR-013 in this repo already
documents the reservation), deferred twice since - first when Memory
Center shipped in its place, again when it turned out to be a genuine
dead-end: CodexiaCore's `get_engine()` hardcoded `deny_all` for every
gated tool call/memory write, with no persisted "pending approval"
concept for a UI to read or decide. CodexiaCore's own Approval System
phase (its ADR-017) built that missing primitive - `ApprovalStore`,
`ApprovalQueue`, `GET /approvals/pending`, `GET /approvals/{id}`,
`POST /approvals/{id}/approve`, `POST /approvals/{id}/reject`, gated
behind a new opt-in `enable_approval_queue` field on `POST /tasks`. This
phase is the Desktop-side control surface over that primitive - Approval
Center finally has real data to build against.

## Decision

**`Approval`'s `payload` is `serde_json::Value`, not a transformed or
strongly-typed shape.** CodexiaCore's own `Approval.payload` is a plain
`dict[str, Any]` whose shape varies by `type` (a tool call's
name/arguments vs. a memory write's key/value) - this app only ever
displays it (`formatApprovalPayload` pretty-prints it as JSON), never
acts on its fields, so pattern-matching a shape this codebase doesn't
own would be both unnecessary and a second, drifting copy of
CodexiaCore's own schema. First use of `serde_json::Value` as a field
type in this codebase (`serde_json` was already a dependency, just never
used this way).

**`type` is renamed to `approval_type` on the Rust side**, via
`#[serde(rename = "type")]` - the same precedent
`core_bridge::events::SystemEvent.event_type` already established for
Rust's `type` reserved word.

**Polling is screen-scoped, owned by `Approvals.tsx` itself via a plain
`useEffect`/`setInterval` (3s), not a Rust background loop.** This is a
deliberate departure from `connectionStore`/`taskStore`'s pattern
(`run_connection_loop`/`run_task_list_poll_loop`, spawned once in
`lib.rs`'s `setup()`, running continuously regardless of the active
screen) - a pending approval is only ever actionable from this screen,
so there is no reason to keep a background loop alive, holding a
`CoreHttpClient` request open every few seconds, while the user is on
Task Center or Settings. This matches the "one-shot fetcher, no shared
Tauri-managed state" shape every other Desktop Services module already
uses (`services::metrics`, `services::runtime`, `services::memory`,
`services::events`) - `services::approvals` adds nothing new there;
only the frontend's decision to re-invoke it on a timer is new.

**`ApprovalClient` is a trait, mirroring `ProjectMemoryClient`/
`MetricsFetcher`.** `services::approvals::fetch_pending_approvals`/
`approve_and_refresh`/`reject_and_refresh` are generic over
`ApprovalClient`, tested against a scripted fake rather than a real
`CoreHttpClient` - the same testability shape every prior Desktop
Services module already established, not a new pattern.

**Approve/reject each return the server's refreshed pending list in one
round trip, not the decided `Approval` itself.** CodexiaCore's
`POST /approvals/{id}/approve`/`reject` both return the full updated
`Approval` object, but Desktop never surfaces it directly - a decided
row drops out of `GET /approvals/pending` on its own, so
`approve_and_refresh`/`reject_and_refresh` call the decision endpoint
and then immediately re-fetch the pending list, mirroring
`services::memory::forget_and_refresh`'s "act, then refresh" shape
exactly. This is also why `approvalStore`'s `approvals` array only ever
realistically contains `pending` rows in practice, even though `Approval`
models every status.

**Status color-coding covers all five `ApprovalStatus` values, including
`cancelled`, even though only `pending` is ever actually seen live.**
`lib/approvals.ts`'s `approvalStatusBadgeClassName` follows
`lib/events.ts`'s `eventTypeBadgeClassName` precedent (className
overrides on `Badge`'s `outline` variant, not new `Badge` variants -
this mapping is Approval Center-specific, not a general design token).
`cancelled` is currently unreachable in CodexiaCore (reserved for a
future task-cancellation-cascades-to-approvals feature per ADR-017
there) and gets the same neutral/gray treatment as `expired`, so a
future row in that state never renders with no styling at all.

**Reason input is per-card, plain-text, optional - not a modal or a
required field.** Each pending approval renders its own
`<input placeholder="Optional reason">`; Approve/Reject send whatever is
typed (or `null` if left blank) via `ApprovalDecisionRequest`. A blocking
modal was considered and rejected as unnecessary weight for a single
optional text field already scoped to one visible card.

**Tests mock `invoke()`, not the store** - `Approvals.test.tsx` follows
every other screen test's actual convention (`Log.test.tsx`,
`Memory.test.tsx`), not a store-mocking approach. The screen-scoped poll
interval is tested with `vi.useFakeTimers()`/`vi.advanceTimersByTimeAsync`
- confirming both that a poll tick re-fetches while mounted and that
`clearInterval` on unmount actually stops it, since an interval leak here
would be a real, if quiet, resource bug (an orphaned timer still calling
`invoke()` after the user navigates away).

## Alternatives Considered

- **A Rust background poll loop for approvals, matching
  `connectionStore`/`taskStore`** - rejected: those loops exist because
  their state (connection health, task list) is relevant regardless of
  which screen is active (the header's connection badge, Dashboard's
  summary). A pending approval has no such ambient relevance - nothing
  outside Approval Center reads it - so an always-on loop would only add
  idle Core requests for no consumer.
- **A strongly-typed `payload` enum (`ToolApprovalPayload` /
  `MemoryApprovalPayload`)** - rejected: would require this app to track
  CodexiaCore's internal tool-call/memory-write argument shapes and stay
  in sync with them, for a value this screen only ever displays
  read-only. `serde_json::Value` plus `formatApprovalPayload`'s
  pretty-print gets the same user-visible result with zero coupling to a
  shape this repo doesn't own.
- **A separate `GET /approvals/{id}` call per card** - rejected:
  `GET /approvals/pending` already returns full `Approval` objects
  (payload included), so a detail fetch would be a redundant round trip
  with nothing new to show.
- **Blocking the whole list (not just the acted-on row) while a decision
  is in flight** - rejected: `decidingIds` (a list of in-flight approval
  ids) lets every other pending row stay interactive, matching how a real
  reviewer would expect to keep working through a queue instead of
  freezing on one decision.

## Consequences

- Approval Center only ever shows what's currently pending - a decided
  row (approved/rejected/expired) simply disappears from the list on the
  next poll or the post-decision refresh; there is no history/audit view
  in this phase. CodexiaCore does persist the full decided row
  (`decided_at`, `decision_reason`), so a future audit screen could read
  it via `GET /approvals/{id}` without any Core change.
- A user who navigates away mid-review and back later may find a
  previously-visible approval gone (expired server-side, or decided from
  another client) - the screen has no stale-row detection beyond "it's
  no longer in the list," the same eventually-consistent shape every
  other polled Desktop screen already accepts.
- The 3s poll interval is a fixed constant in `Approvals.tsx`, not
  user-configurable - reasonable against CodexiaCore's 120s default
  `approval_timeout_seconds`, but a very short custom timeout configured
  server-side could still expire a request between two poll ticks with
  nothing Desktop can do about it.
- This phase closes CodexiaDesktop's original 8-phase plan (ADR-003's
  "Phases 6-8" era, later renumbered/expanded) - every `NAV_ITEMS` entry
  is now `enabled: true`; the "disabled item" rendering path in
  `AppSidebar.tsx` is untested-by-a-real-example dead code until this
  project's next screen is added disabled.

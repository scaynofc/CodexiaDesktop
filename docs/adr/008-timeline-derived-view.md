# ADR-008: Timeline — Purely-Derived View, No New Core Bridge Surface

**Status:** Accepted

## Context

Phase 5 builds Timeline, the third enabled screen: a cross-task,
chronological feed of the `TimelineEvent`s CodexiaCore's Orchestrator
records on every step (Faz 32/33 - `step_started`, `attempt_failed`,
`reflection_verdict`, `step_done`, `step_failed`, `cancelled`,
`delegation_started`, `team_member_accuracy`; see `_emit` in
`core/orchestrator.py`, `core/async_orchestrator.py`, `core/delegation.py`).
No screen renders this data yet - Task Center's detail pane (Phase 4,
`Tasks.tsx`) shows step state/result/error/critique but never
`step.events`.

CodexiaCore has no aggregate-events endpoint. It doesn't need one: `Task`
(and therefore `GET /tasks`, the exact call `useTaskStore`'s `init`/
`refreshTasks` already make for Task Center) embeds every step's full
`events: TimelineEvent[]` array. `core_bridge::tasks`'s `Task`/`TaskStep`/
`TimelineEvent` wire types (Phase 4) already mirror this field-for-field,
and `taskStore.ts`'s TypeScript types already carry it through unused.

## Decision

**Timeline has no Rust changes at all** - no new Core Bridge call, no new
Tauri command, no new Desktop Service, no second poll loop. It is a pure
frontend derivation over `useTaskStore`'s existing `tasks` (and, when
present, the actively-watched task) state, computed with `useMemo` in the
screen itself.

**`src/lib/timeline.ts`** holds the derivation as pure, unit-tested
functions, not inlined in the screen - mirrors this project's established
split between pure decision logic (`should_retry_after_blocked`,
`next_status`, `findNavItemByPath`) and the component that renders it:

- `deriveTimelineEntries(tasks)` flattens every step's `events` across
  every task into one flat list, denormalized with task/step context
  (goal, state, step number/description) so the screen never needs to
  re-look-up a task by id per row. Sorted newest-first by `Date.parse`;
  ties are left to `Array.prototype.sort`'s guaranteed stability rather
  than a manufactured tiebreak, which is enough because it preserves
  the events' own append order for same-second timestamps (a real case:
  `step_started` immediately followed by an `attempt_failed` share a
  second-resolution timestamp routinely).
- `timelineKindLabel`/`timelineKindBadgeVariant` map the known `kind`
  vocabulary to a human label and a `Badge` variant, falling back to the
  raw string / `"outline"` for anything unrecognized. `TimelineEvent.kind`
  is deliberately a plain string, not an enum (`models/task.py`'s own
  docstring: reserved for a future EventBus's topic names) - CodexiaCore
  can grow new kinds without a Desktop release making Timeline blank or
  crash on that row.
- `formatTimelineTimestamp` renders the ISO 8601 wire timestamp in the
  viewer's locale via `Intl.DateTimeFormat`, falling back to the raw
  string for anything unparseable rather than surfacing "Invalid Date".

**The screen overlays `watchedTask` over `tasks` before deriving**,
exactly mirroring `Tasks.tsx`'s own `selectedTask` derivation
(`watchedTask?.id === selectedTaskId ? watchedTask : ...`): while Task
Center has a task open, its live SSE-driven `watchedTask` is fresher than
the list's 5s safety-net poll, so Timeline should reflect that same
freshness rather than lagging behind Task Center by up to 5 seconds for
the one task actually being watched.

**`Timeline.tsx` calls `useTaskStore`'s `init()` itself**, same as
`Tasks.tsx` and `Dashboard.tsx` each call their own store's `init()` - a
user can land on `/timeline` without ever visiting `/tasks` first (no
route ordering is enforced), and `init()` is idempotent (guarded by
`initPromise`), so this costs nothing extra when Task Center already
initialized the store.

## Alternatives Considered

- **A dedicated `GET /tasks/events` (or similar) CodexiaCore endpoint,
  server-side-flattened and sorted** - rejected. Would duplicate data the
  client already has in full from `GET /tasks`, add a CodexiaCore API
  surface change for a transformation that's O(events) and trivial
  client-side, and violates ADR-004 (Core never knows about Desktop) more
  than a generic capability would - Task Center already fetches the exact
  input this needs.
- **A second Desktop Service module (e.g. `services::timeline`) with its
  own poll loop** - rejected. Would run a redundant second 5s poll against
  the same `/tasks` endpoint `services::tasks::run_task_list_poll_loop`
  already polls, doubling Core's request load for identical data with no
  new information gained.
- **A `timelineStore.ts` Zustand store subscribing to the same
  `tasks-changed` event** - rejected. `taskStore.tasks` is already the
  single source of truth for that event (ADR-002); a second store mirroring
  it would need to stay in lockstep with zero benefit over reading the one
  that already exists via a selector.

## Consequences

- No CodexiaCore or Core Bridge changes were needed for this phase - the
  existing `GET /tasks` response was already sufficient, matching Phase
  4's own precedent.
- Adding a screen that needs _new_ per-event context not already in
  `Task`/`TaskStep` (e.g. a future dedicated EventBus subscription for
  true sub-second push, mentioned in `models/task.py`'s `TimelineEvent`
  docstring as a later roadmap item) would be a new decision, not an
  extension of this one - this ADR covers only what Timeline needed given
  what CodexiaCore already exposes today.
- `deriveTimelineEntries` has no upper bound on feed length - acceptable
  at today's scale (a local, single-user runtime, per
  `docs/adr/008-single-user-local-first-scope.md` in the CodexiaCore repo);
  pagination/virtualization is a future concern if it ever becomes one,
  not built speculatively here.

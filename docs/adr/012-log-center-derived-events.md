# ADR-012: Log Center — Derived Events, Not a Raw Log Viewer

**Status:** Accepted

## Context

Phase 9 builds Log Center: a structured "what went wrong" observability
panel. The original framing considered for this phase was a raw log/error
viewer, but research before writing any code found that premise false for
this codebase: CodexiaCore has no persisted, queryable log store at all.
`CodexiaError` (the runtime's own error type) is raised and caught inline
but never written anywhere durable, and there was no existing "system
event" concept to read back.

What CodexiaCore _did_ already have, fully persisted: `TimelineEvent`s
recorded on every task step (Faz 32/33 - `step_started`, `step_failed`,
`attempt_failed`, `reflection_verdict`, `step_done`, `cancelled`,
`delegation_started`, `team_member_accuracy`), and `ModelAttempt` records
in the provider retry loop's own SQLite-backed stats store - which
computed a failure classification (`classify_status` in
`providers/retry.py`) on every failed attempt and then discarded it,
recording only the boolean `success` flag.

CodexiaCore's own ADR-015 documents the resulting surgical fix: persist
the already-computed `failure_kind` on `ModelAttempt` (a one-column
addition, not a new subsystem), and add `GET /events` (`core/
events_facade.py`'s `build_event_log`) that merges anomaly-kind
`TimelineEvent`s and failed `ModelAttempt`s into one `SystemEvent` list,
sorted newest-first. No new logging framework, no raw log viewer, no
`CodexiaError` persistence - both would have been new, undertested
surface area this phase's actual goal didn't require.

## Decision

**Log Center is a thin read-only proxy over `GET /events`, structurally
identical to Provider Center/Runtime Center/Memory Center's read path.**
`core_bridge::events` adds `SystemEvent`/`SystemEventType`/
`SystemEventSource` wire types (`#[serde(rename_all = "lowercase")]`,
matching CodexiaCore's `str, Enum` convention) and
`CoreHttpClient::get_events(limit)`. `services::events` wraps it behind an
`EventsFetcher` trait (mirroring `MetricsFetcher`/`RuntimeFetcher`) purely
for test doubles - no shared Tauri-managed state, no poll loop, since
events only change as a side effect of a task running or a provider call
failing, the same reasoning already established for
metrics/runtime/memory.

**`SystemEventSource` is `task | provider` only - no `system` variant.**
CodexiaCore's `SystemEventType`/`SystemEventSource` enums (`models/
event.py`) deliberately dropped a considered third source, `system`,
because no real data source for it exists yet (that would require
persisting `CodexiaError`, out of scope - see CodexiaCore's ADR-015).
Desktop's `core_bridge::events` mirrors that omission exactly rather than
adding a client-side variant Core can never actually send.

**Log Center's UI is a filtered list + detail pane, not a scrolling
console.** `lib/events.ts` provides pure, unit-tested helpers
(`filterEvents`, `eventTypeBadgeClassName`, `formatEventTimestamp`,
`eventKey`) consumed by `screens/Log.tsx`: a type filter (all/error/
warning/info) and a source filter (all/task/provider), a list of matching
events color-coded by severity (red/amber/gray), and a click-to-expand
detail panel showing the full message, timestamp, originating task id
(when present), and metadata - the same list-plus-detail-pane shape Task
Center (Phase 4) already established, not a new UI pattern. A short caption
("not a live debugging console") sets the expectation up front, matching
this phase's actual scope: CodexiaCore already recorded these failures,
this screen surfaces them, it does not stream or tail anything.

**Severity color-coding is a Log-Center-specific className, not a new
Badge variant.** `Badge`'s existing variants (`default`/`secondary`/
`destructive`/`outline`) have no amber/warning option; rather than adding
one to the shared component for a single screen's need, `lib/events.ts`
exports `eventTypeBadgeClassName` returning Tailwind overrides applied on
top of `variant="outline"`.

**`SystemEvent` carries no id field**, so `lib/events.ts`'s `eventKey`
builds a composite key from `(source, timestamp, task_id, message)` for
React list identity and detail-pane selection - the same situation and
same resolution `lib/timeline.ts`'s `TimelineEntry.key` already documents
for `TimelineEvent`.

## Alternatives Considered

- **A raw log/console viewer streaming `CodexiaError` text** - rejected:
  no such persisted source exists in CodexiaCore, and building one (a new
  logging subsystem, its own storage, its own retention policy) is
  disproportionate to what this phase needs. See CodexiaCore's ADR-015 for
  the full reasoning.
- **A `system` event source for infra-level messages** (e.g. connection
  loss) - deferred: Desktop's own `connectionStore`/`ConnectionStatus`
  already surfaces Core-reachability problems elsewhere in the shell;
  duplicating that into Log Center's event feed would conflate two
  different signals (task/provider failures vs. Desktop's own connection
  health) for no clear benefit.
- **A poll loop keeping the event list live** - rejected for the same
  reason Provider Center/Runtime Center/Memory Center didn't get one:
  nothing changes Log Center's data outside of a task or provider call
  actually failing, so a background poll would mostly re-fetch identical
  data.

## Consequences

- Log Center's completeness is bounded by exactly what CodexiaCore's ADR-
  015 persists: task-step anomalies and failed provider attempts. Any
  future failure category Desktop wants surfaced here (e.g. a crashed
  background poll loop inside Desktop itself) needs its own explicit
  design, not an assumption that "it'll show up in Log Center."
- Because `GET /events` already merges and sorts server-side, Desktop
  never re-sorts - `filterEvents` only narrows by type/source. A future
  CodexiaCore change to the merge/sort order would be inherited here
  automatically, for better or worse.
- Pre-Faz-44 CodexiaCore instances (no `GET /events`, no `failure_kind`
  column) will 404/error on this screen, the same accepted degradation
  Memory Center's ADR-011 documents for pre-Faz-43 instances - not a
  crash, just a screen with nothing to show against an older Core.

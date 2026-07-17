# ADR-009: Provider Center — One-Shot Metrics Fetch, No Poll Loop

**Status:** Accepted

## Context

Phase 6 builds Provider Center: per-model health (success rate, latency,
circuit-breaker cooldown - Faz 14 in CodexiaCore), cost totals (Faz 13),
and router accuracy (Faz 12). Unlike Timeline (Phase 5, ADR-008), none of
this data existed on the wire at all - CodexiaCore's `MetricsSnapshot`
(`core/metrics_facade.py`) was CLI-only (`--metrics`), unreachable from
any HTTP client. This phase required a real CodexiaCore change: `GET
/metrics`, a thin, faithful mirror of `--metrics` (CodexiaCore's own
ADR-012 has the full rationale for that side).

## Decision

**`services::metrics::fetch_metrics` is a one-shot fetch, not a periodic
poll loop.** Task Center's list poll (`services::tasks::run_task_list_poll_loop`,
ADR-007) exists because the task list can change from something Desktop
has no event-based way to learn about - CodexiaCore's webhook endpoint, a
concurrent CLI session. Cost/model-health data has no equivalent
independent-of-Desktop event source: it only changes as a side effect of a
task actually running, and Desktop is already watching every task it
starts. Polling `/metrics` on a timer would add real load to Core (a fresh
aggregation over three SQLite stores, unlike `/health`'s cheap constant
lookup) for data that mostly wouldn't have changed between ticks. Provider
Center fetches once on mount and again on an explicit "Refresh" click -
matching CodexiaCore's own reference dashboard's manual-refresh-only
model for everything it shows.

**Still routed through Desktop Services (`services::metrics.rs`), not
called straight from the Tauri command**, per ADR-003's layering rule -
even though `fetch_metrics` today is a thin pass-through with no retry/
cache logic of its own. ADR-003 names Provider Center specifically as a
reason for this discipline; keeping the layer boundary here is what lets a
future caching or backoff decision land in one place without moving the
call site, and keeps `MetricsFetcher` swappable for tests the same way
`TaskLister` already is.

**No `SharedMetrics` Tauri-managed state.** Unlike `SharedTaskList` (a
cell multiple writers - the poll loop and every task action - update, and
`get_tasks` reads synchronously), nothing else writes metrics state
between explicit fetches, and no other command needs to read a stale
snapshot without triggering a fresh fetch. `get_metrics` is `async fn`,
always does a real round trip, and returns the result directly - a shared
cell here would only add a second copy of the same data with no reader
that benefits from it.

**`metricsStore.ts` has no `init()`/event subscription**, unlike
`taskStore`/`connectionStore` (see `src/stores/README.md`). It exposes one
action, `fetchMetrics()`, called from `Providers.tsx`'s `useEffect` on
mount and its "Refresh" button - there is no `metrics-changed` event to
listen for, so a `listen()` call would have nothing to ever receive.

**Cost fields render `null` as "Unknown," never `$0`.** CodexiaCore's own
`_sum_cost` convention (documented in its ADR-012) collapses a sum to
`None` the instant any one contributing row's cost is unknown - a `$0`
render would misrepresent that as "confirmed free," which is never what a
`null` here means. `lib/metrics.ts`'s `formatCostUsd`/`formatPercent`/
`formatLatencyMs` are pure, unit-tested functions enforcing this, mirroring
Timeline's `lib/timeline.ts` split between formatting and rendering.

## Alternatives Considered

- **Poll `/metrics` on a timer like the task list** - rejected (see
  Decision above): no independent-of-Desktop event source justifies it,
  and the aggregation cost is real work server-side, not a cheap lookup.
- **A `SharedMetrics` cell plus a synchronous `get_metrics` read,
  mirroring `get_tasks`/`refresh_tasks`'s split** - rejected as
  unnecessary complexity: that split exists to serve a background-warmed
  cache with a synchronous reader; nothing warms a metrics cache in the
  background here, so every "read" would still need to trigger the same
  async fetch, making the split pure ceremony with no behavior it adds.
- **Calling `CoreHttpClient::get_metrics` directly from the Tauri
  command, skipping Desktop Services** - rejected per ADR-003, which
  names Provider Center by name as a reason the layering discipline
  exists, independent of how much logic any one phase's Services function
  happens to contain on day one.

## Consequences

- Provider Center can go stale between an explicit refresh and whatever
  changed on Core meanwhile (a task finishing, another client's call) -
  an accepted tradeoff, matching CodexiaCore's own reference dashboard,
  not a regression this phase introduces.
- If a future need genuinely requires live-updating metrics (e.g. a
  cost counter ticking during an active task), that is new Desktop
  Services behavior on top of this decision, not an extension of it -
  most likely by having the already-open per-task SSE watch trigger a
  metrics refetch on terminal state, not by polling `/metrics` itself.
- `core_bridge::metrics`'s wire types (`MetricsSnapshot`/`ModelHealth`/
  `DailyCostSummary`/`ProviderType`) need no `#[serde(default)]` handling
  the way `core_bridge::tasks`'s older fields do - every field was added
  in the same CodexiaCore release as the endpoint itself, so there is no
  older-Core-version shape missing any of them.

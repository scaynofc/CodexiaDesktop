# ADR-018: Cost Budget Visibility

**Status:** Accepted

## Context

CodexiaCore has enforced a per-task cost ceiling
(`settings.max_task_cost_usd`) since its own Faz 13, and a task
exceeding it already lands `BLOCKED` with a clear `task.error` message
Task Center already renders generically. What a Desktop user has never
been able to see is whether a ceiling is configured *at all*, before a
task happens to hit it - a roadmap review flagged this as another
"already works, but invisible" gap, same shape as `enable_approval_queue`
before Phase 10's checkbox. CodexiaCore's own ADR-023 adds the value to
`GET /health`; this is the Desktop-side surfacing of it.

## Decision

**`HealthResponse` gains `max_task_cost_usd: number | null`**, and
Dashboard - the screen that already renders every other `/health` field
(`core_version`/`api_version`/`protocol_version`/`instance_id`) - gets
one more row: "Max task cost", formatted as `$X.XX` or `"No limit"` when
`null`. No new screen, no new store, no new network call: Dashboard
already has this data on every existing 3s connection poll.

**Formatting stays a small function local to `Dashboard.tsx`**, not a
new `lib/dashboard.ts` - unlike Log Center/Approval Center's several
formatters (which justified their own `lib/` files), this is Dashboard's
first and only piece of real formatting logic; a one-function file would
be premature structure for something this small.

## Alternatives Considered

- **A dedicated "Budget" section/screen** - rejected: one read-only
  number doesn't warrant a new screen; Dashboard's existing health-detail
  list is exactly the right home for "a fact about this Core connection."
- **Showing it only when a task actually gets blocked by it** - rejected:
  defeats the point - the gap this phase closes is specifically "know the
  ceiling exists *before* hitting it," not "explain it after the fact"
  (which `task.error` already does).

## Consequences

- Purely additive - no existing behavior changes; a Core instance with no
  cost cap configured (the default) shows "No limit," matching today's
  actual behavior exactly.
- **Live verification caught a real bug this ADR's own review missed at
  first**: `core_bridge::http::HealthResponse` - the Rust struct
  `/health`'s JSON is deserialized into before being re-serialized across
  the Tauri IPC boundary - was never given a `max_task_cost_usd` field
  alongside the TS-side `HealthResponse` type. The key was silently
  dropped in the Rust round-trip, so the frontend received `undefined`
  (not `null`), and `formatMaxTaskCost`'s `value === null` check let
  `undefined.toFixed()` through, throwing inside `Dashboard` and blanking
  the entire window with no Rust-side error logged anywhere - only
  visible via the webview's own DevTools console. Same bug shape as
  ADR-016's `SystemEventSource` enum miss: a type widened on one side of
  the IPC boundary and not the other. Fixed by adding
  `max_task_cost_usd: Option<f64>` to the Rust struct; both the `$0.75`
  and `null`-typed "No limit" cases were re-verified live afterward.
- 4 new tests (2 TS: `No limit` when `null`, `$0.50` when configured; 2
  Rust: the field deserializes when present and when `null`) - full suite
  passing (215 TS tests, 101 Rust tests, up from 100 - the fix added one
  net new Rust test), ESLint/tsc/prettier/clippy/cargo fmt all clean.

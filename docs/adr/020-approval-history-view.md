# ADR-020: Approval History View

**Status:** Accepted

## Context

CodexiaCore's `GET /approvals` (full approval history, every status,
optionally filtered - that repo's ADR-022) shipped alongside the rest of
Wave 2 (sidebar badge + notification, approval-aware SSE, cost budget
visibility), live-verified at the API level with curl against real
accumulated data. It was never actually wired into CodexiaDesktop -
`core_bridge::approvals`'s only HTTP call was `GET /approvals/pending`,
and `Approvals.tsx` only ever rendered that pending-only list. A decided
approval simply vanished from the screen the moment it was no longer
pending, with no way to look back at it - Log Center's own approval feed
(`docs/adr/016` here, CodexiaCore's ADR-020) is a narrower, WARNING-only
anomaly view (`APPROVED` deliberately excluded), not a real history
browser.

Caught during a Wave 2 completion audit that went endpoint-by-endpoint
checking not just "does the Core capability exist" but "does a Desktop
screen actually call it" - a real, user-visible gap between "the backend
supports this" and "a user can see it."

## Decision

**Approval Center gains a second tab.** `Approvals.tsx` already owned the
one and only approval-related screen; a full second screen for a single
read-only list would be over-scoped (matches this repo's own established
"don't add a screen for what fits an existing one" precedent, e.g.
ADR-008's Timeline being a derived view rather than new API). Two plain
tab buttons ("Pending" / "History") toggle between the existing
pending-approval flow (unchanged) and a new read-only history list.

**History is fetched on-demand, never polled.** Unlike the Pending tab's
3s poll (a pending row can change at any moment), a decided approval is
immutable - there's nothing to poll for. History fetches on tab select
and on status-filter change, plus a manual Refresh button, mirroring how
Log Center and Provider Center already treat their own one-shot,
non-live data.

**A status filter (`All`/`Approved`/`Rejected`/`Expired`/`Cancelled`)**,
not `Pending` (redundant with the other tab) - passed straight through to
CodexiaCore's own `?status=` param, no client-side filtering.

**`HistoryCard` is a separate, read-only component from `ApprovalCard`**,
not the same component with props toggling Approve/Reject away - a
decided approval has no countdown, no reason input, no actions, but does
have `decided_at`/`decision_reason` `ApprovalCard` never shows. Forcing
one component to cover both shapes via conditional rendering would be
messier than two small, single-purpose components sharing the same
formatting helpers (`lib/approvals.ts`, entirely reused, nothing new
needed there).

## Alternatives Considered

- **A dedicated "Approval History" screen in the sidebar** - rejected: one
  more read-only list doesn't warrant a new top-level nav item; Approval
  Center is already "the approvals screen," a tab is the natural home.
- **Reusing `ApprovalCard` for history rows too** (hiding the action row
  when `status !== "pending"`) - rejected: `ApprovalCard` already carries
  local `reason` input state and two callback props that would be
  meaningless for a decided row - a second, simpler component is less
  code than threading "am I read-only" through the existing one.
- **Polling history like the pending list** - rejected: a decided
  approval never changes again; polling immutable data on a timer wastes
  a request every 3s for nothing new to show.

## Consequences

- Closes the real Wave 2 gap: `GET /approvals` now has an actual Desktop
  consumer, not just curl-level verification.
- `core_bridge::approvals::history_query_params` is a small pure function
  (limit always present, status only when filtering) kept separate from
  the async HTTP call specifically so the query shape is unit-testable
  without a network round trip - same reasoning already established for
  every other pure-formatter split in this codebase (`lib/*.ts`).
- 12 new tests (6 Rust: 3 core_bridge query-building/deserialization, 3
  services-layer history fetch/filter/error; 6 TS: store fetchHistory
  behavior, screen-level tab/filter/empty-state/no-actions coverage) -
  full suite passing, ESLint/tsc/clippy/cargo fmt/prettier all clean.
- Live-verified against a real running Core: switched to the History tab,
  confirmed real previously-decided approvals rendered (rejected/
  cancelled/expired rows from this session's own earlier live-verification
  passes), confirmed the status filter narrows correctly, confirmed no
  Approve/Reject controls appear on a decided row.

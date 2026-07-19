# Engineering Standards

This is not aspirational writing - it's a record of six principles that
kept showing up, independently, across unrelated pieces of work on this
project, until it became clear they weren't one-off decisions but the
actual standard this codebase is held to. Written down so future work
(by any agent, or by a human contributor) starts from the same bar
instead of re-deriving it phase by phase.

This file is deliberately near-identical to CodexiaCore's own
`docs/ENGINEERING_STANDARDS.md` - same six principles, same project
culture, different repo's evidence. If a future change seems to require
breaking one of these, that's a signal to stop and discuss it explicitly

- not a reason to quietly skip the standard for one phase "just this
  once."

## 1. Fix the root cause. Never work around it.

A workaround that makes a symptom go away is not a fix - it's a second
bug waiting to be found later, usually by someone who doesn't have the
context to recognize it as a workaround.

- **Type-mirroring bugs**: CodexiaCore's Python enums/types widen
  (`SystemEventSource`, `HealthResponse.max_task_cost_usd`,
  `ApprovalType.LESSON`), and this repo's Rust/TS mirrors of them must
  be updated in lockstep or a real row breaks JSON deserialization
  (Rust, strict failure) or silently mis-renders (TS). The fix every
  time was updating the actual mirror to match, in the same session as
  the Core change when possible (see **ADR-021**, lesson approval type,
  landed alongside CodexiaCore's own ADR-025 specifically to close this
  gap before it could ever open in production) - never a defensive
  fallback that swallows an unrecognized value silently.
- **`cargo fmt`/`prettier` drift accumulated across several commits**
  eventually turned CI permanently red. The fix was running the actual
  formatters across the whole tree and verifying the diffs were pure
  formatting (no content change) before committing - not disabling the
  format-check CI step, not excluding the drifted files from the check.

## 2. No phase closes without live verification.

A passing unit test suite proves the code does what the test expected.
It does not prove the feature works. "It should work" is not a closing
statement - a specific, reproducible, real observation is.

- **ADR-019** (task delegation visibility): closing this required an
  actual 5-node, 3-level parent/child task tree, built and observed in
  the real running app - direct-children-only "Subtasks" nesting proven,
  multi-level "Delegated from" links proven, a live 5-second-poll update
  proven by watching a new child task appear without a manual refresh,
  and a DevTools console check confirming zero errors throughout. Not
  "the component renders children," but "this exact tree renders
  correctly, screenshotted."
- **ADR-022** (Capability Registry): verified by actually starting a
  real CodexiaCore server, actually launching this app's real
  `npm run tauri dev` window, focusing it, clicking through to the real
  screen, and cross-checking what rendered against a direct `curl` of
  the same endpoint - plus a DevTools console check reporting "No
  Issues," not assumed silence.

## 3. No architectural change without an ADR.

`docs/adr/000-index.md` is the append-only record of every non-trivial
decision this project has made and why - currently 22 entries, a
separate numbering sequence from CodexiaCore's own (see that repo's ADR
index for the collision warning: the two repos' ADR-019s are unrelated
documents that happen to share a number).

Consequences sections get filled in **after** live verification, with
what was actually observed, never written speculatively ahead of doing
the work. An ADR that only says what was decided, without the
alternatives that were rejected and why, is incomplete - the "why not
the other way" is usually the part someone actually needs later.

## 4. Review before push. Every time, no exceptions.

Committing and pushing are not the same action, and merging them removes
the one deliberate checkpoint where a mistake is still cheap to catch.
This project's standing rule: a push happens only after an explicit,
separate instruction to push - never bundled automatically with the
commit that precedes it, regardless of how many commits came before or
how routine the change feels.

## 5. CI is not green? The feature is not done.

A red CI check is not a follow-up item - it blocks calling the work
finished, full stop. `cargo fmt --check`, `cargo clippy --all-targets`,
`cargo test`, `npm run lint`, `npm run format:check`, `npx tsc --noEmit`,
and `npm test` all have to actually pass, not "pass except for the
pre-existing thing" - when CI started failing across several recent
commits, the response was to run the exact CI commands locally, find
every real cause (not guess), and fix each one before considering
anything shipped.

## 6. When a test is inconvenient, strengthen the infrastructure - never weaken the test.

Tests like `watch_pending_approvals_reassembles_an_sse_block_split_
across_two_writes` (`core_bridge/approvals_sse.rs`) deliberately exercise
a real, awkwardly-chunked SSE byte stream rather than a mocked, clean
one - because that's the actual failure mode a network boundary
produces, and a mock would hide exactly the bug this test exists to
catch. When a test like this is hard to satisfy, the fix is closing the
real gap it found (buffering logic, reassembly, whatever the test is
actually pointing at), not simplifying the test's input until it stops
noticing.

A test that's annoying to satisfy is usually pointing at a real gap in
the environment or the design - closing that gap is the fix, not
silencing the test that found it.

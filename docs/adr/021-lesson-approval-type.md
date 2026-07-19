# ADR-021: Lesson Approval Type Support

**Status:** Accepted

## Context

CodexiaCore's ADR-025 fixed a real bug: `get_engine_with_approval_queue()`
never wired `approve_lesson` into the shared `ApprovalQueue`, so every
lesson the learning loop proposed through the API/Desktop path was
silently denied. Part of that fix added `ApprovalType.LESSON` alongside
the existing `TOOL`/`MEMORY` values.

CodexiaDesktop's `core_bridge::approvals::ApprovalType` and
`stores/approvalStore.ts`'s `ApprovalType` union mirror CodexiaCore's enum
field-for-field - exactly the class of gap ADR-016 (`SystemEventSource`)
and this repo's own cost-budget-visibility fix (`HealthResponse`) already
hit twice this session: a type widened on CodexiaCore's side, silently
unmirrored on Desktop's, breaking deserialization (or, less severely
here, rendering an unlabeled type) the moment a real row of the new kind
exists.

## Decision

**Add `Lesson` to both enums in lockstep with CodexiaCore's fix, before
any lesson approval could ever actually reach Desktop.** `core_bridge::
approvals::ApprovalType` gains a `Lesson` variant (`#[serde(rename_all =
"lowercase")]` already makes it wire-compatible with CodexiaCore's
`"lesson"`); `stores/approvalStore.ts`'s `ApprovalType` gains `"lesson"`;
`lib/approvals.ts`'s `TYPE_LABEL` map gains `lesson: "Lesson"`.

**No other Desktop change needed.** `Approvals.tsx`'s `ApprovalCard`/
`HistoryCard` and the History tab's status filter are all generic over
`ApprovalType` already (`approvalTypeLabel(approval.type)`, raw payload
JSON rendering) - a lesson approval renders correctly in both the Pending
and History tabs the moment the type is known, with zero screen-level
changes. This is the payoff of ADR-020's own decision to keep payload
rendering untyped rather than shape-specific.

## Alternatives Considered

- **Wait for CodexiaCore's fix to ship, add the Desktop enum value
  separately/later** - rejected: this is precisely the sequencing that
  caused the `SystemEventSource` and `HealthResponse` bugs (Desktop
  shipped, then Core's addition arrived, then a real row broke
  deserialization live). Landing both sides in the same session, before
  either is live, closes the gap before it can open.

## Consequences

- `GET /approvals` and `GET /approvals/pending` responses can now include
  a `"type": "lesson"` row without breaking Rust deserialization.
- 3 new tests: 1 Rust (`deserializes_a_decided_lesson_approval`), 1 Rust
  serialization assertion added to the existing lowercase-encoding test,
  1 TS assertion added to `approvalTypeLabel`'s existing "labels every
  type" test - full suite (108 Rust, 233 TS) passing, ESLint/tsc/clippy/
  cargo fmt/prettier all clean.
- **Live-verified together with CodexiaCore's ADR-025 fix, in this app's
  real running UI**: a real `lesson`-typed pending approval (created via
  the newly-fixed wiring) appeared in Approval Center's Pending tab with
  the correct "Lesson" badge and the sidebar's pending-count badge
  incrementing to 1, was approved via a real click on the real Approve
  button, and then appeared correctly in the History tab labeled
  "Lesson"/"Approved" alongside earlier "Lesson"/"Expired" rows from the
  same session. Zero console errors throughout. CodexiaCore's ADR-025
  has the full proof that the underlying lesson was genuinely persisted
  (`SqliteLessonStore` row, not just the approval decision).

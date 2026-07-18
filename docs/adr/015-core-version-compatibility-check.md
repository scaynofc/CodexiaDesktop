# ADR-015: Core Version Compatibility Check

**Status:** Accepted

## Context

CodexiaCore's own ADR-011 (Independent Core / API / Protocol Versioning)
already anticipated this: `GET /health` reports `api_version` and
`protocol_version` as two independent integers specifically so "a
connecting client (Desktop, and later Mobile/VS Code/Cloud) gets a
precise compatibility signal in one cheap, unauthenticated call." Every
poll of `/health` since Phase 2 has carried both numbers all the way into
`ConnectionStatus.health` and Desktop's own `HealthResponse` TypeScript
type - but nothing ever read them. A user connecting a build of Desktop
to an incompatible Core (an old Desktop against a newer Core with a
breaking REST/SSE change, or vice versa) got no signal beyond whatever
individual request happened to fail confusingly.

This was found during a roadmap review as one of several "already built,
just not wired up" gaps (alongside the Approval System's own
already-computed-but-unsurfaced cost budget) - the data was always
present in the payload Desktop already fetches every 3 seconds; only the
comparison and the banner were missing.

## Decision

**Two new fields on `ConnectionStatus`: `api_compatible`/
`protocol_compatible`**, computed in `services/connection.rs`'s
`next_status()` - the same pure, already-tested function that computes
`restarted`. Kept as two independent booleans, not one combined flag,
mirroring CodexiaCore's ADR-011 treating REST-contract and SSE-schema
compatibility as independent axes that can change on different
schedules: a REST-only change (`api_version` bump) and an SSE-only
change (`protocol_version` bump) are different problems for Desktop,
which consumes both.

**Two `const` values, `COMPATIBLE_API_VERSION`/
`COMPATIBLE_PROTOCOL_VERSION`, hardcoded in `connection.rs`** - the
`api_version`/`protocol_version` this specific build of Desktop was
written against. Bumped by hand whenever Desktop adopts a breaking
REST/SSE change; not tied to Desktop's own Cargo package version or to
Core's `core_version`. Kept Rust-side only (not duplicated into
TypeScript) - the frontend only ever needs the two booleans `next_status`
already computed, avoiding a second source of truth for the same two
numbers across two languages.

**On a failed poll, the last-known compatibility verdict is preserved**,
not reset - identical reasoning to `health` itself being preserved
across a transient network failure: a blip saying nothing new about
compatibility must not silently clear (or silently show) a warning.

**The banner is not dismissible**, unlike the existing "Core restarted"
notice. `showRestartNotice` describes a one-shot event a user can
acknowledge and move past; a version mismatch describes the current,
ongoing state of the connection - hiding it while still connected to an
incompatible Core would just make the underlying problem harder to
diagnose the next time something breaks confusingly.

**Message formatting (`lib/connection.ts`'s `versionMismatchMessage`) is
a pure function, separate from `AppHeader.tsx`**, mirroring
`lib/events.ts`'s established split between pure logic and the component
that renders it - unit-tested directly rather than only through the
component.

## Alternatives Considered

- **A single combined `version_compatible: bool`** - rejected: loses the
  ability to tell the user (and future debugging) which axis actually
  broke, and contradicts CodexiaCore's own ADR-011 rationale for keeping
  the two numbers separate in the first place.
- **Computing compatibility in TypeScript instead of Rust** (the raw
  `api_version`/`protocol_version` numbers are already in the payload
  Desktop receives) - rejected: `next_status` is the established,
  already-tested home for "given health data, compute a derived status
  field" (see `restarted`); duplicating the same decision in TypeScript
  would mean two implementations of one comparison, and two places a
  future version bump could be updated inconsistently.
- **Blocking task creation / disabling the UI on a mismatch** - rejected
  as out of scope: most contract changes are additive (a new optional
  field, a new endpoint) and don't actually break an older client in
  practice; a hard block would punish the common case to guard against
  the rare breaking one. A visible, informative, non-dismissible banner
  is enough for a single-user, local-first tool (ADR-008 in CodexiaCore)
  where the user is generally in a position to just upgrade one side.
- **Fetching a separate `/version` or compatibility-check endpoint** -
  rejected: `GET /health` already carries both numbers on every poll this
  app already makes; a second endpoint would be a duplicate round trip
  for data already in hand.

## Consequences

- `COMPATIBLE_API_VERSION`/`COMPATIBLE_PROTOCOL_VERSION` are a manual
  bookkeeping cost this ADR obligates going forward - same discipline
  CodexiaCore's ADR-011 already imposes on itself for bumping the
  server-side constants, now mirrored client-side: a future Desktop
  change that adopts a breaking REST/SSE contract change must also bump
  the matching constant here, or the banner will (harmlessly, but
  incorrectly) never fire for that mismatch.
- The banner is purely informational - no request is blocked, no feature
  is gated on it. A genuinely breaking change could still fail in a
  more specific, confusing way at the point of use; this ADR only adds
  an early, general warning, not a compatibility shim or version
  negotiation.
- Both constants are `1` today, matching CodexiaCore's current
  `API_VERSION`/`PROTOCOL_VERSION` - this phase ships with the banner
  correctly silent until a real mismatch first occurs.

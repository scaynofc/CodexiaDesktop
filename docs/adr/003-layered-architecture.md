# ADR-003: Presentation / Desktop Services / Core Bridge Layering

**Status:** Accepted

## Context

Codexia Desktop is the first of several planned clients (Mobile, VS Code
Extension, Cloud) that will eventually talk to the same Codexia Core API
contract. Without an enforced layering discipline from the start, it is
easy for a desktop app to accumulate ad-hoc HTTP calls scattered across UI
components, business logic mixed into whatever layer is most convenient at
the time, and reconnect/retry logic duplicated or missing in different
screens - exactly the kind of drift that makes an app expensive to extend
once GPU Center, Provider Center, and Approval Center all need the same
underlying reliability guarantees.

## Decision

Four strict layers, each with one job:

```
Presentation (React)
     |
Desktop Services (Rust)
     |
Core Bridge (Rust)
     |
Codexia Core (HTTP / SSE)
```

- **Presentation** renders only. It calls `invoke()` on Tauri commands and
  reads Zustand stores (ADR-002) - it never decides retry policy, never
  interprets raw API responses, never owns cache state.
- **Desktop Services** owns every UI-facing behavior: reconnect, retry,
  offline-mode detection, notifications, polling cadence, local cache,
  and all Desktop-side state. This is where "is Core reachable right now"
  and "when did we last refresh the task list" live.
- **Core Bridge** is pure transport - the only code in the whole app that
  speaks HTTP/SSE to Codexia Core. It contains no business logic, makes no
  decisions, interprets no data beyond deserializing the wire format, and
  holds no UI state or cache of its own. Transport (REST today, SSE today,
  a future WebSocket) is abstracted behind this layer so nothing above it
  needs to know which one is in use.
- **Codexia Core** is the existing, unmodified Python backend - this app
  never touches its SQLite files directly and only ever communicates over
  REST/SSE (confirmed as a hard architectural boundary during Phase 0's
  cross-repo review with CodexiaCore).

Tauri commands (`src-tauri/src/commands/`) are the thin dispatch surface
Presentation calls - a command's body is a one-line delegation into
Desktop Services, never a place logic accumulates.

## Alternatives Considered

- **No enforced layering (organize by feature/screen instead)** - faster
  to start with, since Phase 1 only has one placeholder screen. Rejected:
  the whole point of a Foundation sprint is that Provider Center, GPU
  Center, and Approval Center (Phases 6-8) will each need the exact same
  reconnect/retry/cache guarantees - building them against a shared,
  enforced Desktop Services layer from day one is cheaper than retrofitting
  the discipline after three screens have already grown their own
  divergent HTTP-handling code.
- **Merge Core Bridge and Desktop Services into one layer** - fewer moving
  parts. Rejected: Core Bridge's value is specifically that it stays
  swappable and dumb (a future WebSocket transport, or a mocked bridge for
  testing Desktop Services in isolation, only works cleanly if it has zero
  business logic to carry along with it).

## Consequences

- Every future screen's implementation cost is bounded: it consumes a
  Zustand store and calls a small number of Tauri commands - it never
  needs to think about HTTP retry semantics or reconnect logic itself.
- Code review has a simple, mechanical check for layer violations: does a
  React component import anything HTTP-related directly? Does Core Bridge
  contain an `if` statement that isn't about parsing/transport? Either is
  a rule violation, not a style preference.
- This adds one extra hop (Presentation -> Desktop Services -> Core
  Bridge) compared to a component calling `fetch()` directly - a small,
  deliberate cost in exchange for every future screen and every future
  client product (Mobile, VS Code, Cloud) being able to reuse the same
  reliability behavior instead of reimplementing it.

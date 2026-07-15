# ADR-002: Zustand Fed by Tauri Events, Not a Client-Fetching Library

**Status:** Accepted

## Context

Codexia Desktop's architecture (ADR-003) puts Desktop Services (Rust) in
sole charge of reconnect, retry, polling, offline mode, and caching against
Codexia Core's HTTP/SSE API - the Presentation layer (React) is only
supposed to render. A common default choice for a React app talking to a
backend is a client-fetching/caching library (React Query, SWR) - but that
class of library inherently owns its own polling, caching, and retry
logic on the JavaScript side, which would duplicate (and likely conflict
with) the exact responsibilities the architecture already assigns to Rust.

## Decision

State management on the React side is **Zustand** (a minimal, boilerplate-
light store), fed exclusively by Rust-emitted Tauri events (`app.emit(...)`
on the Rust side, `listen(...)` on the React side) - never by a component
calling `invoke()` directly and writing the result into its own state, and
never by a fetching library polling Core on its own schedule. Rust decides
when to poll/refresh/retry against Core; it pushes the result to the
frontend as an event; a small set of Zustand stores mirror that event
stream for components to read.

## Alternatives Considered

- **React Query / SWR** - excellent, widely-adopted libraries for exactly
  this class of problem in a typical web app. Rejected specifically
  _because_ they are good at it: adopting one would silently create a
  second, competing owner of polling/retry/cache behavior on the JS side,
  directly violating the layering rule this project treats as
  non-negotiable (Desktop Services owns this, Core Bridge and Presentation
  do not). This is a case where a library's biggest strength is the wrong
  fit for this specific architecture.
- **Redux / Redux Toolkit** - more ceremony and boilerplate than this
  app's actual state shape needs (mostly "mirror of the latest Rust-pushed
  snapshot," not complex derived/normalized client state); Zustand's much
  smaller surface area fits a UI that's meant to just render.
- **Plain React Context + `useState`** - would work for a very small app,
  but re-render behavior and selector ergonomics get worse as more screens
  (Dashboard, Tasks, Providers, GPU, ...) each need slices of shared state;
  Zustand solves this with negligible extra cost over Context.

## Consequences

- Every new "Rust knows something the UI needs to show" case follows one
  repeated shape: Rust emits an event -> a Zustand store's event listener
  updates -> components re-render from the store. No screen invents its
  own fetching/caching path.
- No React code ever needs its own loading/error/retry state machine for
  Core connectivity - that entire class of complexity lives once, in Rust,
  and the frontend just reflects it.
- This does mean the frontend cannot independently decide to poll more
  aggressively or bypass Rust's caching for a specific screen - any such
  need is a Desktop Services (Rust) change, not a frontend one. Accepted:
  this is the whole point of the layering rule, not a limitation to work
  around.

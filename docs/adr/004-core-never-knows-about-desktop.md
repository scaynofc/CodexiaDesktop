# ADR-004: Core Never Knows About Desktop

**Status:** Accepted

## Context

Codexia Desktop is the first of several planned clients (Mobile, VS Code
Extension, Cloud) that will all talk to the same Codexia Core. It would be
easy, under schedule pressure, to add a Desktop-specific endpoint,
response field, or behavior branch directly into CodexiaCore "just for
now" - Core already has a real `GET /` dashboard page and a bearer-token
auth model that predate this project, so the precedent for "add a little
something to the API for whichever UI needs it" already exists in a small
way.

## Decision

**Core never knows Desktop exists.** The dependency direction is strictly
one-way: Codexia Desktop depends on Codexia Core's API contract; Codexia
Core has zero knowledge of, dependency on, or special-casing for Codexia
Desktop specifically. Concretely:

- Every new endpoint CodexiaCore gains because Desktop needs it (the
  `/system/status` split, the unified `GET /approvals`, the Memory/Metrics
  API additions agreed during the cross-repo Phase 0 review) is designed
  as a generic, product-agnostic capability of Core's API - never named,
  shaped, or documented as "for Desktop." The same endpoint must make
  equal sense for Mobile, VS Code, or Cloud to call.
- CodexiaCore's own repository, tests, and documentation never reference
  "Codexia Desktop," Tauri, Rust, or React anywhere. If a CodexiaCore
  change description needs to say "Desktop needs this," that is a signal
  the endpoint is being designed backwards (from one client's convenience)
  rather than forwards (from what Core's API should generally expose).
- Codexia Desktop, conversely, is explicitly allowed to know everything
  about Core - its API shape, its SSE event vocabulary, its version
  numbers (ADR from the Phase 0 review covering independent Core/API/
  Protocol versioning). The asymmetry is deliberate.

## Alternatives Considered

- **Let Core grow Desktop-aware conveniences over time** (e.g. an endpoint
  that returns data pre-shaped for a specific screen's exact display
  needs) - faster in the moment. Rejected: this is exactly how a shared
  backend accumulates client-specific special cases that become
  impossible to remove once Mobile/VS Code/Cloud also depend on them, and
  directly contradicts CodexiaCore's own stated principle (confirmed
  during the Phase 0 review) that no product gets Core-specific
  endpoints - new needs become common API.
- **A Desktop-specific API version or namespace** (e.g. `/desktop/v1/...`)
  - would at least make the special-casing explicit rather than hidden.
    Still rejected: it institutionalizes the asymmetry this ADR exists to
    prevent, and every future client would reasonably ask for the same
    treatment.

## Consequences

- Any endpoint or field Codexia Desktop needs that Core doesn't yet
  expose is proposed and built as a general CodexiaCore API capability
  (in the CodexiaCore repo, following its own architecture-review process
  and ADR convention), not as a quick addition scoped to "what Desktop's
  current screen needs."
- Codexia Desktop's own `docs/adr/` and code may freely reference
  CodexiaCore's types, endpoints, and behavior in detail - that direction
  of knowledge is expected and fine.
- If a genuinely Desktop-only concern ever seems to require a Core change
  that makes no sense for any other client, that is a signal to solve it
  entirely within Codexia Desktop (Desktop Services/Core Bridge) instead
  of asking Core to change - reinforcing the boundary rather than eroding it.

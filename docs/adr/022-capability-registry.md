# ADR-022: Capability Registry

**Status:** Accepted

## Context

CodexiaCore's ADR-026 fixed a visibility gap: `Engine.tools` (a
`ToolRegistry`) already holds every built-in, MCP-sourced, and browser
tool the engine can invoke, but nothing ever read that registry back out

- not to the planning LLM (`PlannerAgent.ALLOWED_TOOLS = ["web_search"]`
  is hardcoded, a separate fix tracked as Wave 3's third item), and not to
  any Desktop screen. A user connecting an MCP server via CodexiaCore's
  config had no way to see, from Desktop, that it worked or what tools it
  added.

CodexiaCore's new `GET /capabilities` (ADR-026 there) closes the second
half: a read-only snapshot of the registry, each entry carrying
`name`/`description`/`parameters`/`requires_approval`/`source` (`"built_in"`
or `"mcp"`, derived from the `mcp__<server>__<tool>` naming convention
`MCPToolAdapter` already establishes).

## Decision

**A new screen, Capability Registry, one-shot fetch and Refresh - same
shape as Runtime Center (ADR-010) and Provider Center (ADR-009).** No
poll loop: a tool registry only changes on Core restart or MCP config
reload, not mid-session, the same reasoning already established for both
of those screens.

1. **Core Bridge** (`core_bridge/capabilities.rs`) - `Capability` struct
   and `CapabilitySource` enum (`#[serde(rename_all = "snake_case")]`,
   giving `BuiltIn` → `"built_in"` and `Mcp` → `"mcp"` for free, no
   per-variant rename needed) mirroring CodexiaCore's model field-for-
   field, plus `CoreHttpClient::get_capabilities()`.
2. **Desktop Services** (`services/capabilities.rs`) -
   `CapabilitiesFetcher` trait + `fetch_capabilities()`, same
   trait-for-testability shape as `services::runtime`.
3. **Command** (`commands::get_capabilities`) - thin dispatch, registered
   in `lib.rs`.
4. **Store + screen** (`stores/capabilityStore.ts`,
   `screens/Capabilities.tsx`) - fetch on mount and on Refresh; each row
   shows the tool name, a source badge (MCP color-coded distinctly from
   built-in, since that's the fact a user would most want to scan for),
   a "Requires approval" badge when set, the description, and a
   collapsible raw-JSON view of `parameters` (same `<details>`-based
   disclosure CodexiaCore's approval payloads already establish a
   precedent for via untyped JSON rendering).
5. **Nav** - added as `"capabilities"` in `navigation.ts`, between Log
   Center and Settings; a new top-level screen, not a tab on an existing
   one, since it answers a different question than any existing Center
   (not what's running, not what happened, not what's pending approval -
   what's possible at all).

## Alternatives Considered

- **A tab on Provider Center or Settings** - rejected: Provider Center is
  scoped to LLM providers and their health/cost, not tools; Settings is
  local Desktop configuration, not a live server-side fact. Neither
  screen's existing scope fits "what tools does Core have," so a new
  top-level screen (matching how every other CodexiaCore capability this
  app surfaces got its own Center) is more consistent than bolting onto
  an unrelated one.
- **Poll on an interval like Approval Center** - rejected: nothing in
  CodexiaCore signals when the tool registry changes (it's fixed at
  `Engine.__init__`, only varying across a process restart), so a poll
  loop would burn cycles re-fetching an answer that's almost always
  identical - the same reasoning Runtime Center and Provider Center
  already settled for their own one-shot-fetch shape.
- **Show `parameters` inline instead of behind a `<details>` toggle** -
  rejected: some tools' JSON schemas are large enough to dominate the
  list at a glance; collapsed-by-default keeps the primary scan (name,
  source, approval requirement) uncluttered while still making the full
  schema one click away.

## Consequences

- 22 new tests: 6 Rust (4 `core_bridge::capabilities` - deserialization +
  snake_case source serialization, 2 `services::capabilities` - scripted-
  fetcher success/error) and 16 TypeScript (4 `lib/capabilities.ts` -
  source label, badge className, parameter pretty-printing; 5
  `capabilityStore.ts` - idle/success/mcp-labeled/empty/error; 7
  `Capabilities.tsx` - mount-fetch, loading, empty, built-in render, mcp
  render with approval badge, Refresh, error). Full suite (114 Rust, 249
  TS) passing, ESLint/tsc/clippy/cargo fmt/prettier all clean.
- `navigation.test.ts`'s "every screen built and enabled" assertion
  updated to include `"capabilities"` - the same test ADR-019/020/021
  each had to extend, confirming this repeats the established pattern
  rather than drifting from it.
- Deliberately does not change what the planner sees - this ADR only
  makes the registry visible to a human via Desktop; CodexiaCore's own
  Wave 3 Planner Awareness item (tracked separately, not yet built as of
  this ADR) is the actual fix for `PlannerAgent.ALLOWED_TOOLS`'s
  blindness.
- **Live-verified in this app's real running UI, not just unit tests**:
  started a real CodexiaCore server (no MCP configured) and this app's
  real `npm run tauri dev` window, focused it, navigated to Capability
  Registry, and confirmed all 5 real built-in tools rendered - correct
  names/descriptions, "Built-in" source badges, "Requires approval"
  shown only on `write_file`/`run_command` (matching CodexiaCore's real
  response exactly, cross-checked against a direct `curl
/capabilities`). Expanded `read_file`'s Parameters `<details>` and
  confirmed the real JSON schema rendered correctly. Opened DevTools
  (F12) and confirmed the Console reported "No Issues" - zero errors
  throughout. CodexiaCore's ADR-026 has the server-side half of this same
  verification pass.

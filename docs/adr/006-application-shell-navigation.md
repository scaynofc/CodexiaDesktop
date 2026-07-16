# ADR-006: Application Shell — Routing and Navigation

**Status:** Accepted

## Context

Through Phase 2, the entire app was `src/App.tsx` rendering one thing: a
connection-status card. `src/screens/README.md` already commits this
project to a 9-screen roadmap (Dashboard, Task Center, Timeline, Provider
Center, GPU Center, Approval Center, Memory Center, Log Center, Settings)
and states they "are added starting Phase 3 (Application Shell)." This
phase's job is to build the durable navigation scaffold those screens hang
off of - not to build the screens themselves, which are each their own
future phase.

## Decision

**Router: `react-router-dom` v7, declarative `<MemoryRouter>` +
`<Routes>`/`<Route>`** - not the data-router API (`createBrowserRouter` +
loaders/actions). ADR-002 already puts all data ownership in Zustand
stores fed by Tauri events, so a data router's loaders would be unused
machinery layered over a system that doesn't need it.

**`MemoryRouter`, not `BrowserRouter`/`HashRouter`**: a desktop app has no
meaningful URL bar for the user, and `src-tauri/tauri.conf.json` has no
SPA-fallback/rewrite configuration for Tauri's asset protocol. A real
browser-history router risks a blank screen if the webview reloads (F5, a
crash-recovery reload) while on a deep path, since there's no server-side
fallback routing the way a real web host would provide. `MemoryRouter`
sidesteps this entirely - there is no address bar to reflect.

A router at all (vs. a hand-rolled `activeScreenId` Zustand store) is
justified here, not premature abstraction: the 9-screen list is already
written and concrete in `screens/README.md`, not speculative, and
"Application Shell" is itself the named phase whose entire job is this
scaffold.

**One manifest is the single source of truth**, `src/shell/navigation.ts`:
a `NAV_ITEMS` array of `{ id, label, path, icon, enabled }`. Both the
sidebar and the router read from it. Only `dashboard` is `enabled: true`
today; a future phase adding a screen flips its `enabled` flag and adds one
`<Route>` in `App.tsx` - nothing else about the shell changes.

**Disabled items get no `<Route>` at all.** They render as a real
`<button disabled>` (the native `disabled` attribute - `SidebarMenuButton`
spreads props onto a real button, so this works without any aria/tabIndex
workaround) wrapped in a `Tooltip` explaining the screen isn't built yet.
This is deliberately **not** 8 throwaway "coming soon" stub screens - this
team has consistently rejected building against unbuilt/hypothetical needs
elsewhere (e.g. Phase 2's cache-invalidation deferral), and a stub page is
exactly that: code with no real behavior, that will be deleted the moment
the real screen lands. No catch-all `<Route path="*">` either - with no
`<Link>`/`href` ever pointing at an unregistered path, there is no code
path that can reach one; a catch-all would guard a structurally
unreachable state.

Note: `SidebarMenuButton`'s own built-in `tooltip` prop does not work for
this - in `src/components/ui/sidebar.tsx` its `TooltipContent` is rendered
`hidden={state !== "collapsed" || isMobile}`, i.e. visible only in
collapsed icon-only mode. A standalone `Tooltip`/`TooltipTrigger`/
`TooltipContent` wrapper is used instead for disabled items, so the reason
is visible in the normal expanded sidebar too.

**Connection badge and restart notice move to a shared `AppHeader`**, out
of Dashboard - connectivity is app-wide, not Dashboard-specific, matching
what `docs/adr/005-connection-state-machine.md`'s Consequences section
already says: "any future screen that cares about connectivity reads the
same store." `Dashboard.tsx` keeps only the health-details table
(core/api/protocol version, instance_id) - genuinely dashboard-specific
content.

**File layout**: `src/shell/` (sibling to `screens/`/`stores/`, matching
this repo's existing top-level-domain-folder convention) holds
`navigation.ts`, `AppSidebar.tsx`, `AppHeader.tsx`. Shell composition
itself stays inline in `App.tsx` - no separate `AppShell.tsx`, since there
is no second consumer to justify that indirection.

## Alternatives Considered

- **Data router (`createBrowserRouter`/`createMemoryRouter` + loaders)** -
  rejected: no route needs to load data independently of a Zustand store:
  ADR-002 already assigns all data ownership to Rust-pushed events. Loaders
  would be unused machinery maintained for no benefit.
- **`BrowserRouter` or `HashRouter`** - rejected: no SPA-fallback exists for
  Tauri's asset protocol in this app's configuration, so a reload on a deep
  path would show a blank/404 screen. `MemoryRouter` has no such failure
  mode and no address bar is lost, since none was ever visible to the user.
- **Hand-rolled `activeScreenId` Zustand store instead of a router** -
  would need to reinvent `NavLink`-style active-path matching and,
  eventually, nested routes for in-screen sub-views, for no real savings
  over an established, well-tested router given a router is already
  justified by the concrete 9-screen roadmap.
- **Stub "coming soon" screens for all 9 planned sections** - rejected as
  premature: 8 throwaway components with no real behavior, all needing
  deletion the moment their real screen lands. A disabled, tooltipped
  sidebar item conveys the same information (this exists on the roadmap,
  isn't built yet) without any code that will be thrown away.

## Consequences

- Every future phase adding a screen touches exactly two things: flip
  `enabled: true` in `navigation.ts`, add one `<Route>` in `App.tsx`. The
  sidebar, header, and routing all update automatically from the manifest.
- `src/hooks/use-mobile.ts` (used by the vendored `Sidebar`) calls
  `window.matchMedia` unconditionally; jsdom doesn't implement it, so
  `src/test/setup.ts` now stubs it - any future test rendering the shell
  inherits this for free.
- The mobile/narrow-width collapsed `Sheet` overlay (part of the vendored
  `Sidebar` component) is exercised by this app for the first time in this
  phase, verified manually (see the Phase 3 end-of-phase report).

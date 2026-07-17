# screens/

Presentation-layer screens. `Dashboard.tsx` (Phase 3), `Tasks.tsx`
(Phase 4), `Timeline.tsx` (Phase 5), `Providers.tsx` (Phase 6),
`Runtime.tsx` (Phase 7), `Memory.tsx` (Phase 8), `Log.tsx` (Phase 9), and
`Settings.tsx` (Phase 11) are built. Approval Center is the only
remaining item listed in `../shell/navigation.ts` still appearing as a
disabled sidebar item - it gets its own file here, and its `enabled` flag
flipped, when its own future phase lands. See
`docs/adr/006-application-shell-navigation.md`.

Note: `Runtime.tsx` was originally planned as "GPU Center" - renamed once
its actual scope (Ollama's loaded-model state via CodexiaCore, not
host-machine GPU/hardware monitoring) was decided; see
`docs/adr/010-runtime-center-ollama-proxy.md`. Approval Center was
deliberately deferred rather than built with a placeholder scope -
CodexiaCore has no queryable "pending approval" concept today, so a
browsing UI would have had nothing real to show. `Log.tsx` was originally
considered a raw log/error viewer, but shipped as a filtered list over
CodexiaCore's derived `GET /events` instead - see
`docs/adr/012-log-center-derived-events.md`. `Settings.tsx` is numbered
Phase 11, not 10 (Approval Center's original slot, still unclaimed) - see
`docs/adr/013-settings-local-desktop-configuration.md`.

Rule: a screen only renders. It never calls `invoke()` directly and never
owns polling/retry/cache state - it reads from a Zustand store in
`../stores/` and calls that store's action methods. Most stores are kept
live by Desktop Services pushing Tauri events (`taskStore`,
`connectionStore`); `metricsStore` (Phase 6), `runtimeStore` (Phase 7),
`memoryStore` (Phase 8), `eventsStore` (Phase 9), and `settingsStore`
(Phase 11) instead expose a `fetch*()`/action method the screen calls on
mount/refresh/user action, since CodexiaCore has no change-notification
event for any of them - see
`docs/adr/009-provider-center-metrics-snapshot.md`,
`docs/adr/010-runtime-center-ollama-proxy.md`,
`docs/adr/011-memory-center-project-scoped-tasks.md`,
`docs/adr/012-log-center-derived-events.md`, and
`docs/adr/013-settings-local-desktop-configuration.md`.

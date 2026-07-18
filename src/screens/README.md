# screens/

Presentation-layer screens. Every screen listed in `../shell/navigation.ts`
is now built: `Dashboard.tsx` (Phase 3), `Tasks.tsx` (Phase 4),
`Timeline.tsx` (Phase 5), `Providers.tsx` (Phase 6), `Runtime.tsx`
(Phase 7), `Approvals.tsx` (Phase 10, its original slot - see below),
`Memory.tsx` (Phase 8), `Log.tsx` (Phase 9), and `Settings.tsx`
(Phase 11). See `docs/adr/006-application-shell-navigation.md`.

Note: `Runtime.tsx` was originally planned as "GPU Center" - renamed once
its actual scope (Ollama's loaded-model state via CodexiaCore, not
host-machine GPU/hardware monitoring) was decided; see
`docs/adr/010-runtime-center-ollama-proxy.md`. `Approvals.tsx` was
deliberately deferred twice - first when Memory Center shipped in its
Phase 10 slot instead, again until CodexiaCore's own Approval System
phase gave it a queryable "pending approval" concept to show; see
`docs/adr/014-approval-center-human-in-the-loop.md`. `Log.tsx` was
originally considered a raw log/error viewer, but shipped as a filtered
list over CodexiaCore's derived `GET /events` instead - see
`docs/adr/012-log-center-derived-events.md`. `Settings.tsx` is numbered
Phase 11, not 10 (Approval Center's own original slot) - see
`docs/adr/013-settings-local-desktop-configuration.md`.

Rule: a screen only renders. It never calls `invoke()` directly and never
owns cache state - it reads from a Zustand store in `../stores/` and
calls that store's action methods. Most stores are kept live by Desktop
Services pushing Tauri events (`taskStore`, `connectionStore`);
`metricsStore` (Phase 6), `runtimeStore` (Phase 7), `memoryStore`
(Phase 8), `eventsStore` (Phase 9), `settingsStore` (Phase 11), and
`approvalStore` (Phase 10) instead expose a `fetch*()`/action method the
screen calls on mount/refresh/user action, since CodexiaCore has no
change-notification event for any of them - see
`docs/adr/009-provider-center-metrics-snapshot.md`,
`docs/adr/010-runtime-center-ollama-proxy.md`,
`docs/adr/011-memory-center-project-scoped-tasks.md`,
`docs/adr/012-log-center-derived-events.md`,
`docs/adr/013-settings-local-desktop-configuration.md`, and
`docs/adr/014-approval-center-human-in-the-loop.md`. `Approvals.tsx` is
the one exception to "never owns polling state" - see ADR-014 for why its
poll interval is deliberately screen-scoped rather than living in Desktop
Services like every other store's one-shot fetch.

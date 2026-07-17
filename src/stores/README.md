# stores/

Zustand stores fed by Tauri event listeners - components never call
`invoke()`/`listen()` directly and write results into local state (that
would let Presentation own network/cache logic, violating the layering
rule in `docs/adr/003-layered-architecture.md`). A store's `init()` is the
one place that talks to the Tauri bridge; everything else just reads the
store reactively.

- `connectionStore.ts` (Phase 2) - mirrors
  `src-tauri/src/services/connection.rs`'s `ConnectionStatus`, fed by the
  `connection-status-changed` event.
- `taskStore.ts` (Phase 4) - task list + the currently-watched task's live
  detail, fed by `tasks-changed`/`task-detail-changed`, plus action methods
  (`createTask`/`resumeTask`/`cancelTask`) that call `invoke()` directly -
  not every store method needs to be fed by a push event, only the ones
  representing state something else (a poll loop, an SSE watch) can change
  independently of this app's own actions.
- `metricsStore.ts` (Phase 6) - a single `fetchMetrics()` action wrapping
  `get_metrics`, no event subscription at all: CodexiaCore has no
  metrics-changed notification, so there's nothing to listen for - see
  `docs/adr/009-provider-center-metrics-snapshot.md`.
- `runtimeStore.ts` (Phase 7) - same shape as `metricsStore.ts`, a single
  `fetchRuntime()` action wrapping `get_ollama_runtime` - see
  `docs/adr/010-runtime-center-ollama-proxy.md`.
- `memoryStore.ts` (Phase 8) - `fetchMemory(projectId)`/`forgetKey(projectId, key)`
  wrapping `get_project_memory`/`forget_project_memory`; unlike the other
  stores, the project id itself is screen-local state (`Memory.tsx`'s own
  `useState`), not held in the store - see
  `docs/adr/011-memory-center-project-scoped-tasks.md`.
- `eventsStore.ts` (Phase 9) - same shape as `metricsStore.ts`/
  `runtimeStore.ts`, a single `fetchEvents(limit?)` action wrapping
  `get_events` - see `docs/adr/012-log-center-derived-events.md`.
- `settingsStore.ts` (Phase 11) - `loadConfig()`/`saveConfig(config)`
  wrapping `get_config`/`save_config`, plus a separate
  `testConnection(coreUrl, authToken)` wrapping `test_connection` with its
  own `testState`/`testError` pair (never conflated with a load/save
  failure). Has an `init()` like `taskStore`/`connectionStore` - called
  from `App.tsx`'s root effect, not just `Settings.tsx`'s own mount, so
  `config.default_project_id` reaches Task Center whether or not the user
  ever opens Settings - see
  `docs/adr/013-settings-local-desktop-configuration.md`.

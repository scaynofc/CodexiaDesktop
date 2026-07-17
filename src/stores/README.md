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

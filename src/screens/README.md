# screens/

Presentation-layer screens. `Dashboard.tsx` (Phase 3), `Tasks.tsx`
(Phase 4), `Timeline.tsx` (Phase 5), and `Providers.tsx` (Phase 6) are
built. The rest (GPU, Approvals, Memory, Logs, Settings) are listed in
`../shell/navigation.ts` and appear as disabled sidebar items - each gets
its own file here, and its `enabled` flag flipped, when its own future
phase lands. See `docs/adr/006-application-shell-navigation.md`.

Rule: a screen only renders. It never calls `invoke()` directly and never
owns polling/retry/cache state - it reads from a Zustand store in
`../stores/` and calls that store's action methods. Most stores are kept
live by Desktop Services pushing Tauri events (`taskStore`,
`connectionStore`); `metricsStore` (Phase 6) instead exposes a
`fetchMetrics()` action the screen calls on mount/refresh, since
CodexiaCore has no metrics-changed event to listen for - see
`docs/adr/009-provider-center-metrics-snapshot.md`.

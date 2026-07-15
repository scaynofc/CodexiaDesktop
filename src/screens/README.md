# screens/

Presentation-layer screens (Dashboard, Tasks, Timeline, Providers, GPU,
Approvals, Memory, Logs, Settings) are added starting **Phase 3
(Application Shell)**. Empty in Phase 1 by design - see
`docs/adr/003-layered-architecture.md`.

Rule: a screen only renders. It never calls `invoke()` directly and never
owns polling/retry/cache state - it reads from a Zustand store in
`../stores/` that Desktop Services (Rust) keeps up to date via Tauri events.

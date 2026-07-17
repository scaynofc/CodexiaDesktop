# screens/

Presentation-layer screens. `Dashboard.tsx` (Phase 3), `Tasks.tsx`
(Phase 4), and `Timeline.tsx` (Phase 5) are built. The rest (Providers,
GPU, Approvals, Memory, Logs, Settings) are listed in
`../shell/navigation.ts` and appear as disabled sidebar items - each gets
its own file here, and its `enabled` flag flipped, when its own future
phase lands. See `docs/adr/006-application-shell-navigation.md`.

Rule: a screen only renders. It never calls `invoke()` directly and never
owns polling/retry/cache state - it reads from a Zustand store in
`../stores/` that Desktop Services (Rust) keeps up to date via Tauri events.

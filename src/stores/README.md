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

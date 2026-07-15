# stores/

Zustand stores fed by Tauri event listeners (never by directly calling
`invoke()` and writing the result into local component state - that would
let Presentation own network/cache logic, violating the layering rule).
First real store lands in **Phase 2 (Core Bridge)** once there is a
connection-status event to subscribe to. Empty in Phase 1 by design.

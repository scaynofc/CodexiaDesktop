# ADR-001: Tauri v2 + Rust + React Over Electron

**Status:** Accepted

## Context

Codexia Desktop needs to be a genuine, professional-grade native
application - a long-lived local process with a system tray presence, low
resource overhead, and a native installer - that talks to the existing
Codexia Core Python backend over HTTP/SSE. It never runs inference itself
(Core stays the only place that talks to a model provider). The choice was
between Electron (Chromium + Node.js bundled per app) and Tauri (native
OS webview + a Rust backend), both mature, widely-used options for
building desktop apps with web-technology UIs.

## Decision

Tauri v2, with a Rust backend and a React + TypeScript + Vite frontend.
This was specified directly in the Sprint 1 brief, and independently
confirmed as the right choice: Tauri apps bundle only the app's own code
(the OS's existing native webview is reused - WebView2 on Windows, WebKit
on macOS/Linux - already installed on this machine, confirmed during Phase
0), producing dramatically smaller installers and lower idle memory
footprint than an Electron app bundling its own Chromium + Node runtime.
Tauri v2's plugin system also has first-class support for exactly what
this app needs later (system tray, autostart, global shortcuts,
notifications) without pulling in a full Node.js runtime for the backend
half of the app.

## Alternatives Considered

- **Electron** - the more established ecosystem, larger community,
  slightly simpler mental model (both processes are JavaScript). Rejected:
  every Electron app ships its own Chromium + Node.js runtime (typically
  100+ MB installers, higher idle RAM use), which matters for a background,
  always-available "control center" app meant to run continuously
  alongside Codexia Core - not a one-off tool a user opens and closes.
- **A pure web app** (Codexia Core's existing FastAPI + the bundled
  `static/dashboard.html`) - zero new tooling. Rejected: explicitly out of
  scope per the Sprint 1 brief - a background-capable, tray-resident,
  OS-integrated native app is the actual goal, which a browser tab cannot
  provide (no reliable background execution, no tray icon, no native
  notifications, no autostart).

## Consequences

- The team maintains two languages in one app (Rust for `src-tauri/`,
  TypeScript for `src/`) - a real cost, but one Tauri itself is designed
  around; the boundary is enforced by the layering rule (ADR-003), not
  left ambiguous.
- Every dependency Tauri itself needs (a Rust toolchain, and on Windows a
  C++ build toolchain + Windows SDK) had to be installed as a Phase 1
  prerequisite - already done and verified (`rustc`, `cargo`, Visual
  Studio 2022 Build Tools, WebView2 all confirmed present before scaffolding).
- Future products (Mobile, VS Code Extension, Cloud) do not need to use
  Tauri themselves - this decision is scoped to the Desktop app only; they
  talk to the same Core API contract (see CodexiaCore's own architectural
  principle that no product gets Core-specific endpoints) through whatever
  native stack fits each platform.

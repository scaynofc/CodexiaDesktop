# Codexia Desktop

A native control center for the [Codexia Core](../CodexiaCore) runtime —
Dashboard, Task Center, Timeline, Provider Center, GPU Center, Approval
Center, Log Center, and Settings, built on Tauri v2 + Rust + React.

Codexia Desktop never runs inference itself. Every model call stays in
Codexia Core; this app only talks to Core's HTTP/SSE API.

**Status:** Phase 1 (Foundation) — an empty but real, working shell.
Real screens land in later phases. See `docs/adr/` for the architectural
decisions behind this app, and the CodexiaCore repo's own
`MASTER_ROADMAP_V2.md` / Phase 0 architecture review for the cross-repo
context this project builds on.

## Architecture

```
Presentation (React)  ->  Desktop Services (Rust)  ->  Core Bridge (Rust)  ->  Codexia Core
```

See `docs/adr/003-layered-architecture.md` for what each layer owns and
the rules for not crossing them.

## Prerequisites

- Node.js 18+ and npm
- Rust (stable, via [rustup](https://rustup.rs))
- Windows: Visual Studio Build Tools (C++ workload) + WebView2 runtime
  (already present on most Windows 10/11 machines)

## Development

```bash
npm install
npm run tauri dev
```

## Versioning

The project version (`VERSION`, `package.json`, `Cargo.toml`) is
`0.1.0-alpha`. `src-tauri/tauri.conf.json`'s `version` field is
deliberately kept plain (`0.1.0`, no prerelease suffix) - this is the one
field passed straight to platform bundlers, and Windows' MSI bundler
(WiX) rejects a non-numeric prerelease identifier
(`optional pre-release identifier in app version must be numeric-only...
for msi target`, confirmed via a real `npm run tauri build` run). This is
a Windows Installer constraint, not a CodexiaDesktop inconsistency - the
semantic project version stays `0.1.0-alpha` everywhere a human or a
package manager reads it.

## Testing & Linting

```bash
# Rust (src-tauri/)
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt -- --check

# TypeScript / React (src/)
npm test
npm run lint
npm run format:check
```

## Project Structure

```
src-tauri/src/
├── core_bridge/   pure HTTP/SSE transport to Codexia Core, no business logic
├── services/      Desktop Services - reconnect, retry, cache, notifications
├── commands/      thin Tauri command dispatch surface for the frontend
└── main.rs / lib.rs

src/
├── screens/       Presentation - render-only (Dashboard, Tasks, ...)
├── stores/        Zustand stores fed by Tauri events (not by direct fetch)
├── components/ui/ shadcn/ui components (vendored, regenerated via `npx shadcn add`)
└── App.tsx
```

# Architecture Decision Records — Codexia Desktop

Same convention as CodexiaCore's `docs/adr/`: Title, Status, Context,
Decision, Alternatives Considered, Consequences. This is a separate
sequence (starts at 001) - Codexia Desktop is its own repository with its
own architectural history, distinct from CodexiaCore's ADRs (which cover
the Python runtime this app connects to).

| #                                                  | Decision                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [001](001-tauri-v2-over-electron.md)               | Tauri v2 + Rust + React over Electron                                                        |
| [002](002-zustand-over-react-query.md)             | Zustand fed by Tauri events, not a client-fetching library                                   |
| [003](003-layered-architecture.md)                 | Presentation / Desktop Services / Core Bridge layering and its rules                         |
| [004](004-core-never-knows-about-desktop.md)       | Core never knows about Desktop - dependency direction is one-way                             |
| [005](005-connection-state-machine.md)             | Core Bridge connection state machine and restart detection                                   |
| [006](006-application-shell-navigation.md)         | Application Shell routing, nav manifest, disabled-vs-stub screens                            |
| [007](007-task-center-polling-and-sse.md)          | Task Center: hand-rolled SSE, hybrid refresh, bounded resume retry                           |
| [008](008-timeline-derived-view.md)                | Timeline: purely-derived view over existing task state, no new API                           |
| [009](009-provider-center-metrics-snapshot.md)     | Provider Center: one-shot metrics fetch, no poll loop, new `GET /metrics`                    |
| [010](010-runtime-center-ollama-proxy.md)          | Runtime Center (was "GPU Center"): Ollama state via a Core proxy, not a direct connection    |
| [011](011-memory-center-project-scoped-tasks.md)   | Memory Center, shipped with `project_id` Task scoping so it has real data                    |
| [012](012-log-center-derived-events.md)            | Log Center: derived events from persisted TimelineEvents/ModelAttempts, not a raw log viewer |
| [013](013-settings-local-desktop-configuration.md) | Settings: local Desktop configuration, Core stays stateless and config-free                  |
| [014](014-approval-center-human-in-the-loop.md)    | Approval Center: human-in-the-loop UI over CodexiaCore's Approval System, screen-scoped polling |
| [015](015-core-version-compatibility-check.md)     | Core version compatibility check: surfacing `/health`'s already-carried api/protocol versions |
| [016](016-approval-queue-desktop-controls.md)      | Approval queue desktop controls: Task Center checkbox, live countdown, Log Center approval source |
| [017](017-approval-awareness.md)                   | Approval awareness: sidebar badge + OS notification, fed by a background approval-watch loop |

New ADRs go here as `0NN-short-slug.md`, numbered sequentially, added to
this table.

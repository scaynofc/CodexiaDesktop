# Architecture Decision Records — Codexia Desktop

Same convention as CodexiaCore's `docs/adr/`: Title, Status, Context,
Decision, Alternatives Considered, Consequences. This is a separate
sequence (starts at 001) - Codexia Desktop is its own repository with its
own architectural history, distinct from CodexiaCore's ADRs (which cover
the Python runtime this app connects to).

| #                                            | Decision                                                             |
| -------------------------------------------- | -------------------------------------------------------------------- |
| [001](001-tauri-v2-over-electron.md)         | Tauri v2 + Rust + React over Electron                                |
| [002](002-zustand-over-react-query.md)       | Zustand fed by Tauri events, not a client-fetching library           |
| [003](003-layered-architecture.md)           | Presentation / Desktop Services / Core Bridge layering and its rules |
| [004](004-core-never-knows-about-desktop.md) | Core never knows about Desktop - dependency direction is one-way     |
| [005](005-connection-state-machine.md)       | Core Bridge connection state machine and restart detection           |
| [006](006-application-shell-navigation.md)   | Application Shell routing, nav manifest, disabled-vs-stub screens    |
| [007](007-task-center-polling-and-sse.md)    | Task Center: hand-rolled SSE, hybrid refresh, bounded resume retry   |

New ADRs go here as `0NN-short-slug.md`, numbered sequentially, added to
this table.

# ADR-013: Settings — Local Desktop Configuration, Not a Core Concept

**Status:** Accepted

## Context

Every phase through Log Center (Phase 9) assumed a developer running Core
and Desktop on the same machine: `services::default_core_base_url()`
hardcoded `http://127.0.0.1:8000`, no request ever carried a bearer token
even though `CoreHttpClient` had reserved a field for one since Phase 6
(`bearer_token: Option<String>`, explicitly commented "Reserved for Phase
11"), and Task Center's project id field was always blank unless a user
retyped it on every single task. None of that works once Core runs
anywhere other than localhost with no auth - the stated goal of this
phase ("make Codexia usable outside the developer machine").

CodexiaCore already supports everything this phase needs on the server
side: `require_auth`'s bearer-token check (a no-op until
`API_BEARER_TOKEN` is set) and `POST /tasks`'s `project_id` field
(Faz 43) both already exist and needed no Core change at all - this is a
pure Desktop-side wiring phase.

## Decision

**Settings is local to Desktop, persisted to disk on this machine only,
and Core is never told a concept of "settings" exists** - matching
ADR-003/ADR-004's dependency direction (Core never knows about Desktop).
A `Config` struct (`services::config.rs`) holds `core_url`,
`auth_token: Option<String>`, `default_project_id: Option<String>`, and
`debug_mode: bool`, serialized as pretty-printed JSON to
`{app_config_dir}/codexia_config.json` - Tauri's own
`app.path().app_config_dir()`, keyed off `tauri.conf.json`'s
`identifier` (`com.codexia.desktop`), not a hand-rolled per-OS path.

**`CoreHttpClient`'s `base_url`/`bearer_token` became `RwLock`-wrapped
interior state, mutated in place via a new `set_connection()` method**,
rather than the client being recreated and re-`app.manage()`'d on every
save (Tauri has no API to replace already-managed state). Every command
and the background connection-poll loop already hold the same
`Arc<CoreHttpClient>`; because `get_request`/`post_request`/
`delete_request` now read the locks fresh on every call, a Settings save
takes effect on the very next request app-wide - the poll loop
included - with no restart. A separate consuming builder,
`with_bearer_token()`, is used for two different one-shot constructions:
seeding the shared client at startup from the loaded config, and building
a throwaway client for "Test Connection" (see below).

**`GET /health`'s existing `require_auth` bypass (no token configured)
and 401 handling needed no new logic at all.** `BridgeError::
UnexpectedStatus(401)` already existed and every command already
propagates `BridgeError` as a plain string error the frontend's `error`
state already renders - the same path every other screen's connection
failures already go through. "Surface 401, don't retry, don't
auto-remove the token" was already this codebase's behavior for every
transport error before this phase; Settings needed zero special-casing
to inherit it.

**"Test Connection" never touches the live, shared `CoreHttpClient`.** A
new `test_connection` command builds a fresh, throwaway client
(`CoreHttpClient::new(core_url).with_bearer_token(auth_token)`) from
whatever is currently typed in the form - not yet saved - and calls
`get_health()` on it. This lets a user verify a URL/token pair before
committing to it without the app's real connection ever passing through
a half-tested state.

**One combined form, one `save_config` action - not `update_config`
(partial patch).** The spec this phase started from sketched per-section
save buttons and a partial-update function; in practice Settings has
exactly one form and one save action, so `save_config` always takes and
persists the whole `Config` object, mirroring every other "one action,
one full-object round trip" pattern already in this codebase (e.g.
Memory Center's `forget_and_refresh` returns the whole refreshed list,
never a diff). A partial-update command would be unused complexity this
phase's actual UI has no caller for.

**Task Center's project id field falls back to `config.default_project_id`
at submit time, shown as a placeholder (`"Project id (default: X)"`),
never pre-filled as the field's actual value.** Pre-filling the input
would need to survive a real timing race (Settings' config load hasn't
necessarily resolved before Task Center mounts); computing the fallback
only at submit time is simpler, always correct regardless of load
timing, and the placeholder still tells the user what will be used
without silently substituting something they can't see.

**`debug_mode` is persisted but currently inert - reserved, not wired to
any behavior**, the same "field now, teeth later" precedent
`CoreHttpClient.bearer_token` itself set in Phase 6. No debug-log gating,
verbosity toggle, or diagnostics surface exists anywhere in this codebase
today for it to control; inventing one just to make the checkbox "do
something" would be scope this phase's actual goal doesn't need.

**This phase is numbered 11, not 10, despite how it may be requested.**
Four independent references, written across four earlier phases
(`docs/adr/007`, `docs/adr/011`, `core_bridge/http.rs`,
`services/mod.rs`), already reserved "Phase 11" for Settings. Phase 10
was Approval Center's original slot (see ADR-003's original "Phases
6-8" framing, before Approval Center was deferred and Memory Center
shipped in its place) and remains unassigned/deferred, not this phase's
number to take.

## Alternatives Considered

- **Store settings in CodexiaCore** (a `/config` endpoint, a settings
  table) - rejected outright: violates ADR-004 in this repo (Core never
  knows about Desktop) and the explicit instruction this phase started
  from ("Core remains stateless"). CodexiaCore's own auth/URL are
  process-level concerns (env vars, `main()`'s host/port), not
  per-Desktop-install user preferences.
- **Recreate and re-`app.manage()` a new `CoreHttpClient` on every
  Settings save** - rejected: Tauri's managed state isn't designed to be
  replaced after `setup()`, and every already-spawned poll loop
  (`run_connection_loop`, `run_task_list_poll_loop`) holds its own
  `Arc<CoreHttpClient>` clone from startup - a new instance wouldn't
  reach them. Interior mutability on the existing shared instance was the
  only design where "no restart needed" (an explicit acceptance
  criterion) actually holds for every consumer at once, not just new
  commands.
- **`update_config(partial)` as the real save API, with the frontend
  sending only changed fields** - rejected as unused complexity: Settings
  has one form, one save button, and always has every field's current
  value in hand when it saves; a partial-patch API would exist for a
  caller that doesn't exist.
- **Pre-fill Task Center's project id input with the default (not just a
  placeholder)** - rejected: makes the "did the user type this or did we"
  distinction invisible in the DOM, and needs either a mount-time race
  workaround or a remount-on-load trick for correctness; a placeholder
  plus submit-time fallback gets the same effective behavior (the created
  task's `project_id`) with neither problem.
- **A dropdown/toggle for `debug_mode` doing something concrete right
  now** (e.g. verbose Rust logging, a devtools shortcut) - deferred, not
  rejected: a reasonable future addition, but inventing the behavior it
  gates wasn't part of this phase's actual scope, and this codebase
  already has precedent for landing a field ahead of its consumer.

## Consequences

- A user who saves an unreachable `core_url` (typo, wrong port) has no
  automatic recovery beyond re-opening Settings and fixing it - by
  design (this phase explicitly rules out any endpoint/auth-repair
  automation); the connection-status badge in the header will show
  `Disconnected` immediately, which is the existing, already-tested
  signal for this.
- `codexia_config.json` stores the bearer token in plain text on disk
  (Tauri's app-config directory, OS-file-permission-protected but not
  encrypted) - an explicit, accepted simplification (the phase's own
  non-goals rule out adding an encryption layer); anyone with filesystem
  access to this user account can read it, the same trust boundary every
  other local-first, single-user assumption in this codebase already
  operates under (ADR-008 in this repo).
- Every pre-Phase-11 CodexiaDesktop install has no `codexia_config.json`
  yet; `load_config_from` treats a missing file identically to a
  corrupted one - both fall back to `Config::default()` (today's
  hardcoded `127.0.0.1:8000`, no token) - so upgrading never blocks
  launch or silently breaks an existing setup.
- `debug_mode` remains a promise, not a feature, until something actually
  reads it - tracked here so a future phase wiring it up isn't
  rediscovering that it was already plumbed through Settings' form/store/
  persistence layer.

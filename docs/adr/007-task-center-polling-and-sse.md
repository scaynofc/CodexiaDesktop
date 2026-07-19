# ADR-007: Task Center — Hand-Rolled SSE, Hybrid Refresh, Bounded Resume Retry

**Status:** Accepted

## Context

Task Center (Phase 4) needed to list, create, watch, resume, and cancel
tasks against CodexiaCore's existing task API (`GET/POST /tasks`,
`GET /tasks/{id}`, `GET /tasks/{id}/events` SSE, `POST /tasks/{id}/resume`,
`POST /tasks/{id}/cancel`) - no CodexiaCore changes were needed. This is the
first real consumer of SSE, deliberately deferred since Phase 2
(`core_bridge/mod.rs`'s docstring named Task Center as the expected first
consumer).

Research into CodexiaCore's actual implementation (`api/sse.py`,
`api/task_runner.py`, `models/task.py`) surfaced two correctness risks not
obvious from the API surface alone:

1. `CoreHttpClient`'s shared `reqwest::Client` has a blanket 5s timeout
   (`core_bridge/http.rs`) - reusing it for the SSE GET would kill that
   connection after 5s, always, before even a slow first event arrives.
2. `BLOCKED` is a **stream-terminal** state server-side
   (`api/sse.py`'s `TERMINAL_STATES` includes `BLOCKED`), so resuming a task
   requires re-opening its SSE watch, not just refreshing the list - and
   re-opening immediately after resume races the background resume
   actually starting server-side.

## Decision

**Hand-rolled SSE client (`core_bridge/sse.rs`), no new Cargo dependency.**
`reqwest::Response::chunk()` needs no feature flag (unlike `bytes_stream()`,
which needs `stream`); CodexiaCore's own SSE encoder (`api/sse.py`'s
`format_sse`) only ever emits `event:`/`data:` lines, a closed subset fully
controlled by the same repo, not the general SSE spec - a hand-rolled
`chunk()`-and-buffer loop covers it completely. `parse_task_event` is a
pure function (event name + data -> `TaskEvent`), fully unit-tested with no
I/O, mirroring `next_status`'s treatment in `services::connection`.

**The SSE GET uses a per-request 330s timeout**, not `CoreHttpClient`'s
blanket 5s client timeout - comfortably above CodexiaCore's own 300s
server-side wait budget, so the _server's_ `timeout` event fires first and
the client sees a clean SSE `Timeout`, not a transport-level error killing
the stream early.

**`background: true` is hardcoded in `core_bridge::tasks`, never a
caller-exposed parameter.** CodexiaCore's synchronous (`background: false`)
path blocks the HTTP request until the entire task finishes - a GUI must
never trigger it. The response is therefore always `TaskCreated { task_id }`,
never a full `Task` body.

**Task list refresh is hybrid**: discrete triggers (initial load, after any
create/resume/cancel action, when a watched task's stream ends) **plus** a
5s periodic safety-net poll, gated on `services::connection`'s
`SharedConnectionStatus` being `Connected` (a read-only cross-module
dependency within Desktop Services, injected explicitly through `lib.rs`,
not a layering violation - ADR-003 assigns "is Core reachable" and "polling
cadence" to Desktop Services as a layer, not to any one file in it). The
periodic part is a deliberate addition beyond CodexiaCore's own reference
dashboard (`static/dashboard.html`, manual-refresh-only): tasks can also
appear via CodexiaCore's `/hooks/{id}` webhook endpoint or a concurrent CLI
session, which this app has no event-based way to learn about. The loop
itself reuses `run_supervised` (Phase 2/3's hardening) rather than
reimplementing supervision.

**The per-task SSE watch is deliberately NOT wrapped in `run_supervised`.**
It's naturally bounded (ends at a terminal state or Core's own ~300s
timeout) and is recreated fresh every time the user selects a task, so a
panic there degrades to "this one task's live view stops a bit early," not
a silent-forever failure. This safety property depends on strict Mutex
discipline: all parsing/serde happens before any lock is acquired, and the
locked critical section is a bare assignment - a panic while a lock is
_held_ would poison it, wedging the supervised list-poll loop too.

**Resume race fixed with a bounded retry, not a fixed delay.** After
`resume_task` succeeds, the watch is reopened; a pure decision function,
`should_retry_after_blocked`, distinguishes "the resume hasn't taken effect
on the server yet" (retry, up to 3 attempts, ~600ms apart) from "the user
is just looking at a task that's genuinely still blocked" (never retry) by
requiring _both_ that retries were available in the first place (only true
when triggered by `resume_task_and_rewatch`, never by a plain
`start_watching_task` selection, which always starts with exactly one
attempt) _and_ that the state was `Blocked` both immediately before this
watch attempt and when the stream ended.

## Alternatives Considered

- **`reqwest-eventsource`** - rejected. It auto-reconnects by design
  (`EventSource::close()` is the only way to stop it retrying), which
  actively fights a server that deliberately, intentionally closes the
  connection on every terminal event (`done`/`error`/`timeout`). Matches
  this project's existing bias toward hand-rolling something this small
  over adopting a crate whose defaults don't fit (see the `Backoff` struct
  precedent in `docs/adr/005-connection-state-machine.md`).
- **A fixed delay before reopening the watch after resume, with no
  retry-on-still-blocked check** - rejected. `resume()`/`aresume()` return
  immediately after spawning a fire-and-forget background task, with no
  synchronization guaranteeing the task's state has actually changed by any
  particular deadline; a fixed delay is a guess that can still race under
  load or provider latency. A bounded retry that checks the actual outcome
  is deterministic instead of timing-dependent.
- **Supervising the per-task watch like the list-poll loop** - rejected.
  Its natural boundedness and per-selection recreation already contain a
  panic's blast radius to "this one task's view," and wrapping it would
  paper over exactly the state-poisoning risk that must instead be avoided
  by discipline (compute before lock, infallible critical section).

## Post-acceptance: real verification against a live Ollama-backed Core

This phase's own end-to-end verification was blocked in its first pass -
no LLM provider was configured, so no task could actually progress past
planning. A follow-up real-provider verification session (real Ollama,
`qwen2.5:7b`) ran the full create → running → blocked → resume → done and
create → running → cancel → cancelled flows against a genuinely live
Core, and found two real bugs neither the unit-test suite nor the earlier
manual pass could have caught:

1. **CodexiaCore**: every `background: true` task silently failed to
   persist at all (`sqlite3.ProgrammingError: SQLite objects created in a
thread can only be used in that same thread`) - `get_orchestrator()`/
   `get_engine()` are sync FastAPI dependencies, so lazily constructing
   their `Sqlite*Store`s runs on a threadpool worker thread, but
   `BackgroundTaskRunner`'s `asyncio.create_task()`-driven execution (and
   the SSE endpoint's polling) runs on the main event loop thread - a
   different thread. Fixed CodexiaCore-side (`check_same_thread=False`,
   matching an already-established precedent in that codebase,
   `health/tool_stats_store.py`) across every `Sqlite*Store` reachable
   from `Engine`'s default construction, not just the task store - the
   same mismatch affected all of them. Not a Desktop bug, but Task Center
   could not function at all until it was fixed.
2. **CodexiaDesktop**: selecting any task crashed the entire application
   (`there is no reactor running` -> an unwind-across-FFI abort). The
   `watch_task` command was a plain sync `fn`, but
   `start_watching_task` calls plain `tokio::spawn` internally (see
   "The per-task SSE watch is deliberately NOT wrapped in
   `run_supervised`" above) - which needs an ambient Tokio reactor, and a
   sync Tauri command runs on a bare OS thread with none. Fixed by making
   `watch_task` `async fn`, matching its sibling action commands - Tauri
   only guarantees a Tokio-backed context for async commands.

Both fixes were verified with their own regression coverage (a real
cross-thread SQLite test in CodexiaCore; the existing Rust/TS suites
re-run clean in Desktop) and then re-confirmed live: the full
create/watch/resume/cancel cycle, and a real batch of 11 tasks rendering
correctly in the actual running app.

## Consequences

- No CodexiaCore _API_ changes were needed for this phase - the existing
  REST/SSE surface was already sufficient. A CodexiaCore _bug fix_ (above)
  was needed before that surface actually worked under real background
  execution, which is a different thing from needing new API surface.
- Every Task Center action (create/resume/cancel) is a two-step Desktop
  Services function: call Core Bridge, then refresh the list - the same
  shape every time, easy to extend if a future action is added.
- The `TaskLister` trait (mirroring `HealthProbe`) means `refresh_task_list`
  and the gating/retry decision functions are fully unit-tested with
  scripted fakes and zero real HTTP; one real-`TcpListener` test (mirroring
  `core_bridge/http.rs`'s connection-refused test) covers the one property
  neither a scripted fake nor the pure parser can: that a real TCP read
  splitting an SSE block mid-line still reassembles correctly.
- `CoreHttpClient` carries an unused `Option<String>` bearer-token field
  today (CodexiaCore's `api_bearer_token` is off by default) - Phase 11
  (Settings) can wire real auth through without changing any method
  signature added in this phase.

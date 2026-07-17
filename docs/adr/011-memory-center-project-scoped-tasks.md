# ADR-011: Memory Center — Shipped Together With `project_id` Task Scoping

**Status:** Accepted

## Context

Phase 8 builds Memory Center: browsing and forgetting CodexiaCore's
governed project-memory items (Faz 11 there - versioned facts/patterns/
strategies/errors distilled from completed tasks). Unlike Timeline/
Provider Center/Runtime Center, research before writing any code found
that a read/delete-only screen would have been hollow: CodexiaCore's
`Engine.project_id` was fixed at `Engine.__init__` time, `api/app.py`'s
`get_engine()` built exactly one process-wide `Engine()` with no project,
and `POST /tasks` had no `project_id` field at all - meaning **no task
ever created through Task Center could write to project memory**,
regardless of what a browsing UI could show. This environment's
`project_memory.sqlite3` had zero rows to prove it.

## Decision

**This phase shipped both halves together**: CodexiaCore's own ADR-014
(project-id-keyed `Engine`/`Orchestrator` caches, `project_id` persisted
on `Task`, `POST /tasks` gaining the field, `POST /tasks/{id}/resume`
reading it back off the task rather than accepting a fresh one) plus
Desktop's read/delete UI over the result. Building only the browsing
endpoint would have shipped a screen with no real, live-growing data
behind it for any Desktop user - the same "hollow feature" concern that
led to deferring Approval Center entirely rather than shipping a
non-functional one (see the discussion that produced ADR-010's neighbor
decision).

**Task Center's create-task form gained an optional "Project id" text
input.** `taskStore.createTask` now takes a fifth, optional `projectId`
argument; a blank/whitespace-only value sends `null` (project memory
disabled, unchanged default), never an empty string. `core_bridge::tasks`'s
`Task` struct gained `project_id: Option<String>` (`#[serde(default)]`,
since older CodexiaCore versions predate the field entirely) and
`CreateTaskRequest` gained `project_id: Option<&str>` with
`#[serde(skip_serializing_if = "Option::is_none")]`, so a Desktop build
talking to a pre-Faz-43 Core still sends exactly the same request shape
it always did.

**Memory Center has no shared "current project" concept with Task
Center.** It's a standalone text input the user types a project id into
to browse - not a dropdown of "known projects" (no such listing endpoint
exists; a project id is just a free-form string tasks happen to share,
same as CodexiaCore's own model), and not synced with whatever project id
was last used to create a task. A user who wants to inspect what a task
learned types the same id they used when creating it, matching the CLI's
own `--project`/`--memory-list` being two separate invocations with no
implicit state between them.

**`core_bridge::memory`'s `MemoryItem` omits the `embedding` field.**
`GET /projects/{id}/memory` returns CodexiaCore's full `MemoryItem`
(including the search embedding vector), but Desktop never renders or
acts on it - serde silently ignores an unmapped JSON field on
deserialize, so leaving it out of the Rust struct is sufficient; no
CodexiaCore change needed to avoid the wasted parse/memory cost of a
real-sized float vector per item.

**`project_id`/`key` path segments are percent-encoded before being
formatted into a URL**, a first for this app - every other path parameter
built so far (`task_id`) is always a UUID hex string with no unsafe
characters. Hand-rolled (RFC 3986 unreserved-character encoding, ~10
lines) rather than adding a URL-encoding crate, matching this project's
established bias (`core_bridge::sse`'s hand-rolled parser) toward
hand-rolling something this small over a new dependency.

**`services::memory` is one-shot, no poll loop** - identical reasoning to
`services::metrics`/`services::runtime`: memory only changes as a side
effect of a task running or an explicit forget, so there is no
independent-of-Desktop event source to poll for.

## Alternatives Considered

- **Ship only the browsing/forget endpoints, leave `project_id` task
  scoping for later** - rejected for the same reason Approval Center was
  deferred rather than shipped hollow: a screen with structurally-
  guaranteed-empty data for any Desktop-originated task is not a real
  feature. Unlike Approval Center, though, the fix here was genuinely
  local and controlled (an existing, CLI-proven feature needing only its
  API boundary wired), which is exactly why this phase proceeded rather
  than deferring the way Approval Center did.
- **A shared "active project" global setting, applied automatically to
  every new task and remembered by Memory Center** - deferred, not
  rejected outright: a real usability improvement, but a new piece of
  cross-screen state (where does it live - a store? Tauri's persisted
  settings, not built until Phase 11?) that isn't needed for this phase's
  core capability (browse what a task learned) to work. A future Settings
  phase is a more natural home for "remember my last project id" than
  inventing ad-hoc persistence here.
- **A dropdown of known project ids instead of a free-text input** -
  rejected: no CodexiaCore endpoint lists distinct project ids in use
  (project memory is keyed by an opaque string with no registry), so a
  dropdown would need new CodexiaCore surface area for a convenience this
  phase doesn't require.

## Consequences

- A user must know/remember the project id they used when creating a
  task to browse its memory later - a real usability gap this ADR
  explicitly defers (see "active project" setting above), not an
  oversight.
- Every pre-Faz-43 CodexiaCore instance (no `project_id` on `Task`, no
  `/projects/{id}/memory` endpoints) still works with this Desktop build:
  `Task.project_id` deserializes via `#[serde(default)]`, and
  `CreateTaskRequest` omits `project_id` entirely when unset. Memory
  Center itself would simply 404/error against such a Core if used - an
  acceptable degradation, not a crash, for a feature that genuinely
  doesn't exist server-side yet.
- If Approval Center is ever built (its own future, larger decision), it
  will very likely want the same "don't ship the UI until the underlying
  Core capability can produce real data" discipline this phase
  established.

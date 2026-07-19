# ADR-019: Task Delegation Visibility

**Status:** Accepted

## Context

CodexiaCore's Faz 21 gave every `Task` real delegation fields -
`parent_task_id`, `delegation_depth`, `forced_role` - a root task's step
can spawn a genuine child `Task` (a separate row, its own steps, its own
lifecycle) rather than just recording a note about it. `core_bridge::
tasks::Task` (Rust) and `taskStore.ts`'s `Task` interface have carried
these three fields since they were first wired through - `GET /tasks`
already returns them on every row - but Task Center's `Tasks.tsx` never
read them: a child task rendered as an unrelated flat row in the list,
indistinguishable from any other task, with no indication it was spawned
by another task or what role it was forced to run as. Same "already
works, but invisible" shape as `enable_approval_queue` before Phase 10
and `max_task_cost_usd` before this repo's own ADR-018 - flagged during a
roundup of remaining gaps once Wave 2 (Approval Center's SSE/badge/
notification, approval history, cost budget visibility) shipped.

Unlike those two, this gap needed **zero CodexiaCore change** - the data
was already present on every task Desktop already fetches; only Desktop's
own rendering was missing.

## Decision

**A new pure function, `lib/taskTree.ts`'s `buildTaskTree(tasks)`**,
orders the task list so a child renders immediately under its parent
(recursively, so a grandchild nests under its own parent, not the root),
newest-first at every level - the same ordering Task Center's flat list
already used, just regrouped. Returns `{task, depth}[]`; `Tasks.tsx`
indents each list row by `depth * 16 + 10` px and prefixes nested rows
with a small `↳` marker. A task whose `parent_task_id` doesn't match any
task in the current snapshot is rendered as its own root rather than
dropped - losing a task from the list would be a worse failure mode than
one wrongly-un-nested row.

**`TaskDetail` gains three additions**, all computed by scanning the
already-fetched `tasks` list (no new store field, no new fetch):
- A `Role: {forced_role}` badge next to the state badge, when set.
- A "Delegated from: {parent goal}" line, linking to the parent task
  (falls back to "a task not in the current list" if the parent was
  since pruned - the same defensive framing as the tree-building
  function).
- A "Subtasks (N)" section listing every task whose `parent_task_id`
  matches this one, each clickable to jump straight to it.

## Alternatives Considered

- **A dedicated `GET /tasks/{id}/children` endpoint** - rejected:
  `GET /tasks` already returns every task's `parent_task_id` on every
  poll; a second round trip would fetch data Desktop already has in
  memory.
- **A tree/nested data structure in `taskStore.ts` instead of a flat
  array plus a derived-ordering function** - rejected: `tasks-changed`
  events already deliver a flat array matching CodexiaCore's own
  `GET /tasks` shape; reshaping the store's own data model would ripple
  into every other consumer (Timeline's `deriveTimelineEntries`, the
  Log Center, the sidebar badge) for a benefit only Task Center's list
  needs. A pure derive-at-render function, exactly like
  `deriveTimelineEntries` (ADR-008), keeps the store dumb.
- **Showing delegation depth as a number instead of visual indentation**
  - rejected: indentation reads at a glance; a bare "depth: 2" next to an
    otherwise-identical flat row doesn't communicate the parent/child
    relationship as directly.
- **Expand/collapse per node** - considered during completion review, not
  built: the tree always renders fully expanded, with no toggle to hide a
  subtree. At this repo's accepted scale (single-user, local-first,
  realistically a handful of delegated children per task, not the deep
  hierarchies a project-management tool would need), a fully-expanded
  list stays readable without one - the same "don't build for a scale
  this app doesn't have" reasoning as the `O(tasks)` scan below. A real
  gap if delegation trees ever grow large in practice, deliberately
  deferred rather than built speculatively.

## Consequences

- Purely additive, Desktop-only - no CodexiaCore or Core Bridge change,
  no new IPC command, no new test surface on the Rust side.
- The parent-lookup and children-list in `TaskDetail` are both `O(tasks)`
  scans, run on every render - an accepted tradeoff at this repo's scale
  (single-user, local-first, realistically dozens of tasks per session,
  not thousands - matching CodexiaCore's own ADR-008 single-user-scope
  reasoning) rather than pre-indexing into a `Map`.
- 10 new tests (7 for `buildTaskTree`'s ordering/nesting/orphan-handling
  in `lib/taskTree.test.ts`, 3 for the screen-level wiring - indentation,
  parent link, subtasks list - in `Tasks.test.tsx`) - full suite (225
  tests) passing, ESLint/tsc/prettier clean.
- **Live-verified with a real 5-node, 3-level tree** (Parent with three
  children, one of which had its own child, plus a fifth node inserted
  live via CodexiaCore's real `TaskStore` while the app kept running):
  confirmed nesting is depth-correct (a grandchild nests under its actual
  parent, not the root), every state badge and `forced_role` renders
  correctly, `TaskDetail`'s "Subtasks" list shows only direct children
  (a parent's grandchild never leaks into its own subtask list),
  "Delegated from" resolves to the immediate parent at every level (not
  always the root), the live-inserted node appeared correctly nested
  within one background poll cycle with no manual refresh, and the
  previously-selected task's detail pane survived that poll intact. Zero
  console errors throughout.

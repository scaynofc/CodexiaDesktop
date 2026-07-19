import type { Task } from "@/stores/taskStore";

export interface TaskTreeEntry {
  task: Task;
  depth: number;
}

/**
 * Orders tasks for Task Center's list: each task immediately followed by
 * its own children (recursively), newest-first at every level - so a
 * delegated child task (CodexiaCore's Faz 21 `parent_task_id`) renders
 * nested under the task that spawned it instead of as an unrelated flat
 * row. See docs/adr/019-task-delegation-visibility.md.
 *
 * A task whose `parent_task_id` doesn't match any task in this snapshot
 * (already pruned, or simply not loaded) is rendered as its own root
 * rather than silently dropped - losing a task from the list entirely
 * would be worse than one wrongly-un-nested row.
 */
export function buildTaskTree(tasks: readonly Task[]): TaskTreeEntry[] {
  const knownIds = new Set(tasks.map((candidate) => candidate.id));
  const childrenByParent = new Map<string, Task[]>();

  for (const task of tasks) {
    if (task.parent_task_id === null || !knownIds.has(task.parent_task_id)) continue;
    const siblings = childrenByParent.get(task.parent_task_id) ?? [];
    siblings.push(task);
    childrenByParent.set(task.parent_task_id, siblings);
  }

  const roots = tasks.filter(
    (task) => task.parent_task_id === null || !knownIds.has(task.parent_task_id),
  );

  const entries: TaskTreeEntry[] = [];
  function walk(level: readonly Task[], depth: number) {
    for (const task of [...level].reverse()) {
      entries.push({ task, depth });
      const children = childrenByParent.get(task.id);
      if (children) walk(children, depth + 1);
    }
  }
  walk(roots, 0);

  return entries;
}

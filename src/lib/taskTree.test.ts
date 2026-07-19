import { describe, expect, it } from "vitest";
import { buildTaskTree } from "./taskTree";
import type { Task } from "@/stores/taskStore";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    goal: `Goal for ${id}`,
    state: "running",
    steps: [],
    error: null,
    created_at: "2026-07-16T00:00:00+00:00",
    updated_at: "2026-07-16T00:00:00+00:00",
    validation_usage: null,
    plan_revisions: 0,
    parent_task_id: null,
    delegation_depth: 0,
    forced_role: null,
    simulated: false,
    project_id: null,
    ...overrides,
  };
}

describe("buildTaskTree", () => {
  it("returns every root task at depth 0, newest first", () => {
    const entries = buildTaskTree([task("t1"), task("t2")]);

    expect(entries).toEqual([
      { task: task("t2"), depth: 0 },
      { task: task("t1"), depth: 0 },
    ]);
  });

  it("nests a child immediately under its parent at depth 1", () => {
    const parent = task("parent");
    const child = task("child", { parent_task_id: "parent", delegation_depth: 1 });

    const entries = buildTaskTree([parent, child]);

    expect(entries.map((entry) => [entry.task.id, entry.depth])).toEqual([
      ["parent", 0],
      ["child", 1],
    ]);
  });

  it("nests grandchildren at depth 2 under their own parent, not the root", () => {
    const root = task("root");
    const child = task("child", { parent_task_id: "root", delegation_depth: 1 });
    const grandchild = task("grandchild", { parent_task_id: "child", delegation_depth: 2 });

    const entries = buildTaskTree([root, child, grandchild]);

    expect(entries.map((entry) => [entry.task.id, entry.depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["grandchild", 2],
    ]);
  });

  it("keeps children grouped under their parent even when unrelated tasks are interleaved", () => {
    const entries = buildTaskTree([
      task("unrelated-1"),
      task("parent"),
      task("child", { parent_task_id: "parent" }),
      task("unrelated-2"),
    ]);

    expect(entries.map((entry) => entry.task.id)).toEqual([
      "unrelated-2",
      "parent",
      "child",
      "unrelated-1",
    ]);
  });

  it("treats a task whose parent_task_id isn't in this snapshot as its own root, not dropped", () => {
    const entries = buildTaskTree([task("orphan", { parent_task_id: "missing-parent" })]);

    expect(entries).toEqual([
      { task: task("orphan", { parent_task_id: "missing-parent" }), depth: 0 },
    ]);
  });

  it("orders multiple children of the same parent newest first", () => {
    const parent = task("parent");
    const childA = task("child-a", { parent_task_id: "parent" });
    const childB = task("child-b", { parent_task_id: "parent" });

    const entries = buildTaskTree([parent, childA, childB]);

    expect(entries.map((entry) => entry.task.id)).toEqual(["parent", "child-b", "child-a"]);
  });

  it("returns an empty list for no tasks", () => {
    expect(buildTaskTree([])).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTaskStoreForTests, useTaskStore, type Task } from "./taskStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    goal: "goal",
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

type ListenCallback<T> = (event: { payload: T }) => void;

beforeEach(() => {
  __resetTaskStoreForTests();
  useTaskStore.setState({ tasks: [], watchedTask: null, selectedTaskId: null });
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockResolvedValue([]);
  listenMock.mockResolvedValue(() => {});
});

describe("useTaskStore", () => {
  it("fetches the initial task list via get_tasks on init", async () => {
    invokeMock.mockResolvedValueOnce([task("t1")]);

    await useTaskStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith("get_tasks");
    expect(useTaskStore.getState().tasks).toEqual([task("t1")]);
  });

  it("subscribes to tasks-changed and task-detail-changed exactly once even if init is called multiple times", async () => {
    await Promise.all([
      useTaskStore.getState().init(),
      useTaskStore.getState().init(),
      useTaskStore.getState().init(),
    ]);

    expect(listenMock).toHaveBeenCalledTimes(2);
    expect(listenMock).toHaveBeenCalledWith("tasks-changed", expect.any(Function));
    expect(listenMock).toHaveBeenCalledWith("task-detail-changed", expect.any(Function));
  });

  it("updates the task list when tasks-changed fires", async () => {
    let emitTasksChanged: ListenCallback<Task[]> | undefined;
    listenMock.mockImplementation((eventName: string, callback: ListenCallback<unknown>) => {
      if (eventName === "tasks-changed") emitTasksChanged = callback as ListenCallback<Task[]>;
      return Promise.resolve(() => {});
    });

    await useTaskStore.getState().init();
    emitTasksChanged?.({ payload: [task("t1"), task("t2")] });

    expect(useTaskStore.getState().tasks).toHaveLength(2);
  });

  it("applies a task-detail-changed event only when it matches the selected task", async () => {
    let emitDetailChanged: ListenCallback<Task> | undefined;
    listenMock.mockImplementation((eventName: string, callback: ListenCallback<unknown>) => {
      if (eventName === "task-detail-changed") emitDetailChanged = callback as ListenCallback<Task>;
      return Promise.resolve(() => {});
    });

    await useTaskStore.getState().init();
    useTaskStore.setState({ selectedTaskId: "t1" });

    // A stale event for a task the user has since navigated away from.
    emitDetailChanged?.({ payload: task("t2", { state: "done" }) });
    expect(useTaskStore.getState().watchedTask).toBeNull();

    // The event for the currently-selected task is applied.
    emitDetailChanged?.({ payload: task("t1", { state: "blocked" }) });
    expect(useTaskStore.getState().watchedTask?.state).toBe("blocked");
  });

  it("selectTask sets the selection, clears the previous detail, and starts watching", async () => {
    useTaskStore.setState({ watchedTask: task("old") });

    await useTaskStore.getState().selectTask("t1");

    expect(useTaskStore.getState().selectedTaskId).toBe("t1");
    expect(useTaskStore.getState().watchedTask).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("watch_task", { taskId: "t1" });
  });

  it("createTask forwards the right arguments and selects the newly created task", async () => {
    invokeMock.mockResolvedValueOnce({ task_id: "new-task" });

    const created = await useTaskStore.getState().createTask("do something", true, false);

    expect(invokeMock).toHaveBeenCalledWith("create_task", {
      goal: "do something",
      requireApproval: true,
      simulate: false,
      projectId: null,
      enableApprovalQueue: false,
    });
    expect(created.task_id).toBe("new-task");
    expect(useTaskStore.getState().selectedTaskId).toBe("new-task");
  });

  it("createTask forwards enableApprovalQueue when given", async () => {
    invokeMock.mockResolvedValueOnce({ task_id: "new-task" });

    await useTaskStore.getState().createTask("do something", false, false, undefined, true);

    expect(invokeMock).toHaveBeenCalledWith(
      "create_task",
      expect.objectContaining({ enableApprovalQueue: true }),
    );
  });

  it("createTask trims and forwards a project id when given", async () => {
    invokeMock.mockResolvedValueOnce({ task_id: "new-task" });

    await useTaskStore.getState().createTask("do something", false, false, "  proj-1  ");

    expect(invokeMock).toHaveBeenCalledWith(
      "create_task",
      expect.objectContaining({ projectId: "proj-1" }),
    );
  });

  it("createTask sends null for a blank/whitespace-only project id", async () => {
    invokeMock.mockResolvedValueOnce({ task_id: "new-task" });

    await useTaskStore.getState().createTask("do something", false, false, "   ");

    expect(invokeMock).toHaveBeenCalledWith(
      "create_task",
      expect.objectContaining({ projectId: null }),
    );
  });

  it("resumeTask and cancelTask invoke the matching commands", async () => {
    await useTaskStore.getState().resumeTask("t1");
    expect(invokeMock).toHaveBeenCalledWith("resume_task", { taskId: "t1" });

    await useTaskStore.getState().cancelTask("t1");
    expect(invokeMock).toHaveBeenCalledWith("cancel_task", { taskId: "t1" });
  });

  it("refreshTasks fetches and applies the latest list", async () => {
    invokeMock.mockResolvedValueOnce([task("t1")]);

    await useTaskStore.getState().refreshTasks();

    expect(invokeMock).toHaveBeenCalledWith("refresh_tasks");
    expect(useTaskStore.getState().tasks).toEqual([task("t1")]);
  });
});

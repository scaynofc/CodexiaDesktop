import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Timeline from "./Timeline";
import { __resetTaskStoreForTests, useTaskStore, type Task } from "@/stores/taskStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

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
    ...overrides,
  };
}

beforeEach(() => {
  __resetTaskStoreForTests();
  useTaskStore.setState({ tasks: [], watchedTask: null, selectedTaskId: null });
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockResolvedValue([]);
  listenMock.mockResolvedValue(() => {});
});

describe("Timeline", () => {
  it("shows a placeholder when no task has recorded any events yet", async () => {
    render(<Timeline />);

    await waitFor(() =>
      expect(
        screen.getByText("No activity yet. Events appear here once a task starts running."),
      ).toBeInTheDocument(),
    );
  });

  it("fetches tasks on mount, same as Task Center", async () => {
    render(<Timeline />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_tasks"));
  });

  it("renders events across tasks newest first, with task/step context", async () => {
    invokeMock.mockResolvedValueOnce([
      task("t1", {
        goal: "Write a haiku",
        steps: [
          {
            number: 1,
            description: "Draft it",
            state: "done",
            result: null,
            error: null,
            usage: null,
            reflection_attempts: 0,
            critique: null,
            depends_on: [],
            team: null,
            events: [
              { timestamp: "2026-07-16T00:00:00+00:00", kind: "step_started", detail: "" },
              { timestamp: "2026-07-16T00:00:05+00:00", kind: "step_done", detail: "ok" },
            ],
          },
        ],
      }),
      task("t2", {
        goal: "Summarize the README",
        steps: [
          {
            number: 1,
            description: "Read it",
            state: "failed",
            result: null,
            error: "boom",
            usage: null,
            reflection_attempts: 0,
            critique: null,
            depends_on: [],
            team: null,
            events: [
              { timestamp: "2026-07-16T00:00:03+00:00", kind: "step_failed", detail: "boom" },
            ],
          },
        ],
      }),
    ]);

    render(<Timeline />);

    await waitFor(() => expect(screen.getByText("Step done")).toBeInTheDocument());

    const kinds = screen.getAllByText(/Step (started|done|failed)/).map((node) => node.textContent);
    expect(kinds).toEqual(["Step done", "Step failed", "Step started"]);
    // t1 contributes two entries (step_started, step_done), so its goal
    // appears once per row, not deduplicated across entries.
    expect(screen.getAllByText("Write a haiku")).toHaveLength(2);
    expect(screen.getByText("Summarize the README")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("overlays the actively-watched task's events over the polled list", async () => {
    useTaskStore.setState({
      tasks: [task("t1", { steps: [] })],
      watchedTask: task("t1", {
        steps: [
          {
            number: 1,
            description: "Draft it",
            state: "running",
            result: null,
            error: null,
            usage: null,
            reflection_attempts: 0,
            critique: null,
            depends_on: [],
            team: null,
            events: [{ timestamp: "2026-07-16T00:00:00+00:00", kind: "step_started", detail: "" }],
          },
        ],
      }),
      selectedTaskId: "t1",
    });

    render(<Timeline />);

    await waitFor(() => expect(screen.getByText("Step started")).toBeInTheDocument());
  });
});

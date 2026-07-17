import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Tasks from "./Tasks";
import { useSettingsStore, type Config } from "@/stores/settingsStore";
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
    project_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  __resetTaskStoreForTests();
  useTaskStore.setState({ tasks: [], watchedTask: null, selectedTaskId: null });
  useSettingsStore.setState({
    config: null,
    fetchState: "idle",
    error: null,
    testState: "idle",
    testError: null,
  });
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockResolvedValue([]);
  listenMock.mockResolvedValue(() => {});
});

describe("Tasks", () => {
  it("shows a placeholder when there are no tasks yet", async () => {
    render(<Tasks />);

    await waitFor(() => expect(screen.getByText("No tasks yet.")).toBeInTheDocument());
    expect(screen.getByText("Select a task to see its details.")).toBeInTheDocument();
  });

  it("lists fetched tasks with their state badges", async () => {
    invokeMock.mockResolvedValueOnce([task("t1", { state: "blocked" }), task("t2")]);

    render(<Tasks />);

    await waitFor(() => expect(screen.getByText("Goal for t1")).toBeInTheDocument());
    expect(screen.getByText("Goal for t2")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
  });

  it("selecting a task starts watching it and shows its detail once watched", async () => {
    invokeMock.mockResolvedValueOnce([task("t1", { goal: "Write docs" })]);
    let emitDetailChanged: ((event: { payload: Task }) => void) | undefined;
    listenMock.mockImplementation((eventName: string, callback: (event: unknown) => void) => {
      if (eventName === "task-detail-changed") {
        emitDetailChanged = callback as (event: { payload: Task }) => void;
      }
      return Promise.resolve(() => {});
    });

    render(<Tasks />);
    await waitFor(() => expect(screen.getByText("Write docs")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Write docs"));

    expect(invokeMock).toHaveBeenCalledWith("watch_task", { taskId: "t1" });

    emitDetailChanged?.({ payload: task("t1", { goal: "Write docs", state: "running" }) });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Write docs" })).toBeInTheDocument(),
    );
  });

  it("shows a Resume button for a blocked task and calls resume_task", async () => {
    useTaskStore.setState({
      tasks: [task("t1", { state: "blocked" })],
      selectedTaskId: "t1",
      watchedTask: task("t1", { state: "blocked" }),
    });

    render(<Tasks />);

    const resumeButton = screen.getByRole("button", { name: "Resume" });
    fireEvent.click(resumeButton);

    expect(invokeMock).toHaveBeenCalledWith("resume_task", { taskId: "t1" });
  });

  it("shows a Cancel button for a running task and calls cancel_task", async () => {
    useTaskStore.setState({
      tasks: [task("t1", { state: "running" })],
      selectedTaskId: "t1",
      watchedTask: task("t1", { state: "running" }),
    });

    render(<Tasks />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);

    expect(invokeMock).toHaveBeenCalledWith("cancel_task", { taskId: "t1" });
  });

  it("shows neither action button for a done task", () => {
    useTaskStore.setState({
      tasks: [task("t1", { state: "done" })],
      selectedTaskId: "t1",
      watchedTask: task("t1", { state: "done" }),
    });

    render(<Tasks />);

    expect(screen.queryByRole("button", { name: "Resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("submits the new task form with the goal and checkbox values", async () => {
    invokeMock.mockResolvedValueOnce([]); // get_tasks on mount
    invokeMock.mockResolvedValueOnce({ task_id: "new-1" }); // create_task

    render(<Tasks />);

    const textarea = screen.getByPlaceholderText("Describe a goal for Codexia to work on...");
    fireEvent.change(textarea, { target: { value: "Write a haiku" } });
    fireEvent.click(screen.getByLabelText("Require approval before running"));
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("create_task", {
        goal: "Write a haiku",
        requireApproval: true,
        simulate: false,
        projectId: null,
      }),
    );
  });

  it("submits a trimmed project id when the field is filled in", async () => {
    invokeMock.mockResolvedValueOnce([]); // get_tasks on mount
    invokeMock.mockResolvedValueOnce({ task_id: "new-1" }); // create_task

    render(<Tasks />);

    fireEvent.change(screen.getByPlaceholderText("Describe a goal for Codexia to work on..."), {
      target: { value: "Write a haiku" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Project id (optional - enables project memory)"),
      {
        target: { value: "  proj-1  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ projectId: "proj-1" }),
      ),
    );
  });

  it("does not submit the new task form with an empty goal", () => {
    render(<Tasks />);

    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(invokeMock).not.toHaveBeenCalledWith("create_task", expect.anything());
  });

  it("shows Settings' default project id in the placeholder and applies it when the field is left blank", async () => {
    useSettingsStore.setState({
      config: {
        core_url: "http://127.0.0.1:8000",
        auth_token: null,
        default_project_id: "default-proj",
        debug_mode: false,
      } satisfies Config,
    });
    invokeMock.mockResolvedValueOnce([]); // get_tasks on mount
    invokeMock.mockResolvedValueOnce({ task_id: "new-1" }); // create_task

    render(<Tasks />);

    expect(screen.getByPlaceholderText("Project id (default: default-proj)")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Describe a goal for Codexia to work on..."), {
      target: { value: "Write a haiku" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ projectId: "default-proj" }),
      ),
    );
  });

  it("prefers an explicitly typed project id over Settings' default", async () => {
    useSettingsStore.setState({
      config: {
        core_url: "http://127.0.0.1:8000",
        auth_token: null,
        default_project_id: "default-proj",
        debug_mode: false,
      } satisfies Config,
    });
    invokeMock.mockResolvedValueOnce([]); // get_tasks on mount
    invokeMock.mockResolvedValueOnce({ task_id: "new-1" }); // create_task

    render(<Tasks />);

    fireEvent.change(screen.getByPlaceholderText("Describe a goal for Codexia to work on..."), {
      target: { value: "Write a haiku" },
    });
    fireEvent.change(screen.getByPlaceholderText("Project id (default: default-proj)"), {
      target: { value: "explicit-proj" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "create_task",
        expect.objectContaining({ projectId: "explicit-proj" }),
      ),
    );
  });
});

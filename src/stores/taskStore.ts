import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

export type TaskState =
  "pending" | "running" | "blocked" | "done" | "failed" | "cancelling" | "cancelled";

export interface Usage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
}

export interface TimelineEvent {
  timestamp: string;
  kind: string;
  detail: string;
}

export interface TaskStep {
  number: number;
  description: string;
  state: TaskState;
  result: string | null;
  error: string | null;
  usage: Usage | null;
  reflection_attempts: number;
  critique: string | null;
  depends_on: number[];
  team: string | null;
  events: TimelineEvent[];
}

export interface Task {
  id: string;
  goal: string;
  state: TaskState;
  steps: TaskStep[];
  error: string | null;
  created_at: string;
  updated_at: string;
  validation_usage: Usage | null;
  plan_revisions: number;
  parent_task_id: string | null;
  delegation_depth: number;
  forced_role: string | null;
  simulated: boolean;
  /** Faz 43 in CodexiaCore: the governed-project-memory scope this task
   * ran under, `null` when project memory was disabled - see
   * docs/adr/011-memory-center-project-scoped-tasks.md. */
  project_id: string | null;
}

export interface TaskCreated {
  task_id: string;
}

interface TaskStore {
  tasks: Task[];
  /** The task currently open in the detail pane, kept live by its own SSE
   * watch (see src-tauri/src/services/tasks.rs) - a separate slice from
   * `tasks` since the list and the watched detail are fed by two different
   * Rust-side events and can update at different moments. */
  watchedTask: Task | null;
  selectedTaskId: string | null;
  init: () => Promise<void>;
  /** Forces an immediate list refresh (e.g. a "Refresh" button) instead of
   * waiting for the next periodic tick - see
   * src-tauri/src/services/tasks.rs's run_task_list_poll_loop. */
  refreshTasks: () => Promise<void>;
  selectTask: (taskId: string) => Promise<void>;
  createTask: (
    goal: string,
    requireApproval: boolean,
    simulate: boolean,
    projectId?: string,
    enableApprovalQueue?: boolean,
  ) => Promise<TaskCreated>;
  resumeTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  watchedTask: null,
  selectedTaskId: null,

  init: () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const current = await invoke<Task[]>("get_tasks");
      set({ tasks: current });

      await listen<Task[]>("tasks-changed", (event) => {
        set({ tasks: event.payload });
      });

      await listen<Task>("task-detail-changed", (event) => {
        // Only apply if it's still the task the user has selected - a
        // stale watch from a task the user has since navigated away from
        // is aborted Rust-side, but any in-flight event from just before
        // that abort should still be ignored here rather than clobbering
        // the newly-selected task's detail.
        if (event.payload.id === get().selectedTaskId) {
          set({ watchedTask: event.payload });
        }
      });
    })();

    return initPromise;
  },

  refreshTasks: async () => {
    const tasks = await invoke<Task[]>("refresh_tasks");
    set({ tasks });
  },

  selectTask: async (taskId: string) => {
    set({ selectedTaskId: taskId, watchedTask: null });
    await invoke("watch_task", { taskId });
  },

  createTask: async (
    goal: string,
    requireApproval: boolean,
    simulate: boolean,
    projectId?: string,
    enableApprovalQueue = false,
  ) => {
    const trimmed = projectId?.trim();
    const created = await invoke<TaskCreated>("create_task", {
      goal,
      requireApproval,
      simulate,
      projectId: trimmed ? trimmed : null,
      enableApprovalQueue,
    });
    set({ selectedTaskId: created.task_id, watchedTask: null });
    return created;
  },

  resumeTask: async (taskId: string) => {
    await invoke("resume_task", { taskId });
  },

  cancelTask: async (taskId: string) => {
    await invoke("cancel_task", { taskId });
  },
}));

/** Exposed for tests only - lets each test start from a clean subscription. */
export function __resetTaskStoreForTests(unlisten?: UnlistenFn): void {
  initPromise = null;
  unlisten?.();
}

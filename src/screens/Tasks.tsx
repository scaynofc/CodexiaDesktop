import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildTaskTree } from "@/lib/taskTree";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore, type Task, type TaskState } from "@/stores/taskStore";

const STATE_BADGE_VARIANT: Record<TaskState, "default" | "secondary" | "destructive" | "outline"> =
  {
    pending: "outline",
    running: "secondary",
    blocked: "outline",
    done: "default",
    failed: "destructive",
    cancelling: "outline",
    cancelled: "outline",
  };

interface NewTaskFormProps {
  onCreate: (
    goal: string,
    requireApproval: boolean,
    simulate: boolean,
    projectId: string,
    enableApprovalQueue: boolean,
  ) => void;
  /** From Settings' `default_project_id` (Phase 11) - used when the user
   * leaves this form's own project id field blank, never overriding an
   * explicit (including explicitly cleared) value. Empty string means "no
   * default configured," same as this form's own untouched field. */
  defaultProjectId: string;
}

function NewTaskForm({ onCreate, defaultProjectId }: NewTaskFormProps) {
  const [goal, setGoal] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [enableApprovalQueue, setEnableApprovalQueue] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = goal.trim();
        if (!trimmed) return;
        onCreate(
          trimmed,
          requireApproval,
          simulate,
          projectId.trim() || defaultProjectId,
          enableApprovalQueue,
        );
        setGoal("");
      }}
    >
      <textarea
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="Describe a goal for Codexia to work on..."
        rows={3}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <input
        type="text"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        placeholder={
          defaultProjectId
            ? `Project id (default: ${defaultProjectId})`
            : "Project id (optional - enables project memory)"
        }
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={requireApproval}
          onChange={(event) => setRequireApproval(event.target.checked)}
        />
        Require approval before running
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={simulate}
          onChange={(event) => setSimulate(event.target.checked)}
        />
        Simulate (no real side effects)
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={enableApprovalQueue}
          onChange={(event) => setEnableApprovalQueue(event.target.checked)}
        />
        Gate tool calls/memory writes through Approval Center
      </label>
      <Button type="submit" disabled={!goal.trim()}>
        Create Task
      </Button>
    </form>
  );
}

interface TaskDetailProps {
  task: Task;
  /** The full current task list - used only to look up this task's parent
   * (by `parent_task_id`) and children (by scanning for a matching
   * `parent_task_id`), CodexiaCore's Faz 21 delegation fields. Neither
   * lookup needs its own endpoint: `GET /tasks` already returns every
   * task's full record - see docs/adr/019-task-delegation-visibility.md. */
  tasks: Task[];
  onResume: () => void;
  onCancel: () => void;
  onSelectTask: (taskId: string) => void;
}

function TaskDetail({ task, tasks, onResume, onCancel, onSelectTask }: TaskDetailProps) {
  const parentId = task.parent_task_id;
  const parent = parentId ? (tasks.find((candidate) => candidate.id === parentId) ?? null) : null;
  const children = tasks.filter((candidate) => candidate.parent_task_id === task.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{task.goal}</h2>
        <Badge variant={STATE_BADGE_VARIANT[task.state]}>{task.state}</Badge>
        {task.forced_role && <Badge variant="outline">Role: {task.forced_role}</Badge>}
      </div>

      {parentId && (
        <p className="text-sm text-muted-foreground">
          Delegated from:{" "}
          {parent ? (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onSelectTask(parentId)}
            >
              {parent.goal}
            </button>
          ) : (
            <span className="italic">a task not in the current list</span>
          )}
        </p>
      )}

      {children.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Subtasks ({children.length})</p>
          <ul className="flex flex-col gap-1">
            {children.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => onSelectTask(child.id)}
                >
                  <span className="truncate">{child.goal}</span>
                  <Badge variant={STATE_BADGE_VARIANT[child.state]}>{child.state}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.error && <p className="text-sm text-destructive">{task.error}</p>}

      <div className="flex gap-2">
        {task.state === "blocked" && (
          <Button onClick={onResume} size="sm">
            Resume
          </Button>
        )}
        {(task.state === "running" || task.state === "pending") && (
          <Button onClick={onCancel} variant="destructive" size="sm">
            Cancel
          </Button>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {task.steps.map((step) => (
          <li key={step.number} className="rounded-md border border-border p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {step.number}. {step.description}
              </span>
              <Badge variant={STATE_BADGE_VARIANT[step.state]}>{step.state}</Badge>
            </div>
            {step.result && <p className="mt-1 text-muted-foreground">{step.result}</p>}
            {step.error && <p className="mt-1 text-destructive">{step.error}</p>}
            {step.critique && <p className="mt-1 text-muted-foreground italic">{step.critique}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Phase 4. List (left) + live detail pane (right) + a minimal task-creation
 * form. `watchedTask` is kept live by its own SSE watch
 * (src-tauri/src/services/tasks.rs); the list itself is refreshed on
 * discrete triggers plus a periodic safety-net poll - see
 * docs/adr/007-task-center-polling-and-sse.md.
 */
function Tasks() {
  const tasks = useTaskStore((state) => state.tasks);
  const watchedTask = useTaskStore((state) => state.watchedTask);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const init = useTaskStore((state) => state.init);
  const selectTask = useTaskStore((state) => state.selectTask);
  const createTask = useTaskStore((state) => state.createTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const cancelTask = useTaskStore((state) => state.cancelTask);
  const defaultProjectId = useSettingsStore((state) => state.config?.default_project_id ?? "");

  useEffect(() => {
    void init();
  }, [init]);

  const selectedTask =
    watchedTask?.id === selectedTaskId
      ? watchedTask
      : (tasks.find((candidate) => candidate.id === selectedTaskId) ?? null);

  return (
    <div className="flex h-full gap-6">
      <div className="flex w-80 shrink-0 flex-col gap-4">
        <NewTaskForm
          onCreate={(goal, requireApproval, simulate, projectId, enableApprovalQueue) =>
            void createTask(goal, requireApproval, simulate, projectId, enableApprovalQueue)
          }
          defaultProjectId={defaultProjectId}
        />

        <div className="flex flex-col gap-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            buildTaskTree(tasks).map(({ task, depth }) => (
              <button
                key={task.id}
                type="button"
                onClick={() => void selectTask(task.id)}
                aria-current={task.id === selectedTaskId}
                style={depth > 0 ? { paddingLeft: `${depth * 16 + 10}px` } : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  task.id === selectedTaskId && "bg-muted",
                )}
              >
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {depth > 0 && <span className="text-muted-foreground">↳</span>}
                  <span className="truncate">{task.goal}</span>
                </span>
                <Badge variant={STATE_BADGE_VARIANT[task.state]}>{task.state}</Badge>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            tasks={tasks}
            onResume={() => void resumeTask(selectedTask.id)}
            onCancel={() => void cancelTask(selectedTask.id)}
            onSelectTask={(taskId) => void selectTask(taskId)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a task to see its details.</p>
        )}
      </div>
    </div>
  );
}

export default Tasks;

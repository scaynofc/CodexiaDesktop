import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  onCreate: (goal: string, requireApproval: boolean, simulate: boolean) => void;
}

function NewTaskForm({ onCreate }: NewTaskFormProps) {
  const [goal, setGoal] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [simulate, setSimulate] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = goal.trim();
        if (!trimmed) return;
        onCreate(trimmed, requireApproval, simulate);
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
      <Button type="submit" disabled={!goal.trim()}>
        Create Task
      </Button>
    </form>
  );
}

interface TaskDetailProps {
  task: Task;
  onResume: () => void;
  onCancel: () => void;
}

function TaskDetail({ task, onResume, onCancel }: TaskDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{task.goal}</h2>
        <Badge variant={STATE_BADGE_VARIANT[task.state]}>{task.state}</Badge>
      </div>

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
          onCreate={(goal, requireApproval, simulate) =>
            void createTask(goal, requireApproval, simulate)
          }
        />

        <div className="flex flex-col gap-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet.</p>
          ) : (
            [...tasks].reverse().map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => void selectTask(task.id)}
                aria-current={task.id === selectedTaskId}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  task.id === selectedTaskId && "bg-muted",
                )}
              >
                <span className="truncate">{task.goal}</span>
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
            onResume={() => void resumeTask(selectedTask.id)}
            onCancel={() => void cancelTask(selectedTask.id)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a task to see its details.</p>
        )}
      </div>
    </div>
  );
}

export default Tasks;

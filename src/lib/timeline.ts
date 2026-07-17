import type { Task, TaskState } from "@/stores/taskStore";

export interface TimelineEntry {
  /** CodexiaCore's TimelineEvent carries no id of its own - stable within a
   * given tasks snapshot since (task, step, index-within-step) never repeats. */
  key: string;
  timestamp: string;
  kind: string;
  detail: string;
  taskId: string;
  taskGoal: string;
  taskState: TaskState;
  stepNumber: number;
  stepDescription: string;
}

/**
 * Flattens every step's `events` across every task into one reverse-
 * chronological feed. CodexiaCore has no aggregate-events endpoint and
 * doesn't need one for this: `GET /tasks` (already fetched by
 * useTaskStore, the same call Task Center relies on) embeds each step's
 * full `events` array already - see docs/adr/008-timeline-derived-view.md.
 *
 * Sorted by timestamp descending; ties are left to `Array.prototype.sort`'s
 * guaranteed stability, which preserves the task/step/event iteration order
 * below - a real case, not a hypothetical one, since `step_started` and an
 * immediate `attempt_failed` can share the same second-resolution timestamp.
 */
export function deriveTimelineEntries(tasks: readonly Task[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const task of tasks) {
    for (const step of task.steps) {
      step.events.forEach((event, index) => {
        entries.push({
          key: `${task.id}:${step.number}:${index}`,
          timestamp: event.timestamp,
          kind: event.kind,
          detail: event.detail,
          taskId: task.id,
          taskGoal: task.goal,
          taskState: task.state,
          stepNumber: step.number,
          stepDescription: step.description,
        });
      });
    }
  }

  entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return entries;
}

export type TimelineBadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Every `kind` the Orchestrator currently emits (`core/orchestrator.py`,
 * `core/async_orchestrator.py`, `core/delegation.py`, all via `_emit`).
 * `TimelineEvent.kind` is deliberately a plain string, not an enum
 * (`models/task.py`'s own docstring: reserved for a future EventBus's topic
 * names) - `timelineKindLabel`/`timelineKindBadgeVariant` fall back to the
 * raw string / "outline" for any kind not listed here, so a future
 * CodexiaCore addition renders instead of silently vanishing.
 */
const KIND_LABEL: Record<string, string> = {
  step_started: "Step started",
  step_done: "Step done",
  step_failed: "Step failed",
  attempt_failed: "Attempt failed",
  reflection_verdict: "Reflection verdict",
  cancelled: "Cancelled",
  delegation_started: "Delegation started",
  team_member_accuracy: "Team member accuracy",
};

const KIND_BADGE_VARIANT: Record<string, TimelineBadgeVariant> = {
  step_started: "outline",
  step_done: "default",
  step_failed: "destructive",
  attempt_failed: "destructive",
  reflection_verdict: "secondary",
  cancelled: "outline",
  delegation_started: "secondary",
  team_member_accuracy: "outline",
};

export function timelineKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function timelineKindBadgeVariant(kind: string): TimelineBadgeVariant {
  return KIND_BADGE_VARIANT[kind] ?? "outline";
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Renders CodexiaCore's ISO 8601 timestamp in the viewer's locale/timezone;
 * falls back to the raw string for anything `Date` can't parse rather than
 * showing "Invalid Date". */
export function formatTimelineTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : TIMESTAMP_FORMATTER.format(parsed);
}

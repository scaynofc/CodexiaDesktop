import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  deriveTimelineEntries,
  formatTimelineTimestamp,
  timelineKindBadgeVariant,
  timelineKindLabel,
} from "@/lib/timeline";
import { useTaskStore, type Task } from "@/stores/taskStore";

/**
 * Phase 5. A cross-task, reverse-chronological feed of every TimelineEvent
 * CodexiaCore's Orchestrator records (Faz 32/33: step_started, step_done,
 * step_failed, attempt_failed, reflection_verdict, cancelled,
 * delegation_started, team_member_accuracy). The first screen to surface
 * that data at all - Task Center's own detail pane (Phase 4) shows step
 * state but never rendered `step.events`.
 *
 * Built entirely from useTaskStore's existing `tasks` list - no new Core
 * Bridge call, Tauri command, or poll loop. See
 * docs/adr/008-timeline-derived-view.md.
 */
function Timeline() {
  const tasks = useTaskStore((state) => state.tasks);
  const watchedTask = useTaskStore((state) => state.watchedTask);
  const init = useTaskStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

  // Overlays the actively-watched task (if Task Center has one open), since
  // its live SSE updates land ahead of the list's 5s safety-net poll -
  // mirrors Tasks.tsx's own selectedTask derivation.
  const liveTasks = useMemo<Task[]>(() => {
    if (!watchedTask) return tasks;
    const index = tasks.findIndex((task) => task.id === watchedTask.id);
    if (index === -1) return tasks;
    const merged = [...tasks];
    merged[index] = watchedTask;
    return merged;
  }, [tasks, watchedTask]);

  const entries = useMemo(() => deriveTimelineEntries(liveTasks), [liveTasks]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. Events appear here once a task starts running.
      </p>
    );
  }

  return (
    <ol className="flex max-w-2xl flex-col gap-2 overflow-y-auto">
      {entries.map((entry) => (
        <li key={entry.key} className="rounded-md border border-border p-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={timelineKindBadgeVariant(entry.kind)}>
              {timelineKindLabel(entry.kind)}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatTimelineTimestamp(entry.timestamp)}
            </span>
          </div>
          <p className="mt-1 truncate font-medium" title={entry.taskGoal}>
            {entry.taskGoal}
          </p>
          <p className="text-xs text-muted-foreground">
            Step {entry.stepNumber}: {entry.stepDescription}
          </p>
          {entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

export default Timeline;

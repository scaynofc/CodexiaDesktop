import { describe, expect, it } from "vitest";
import {
  deriveTimelineEntries,
  formatTimelineTimestamp,
  timelineKindBadgeVariant,
  timelineKindLabel,
} from "./timeline";
import type { Task, TaskStep, TimelineEvent } from "@/stores/taskStore";

function event(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return { timestamp: "2026-07-16T00:00:00+00:00", kind: "step_started", detail: "", ...overrides };
}

function step(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    number: 1,
    description: "Do the thing",
    state: "running",
    result: null,
    error: null,
    usage: null,
    reflection_attempts: 0,
    critique: null,
    depends_on: [],
    team: null,
    events: [],
    ...overrides,
  };
}

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

describe("deriveTimelineEntries", () => {
  it("returns an empty feed for tasks with no steps or no events", () => {
    expect(deriveTimelineEntries([])).toEqual([]);
    expect(deriveTimelineEntries([task("t1")])).toEqual([]);
    expect(deriveTimelineEntries([task("t1", { steps: [step({ events: [] })] })])).toEqual([]);
  });

  it("flattens every step's events across every task, sorted newest first", () => {
    const tasks = [
      task("t1", {
        steps: [
          step({
            number: 1,
            events: [
              event({ timestamp: "2026-07-16T00:00:00+00:00", kind: "step_started" }),
              event({ timestamp: "2026-07-16T00:00:05+00:00", kind: "step_done" }),
            ],
          }),
        ],
      }),
      task("t2", {
        steps: [
          step({
            number: 1,
            events: [event({ timestamp: "2026-07-16T00:00:03+00:00", kind: "step_failed" })],
          }),
        ],
      }),
    ];

    const entries = deriveTimelineEntries(tasks);

    expect(entries.map((entry) => entry.kind)).toEqual([
      "step_done",
      "step_failed",
      "step_started",
    ]);
    expect(entries[0].taskId).toBe("t1");
    expect(entries[0].timestamp).toBe("2026-07-16T00:00:05+00:00");
  });

  it("carries denormalized task/step context onto each entry", () => {
    const tasks = [
      task("t1", {
        goal: "Write a haiku",
        state: "blocked",
        steps: [
          step({
            number: 2,
            description: "Polish the haiku",
            events: [event({ kind: "reflection_verdict", detail: "accepted=true attempts=1" })],
          }),
        ],
      }),
    ];

    const [entry] = deriveTimelineEntries(tasks);

    expect(entry).toMatchObject({
      key: "t1:2:0",
      taskId: "t1",
      taskGoal: "Write a haiku",
      taskState: "blocked",
      stepNumber: 2,
      stepDescription: "Polish the haiku",
      detail: "accepted=true attempts=1",
    });
  });

  it("preserves original iteration order for events sharing the same timestamp", () => {
    const tasks = [
      task("t1", {
        steps: [
          step({
            number: 1,
            events: [
              event({ timestamp: "2026-07-16T00:00:00+00:00", kind: "step_started" }),
              event({ timestamp: "2026-07-16T00:00:00+00:00", kind: "attempt_failed" }),
            ],
          }),
        ],
      }),
    ];

    const entries = deriveTimelineEntries(tasks);

    expect(entries.map((entry) => entry.kind)).toEqual(["step_started", "attempt_failed"]);
  });
});

describe("timelineKindLabel", () => {
  it("gives every known Orchestrator event kind a human label", () => {
    expect(timelineKindLabel("step_started")).toBe("Step started");
    expect(timelineKindLabel("delegation_started")).toBe("Delegation started");
    expect(timelineKindLabel("team_member_accuracy")).toBe("Team member accuracy");
  });

  it("falls back to the raw kind string for an unknown kind", () => {
    expect(timelineKindLabel("some_future_kind")).toBe("some_future_kind");
  });
});

describe("timelineKindBadgeVariant", () => {
  it("marks failure kinds as destructive", () => {
    expect(timelineKindBadgeVariant("step_failed")).toBe("destructive");
    expect(timelineKindBadgeVariant("attempt_failed")).toBe("destructive");
  });

  it("falls back to outline for an unknown kind", () => {
    expect(timelineKindBadgeVariant("some_future_kind")).toBe("outline");
  });
});

describe("formatTimelineTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatTimelineTimestamp("2026-07-16T00:00:00+00:00");
    expect(formatted).not.toBe("2026-07-16T00:00:00+00:00");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatTimelineTimestamp("not-a-date")).toBe("not-a-date");
  });
});

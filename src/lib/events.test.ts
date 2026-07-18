import { describe, expect, it } from "vitest";
import {
  eventKey,
  eventSourceLabel,
  eventTypeBadgeClassName,
  eventTypeLabel,
  filterEvents,
  formatEventTimestamp,
} from "./events";
import type { SystemEvent } from "@/stores/eventsStore";

function event(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    timestamp: "2026-07-17T12:00:00+00:00",
    type: "error",
    source: "provider",
    message: "openrouter/model-a failed (rate_limit)",
    task_id: null,
    metadata: {},
    ...overrides,
  };
}

describe("eventTypeLabel", () => {
  it("labels every type", () => {
    expect(eventTypeLabel("error")).toBe("Error");
    expect(eventTypeLabel("warning")).toBe("Warning");
    expect(eventTypeLabel("info")).toBe("Info");
  });
});

describe("eventSourceLabel", () => {
  it("labels every source", () => {
    expect(eventSourceLabel("task")).toBe("Task");
    expect(eventSourceLabel("provider")).toBe("Provider");
    expect(eventSourceLabel("approval")).toBe("Approval");
  });
});

describe("eventTypeBadgeClassName", () => {
  it("color-codes error as destructive/red", () => {
    expect(eventTypeBadgeClassName("error")).toContain("destructive");
  });

  it("color-codes warning as amber", () => {
    expect(eventTypeBadgeClassName("warning")).toContain("amber");
  });

  it("color-codes info as neutral/gray", () => {
    expect(eventTypeBadgeClassName("info")).toContain("muted-foreground");
  });
});

describe("filterEvents", () => {
  const events = [
    event({ type: "error", source: "provider" }),
    event({ type: "warning", source: "task" }),
    event({ type: "info", source: "task" }),
  ];

  it("returns every event when both filters are 'all'", () => {
    expect(filterEvents(events, "all", "all")).toHaveLength(3);
  });

  it("narrows by type", () => {
    const result = filterEvents(events, "warning", "all");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("warning");
  });

  it("narrows by source", () => {
    const result = filterEvents(events, "all", "provider");
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("provider");
  });

  it("narrows by both dimensions at once", () => {
    const result = filterEvents(events, "info", "task");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("info");
    expect(result[0].source).toBe("task");
  });

  it("returns an empty list when no event matches both filters", () => {
    expect(filterEvents(events, "error", "task")).toHaveLength(0);
  });
});

describe("eventKey", () => {
  it("differs for events with different sources at the same timestamp", () => {
    const a = eventKey(event({ source: "task" }));
    const b = eventKey(event({ source: "provider" }));
    expect(a).not.toBe(b);
  });

  it("differs for events with different task ids", () => {
    const a = eventKey(event({ task_id: "task-1" }));
    const b = eventKey(event({ task_id: "task-2" }));
    expect(a).not.toBe(b);
  });

  it("is stable for the same event", () => {
    const single = event();
    expect(eventKey(single)).toBe(eventKey(single));
  });
});

describe("formatEventTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatEventTimestamp("2026-07-17T12:00:00+00:00");
    expect(formatted).not.toBe("2026-07-17T12:00:00+00:00");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatEventTimestamp("not-a-date")).toBe("not-a-date");
  });
});

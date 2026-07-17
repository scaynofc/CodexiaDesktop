import type { SystemEvent, SystemEventSource, SystemEventType } from "@/stores/eventsStore";

/**
 * Formatting/filtering helpers for Log Center (Phase 9). Pure and
 * unit-tested, mirroring `lib/runtime.ts`/`lib/timeline.ts`'s split between
 * pure logic and the screen that renders it.
 */

export type EventTypeFilter = "all" | SystemEventType;
export type EventSourceFilter = "all" | SystemEventSource;

const TYPE_LABEL: Record<SystemEventType, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

const SOURCE_LABEL: Record<SystemEventSource, string> = {
  task: "Task",
  provider: "Provider",
};

export function eventTypeLabel(type: SystemEventType): string {
  return TYPE_LABEL[type];
}

export function eventSourceLabel(source: SystemEventSource): string {
  return SOURCE_LABEL[source];
}

/** Severity color-coding (red=error, amber=warning, gray=info) as className
 * overrides on Badge's "outline" variant - kept here rather than as new
 * Badge variants since this mapping is Log Center-specific, not a
 * general-purpose design token. */
const TYPE_BADGE_CLASSNAME: Record<SystemEventType, string> = {
  error: "border-destructive/50 text-destructive",
  warning: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  info: "border-border text-muted-foreground",
};

export function eventTypeBadgeClassName(type: SystemEventType): string {
  return TYPE_BADGE_CLASSNAME[type];
}

/** CodexiaCore's `GET /events` already returns entries merged and sorted
 * newest-first (`core/events_facade.py`'s `build_event_log`), so this only
 * narrows by the two filter dimensions Log Center exposes - it never
 * re-sorts. */
export function filterEvents(
  events: readonly SystemEvent[],
  typeFilter: EventTypeFilter,
  sourceFilter: EventSourceFilter,
): SystemEvent[] {
  return events.filter(
    (event) =>
      (typeFilter === "all" || event.type === typeFilter) &&
      (sourceFilter === "all" || event.source === sourceFilter),
  );
}

/** `SystemEvent` carries no id of its own (same situation `lib/timeline.ts`
 * documents for `TimelineEvent`) - this composite is stable within a given
 * `GET /events` snapshot since (source, timestamp, task id, message)
 * realistically never repeats. */
export function eventKey(event: SystemEvent): string {
  return `${event.source}:${event.timestamp}:${event.task_id ?? ""}:${event.message}`;
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Renders CodexiaCore's ISO 8601 timestamp in the viewer's locale/timezone;
 * falls back to the raw string for anything `Date` can't parse rather than
 * showing "Invalid Date". */
export function formatEventTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : TIMESTAMP_FORMATTER.format(parsed);
}

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  eventKey,
  eventSourceLabel,
  eventTypeBadgeClassName,
  eventTypeLabel,
  filterEvents,
  formatEventTimestamp,
  type EventSourceFilter,
  type EventTypeFilter,
} from "@/lib/events";
import { useEventsStore, type SystemEvent } from "@/stores/eventsStore";

const TYPE_FILTERS: EventTypeFilter[] = ["all", "error", "warning", "info"];
const SOURCE_FILTERS: EventSourceFilter[] = ["all", "task", "provider"];

interface EventDetailProps {
  event: SystemEvent;
}

function EventDetail({ event }: EventDetailProps) {
  const metadataEntries = Object.entries(event.metadata);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={eventTypeBadgeClassName(event.type)}>
          {eventTypeLabel(event.type)}
        </Badge>
        <Badge variant="outline">{eventSourceLabel(event.source)}</Badge>
      </div>
      <p className="text-sm">{event.message}</p>
      <p className="text-xs text-muted-foreground">{formatEventTimestamp(event.timestamp)}</p>
      {event.task_id && <p className="text-xs text-muted-foreground">Task: {event.task_id}</p>}
      {metadataEntries.length > 0 && (
        <dl className="flex flex-col gap-1 text-xs">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Phase 9. A structured "what went wrong" observability panel, deliberately
 * not a raw log viewer or a new logging framework - reads CodexiaCore's
 * `GET /events` (ADR-015 there), which derives entries from
 * already-persisted TimelineEvent anomalies (step_failed/attempt_failed/
 * cancelled) and failed ModelAttempts, merged and sorted newest-first. See
 * docs/adr/012-log-center-derived-events.md.
 *
 * No push event backs this screen (mirrors Provider Center/Runtime
 * Center/Memory Center) - it fetches once on mount and again on "Refresh."
 */
function Log() {
  const events = useEventsStore((state) => state.events);
  const fetchState = useEventsStore((state) => state.fetchState);
  const error = useEventsStore((state) => state.error);
  const fetchEvents = useEventsStore((state) => state.fetchEvents);

  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<EventSourceFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filtered = useMemo(
    () => filterEvents(events, typeFilter, sourceFilter),
    [events, typeFilter, sourceFilter],
  );

  const selected = filtered.find((event) => eventKey(event) === selectedKey) ?? null;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          What went wrong, derived from task and provider failures CodexiaCore already records - not
          a live debugging console.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void fetchEvents()} size="sm" disabled={fetchState === "loading"}>
            {fetchState === "loading" ? "Refreshing…" : "Refresh"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {TYPE_FILTERS.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="xs"
                variant={typeFilter === filter ? "secondary" : "ghost"}
                onClick={() => setTypeFilter(filter)}
              >
                {filter === "all" ? "All types" : eventTypeLabel(filter)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {SOURCE_FILTERS.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="xs"
                variant={sourceFilter === filter ? "secondary" : "ghost"}
                onClick={() => setSourceFilter(filter)}
              >
                {filter === "all" ? "All sources" : eventSourceLabel(filter)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {events.length === 0
            ? fetchState === "loading"
              ? "Loading events…"
              : "No events recorded yet."
            : "No events match the current filters."}
        </p>
      ) : (
        <div className="flex flex-1 gap-6 overflow-hidden">
          <ol className="flex w-96 shrink-0 flex-col gap-1 overflow-y-auto">
            {filtered.map((event) => {
              const key = eventKey(event);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    aria-current={key === selectedKey}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md border border-border p-2 text-left text-sm hover:bg-muted",
                      key === selectedKey && "bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={eventTypeBadgeClassName(event.type)}>
                        {eventTypeLabel(event.type)}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatEventTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <p className="truncate">{event.message}</p>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="flex-1 overflow-y-auto">
            {selected ? (
              <EventDetail event={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">Select an event to see its details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Log;

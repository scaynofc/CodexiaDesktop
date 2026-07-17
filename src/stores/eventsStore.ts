import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type SystemEventType = "error" | "warning" | "info";
export type SystemEventSource = "task" | "provider";

export interface SystemEvent {
  timestamp: string;
  type: SystemEventType;
  source: SystemEventSource;
  message: string;
  task_id: string | null;
  metadata: Record<string, string>;
}

const DEFAULT_LIMIT = 100;

interface EventsStore {
  events: SystemEvent[];
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  /**
   * Fetches CodexiaCore's derived event log via `get_events` - no push
   * event backs this store, same reasoning as `metricsStore`/
   * `runtimeStore`: events only change as a side effect of a task running
   * or a provider call failing, not on their own. Called on Log.tsx's
   * mount and by its "Refresh" button, see
   * docs/adr/012-log-center-derived-events.md.
   */
  fetchEvents: (limit?: number) => Promise<void>;
}

export const useEventsStore = create<EventsStore>((set) => ({
  events: [],
  fetchState: "idle",
  error: null,

  fetchEvents: async (limit: number = DEFAULT_LIMIT) => {
    set({ fetchState: "loading", error: null });
    try {
      const events = await invoke<SystemEvent[]>("get_events", { limit });
      set({ events, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },
}));

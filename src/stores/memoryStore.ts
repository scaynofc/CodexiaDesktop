import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type MemoryItemType = "fact" | "pattern" | "strategy" | "error";

export interface MemoryItem {
  id: string;
  project_id: string;
  key: string;
  value: string;
  type: MemoryItemType;
  version: number;
  superseded_by: string | null;
  importance_score: number;
  tags: string[];
  source_session_id: string | null;
  access_count: number;
  last_accessed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoryStore {
  items: MemoryItem[];
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  /** Fetches current memory items for a project - called whenever Memory
   * Center's project id input changes and by its "Refresh" button. No
   * push event backs this store (CodexiaCore has no memory-changed
   * notification), same reasoning as `metricsStore`/`runtimeStore` - see
   * docs/adr/011-memory-center-project-scoped-tasks.md. */
  fetchMemory: (projectId: string) => Promise<void>;
  /** Forgets a key and applies the server's refreshed list in one round
   * trip (see `services::memory::forget_and_refresh`), so the UI never
   * shows a stale item between the delete and the next fetch. */
  forgetKey: (projectId: string, key: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryStore>((set) => ({
  items: [],
  fetchState: "idle",
  error: null,

  fetchMemory: async (projectId: string) => {
    set({ fetchState: "loading", error: null });
    try {
      const items = await invoke<MemoryItem[]>("get_project_memory", { projectId });
      set({ items, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },

  forgetKey: async (projectId: string, key: string) => {
    set({ fetchState: "loading", error: null });
    try {
      const items = await invoke<MemoryItem[]>("forget_project_memory", { projectId, key });
      set({ items, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },
}));

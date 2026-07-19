import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type CapabilitySource = "built_in" | "mcp";

export interface Capability {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requires_approval: boolean;
  source: CapabilitySource;
}

interface CapabilityStore {
  capabilities: Capability[];
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  /**
   * Fetches CodexiaCore's currently-registered tool list via
   * `get_capabilities` - no push event backs this store, same reasoning as
   * `runtimeStore`/`metricsStore`: a tool registry only changes on Core
   * restart/config reload, not mid-session. Called on Capabilities.tsx's
   * mount and by its "Refresh" button, see
   * docs/adr/022-capability-registry.md.
   */
  fetchCapabilities: () => Promise<void>;
}

export const useCapabilityStore = create<CapabilityStore>((set) => ({
  capabilities: [],
  fetchState: "idle",
  error: null,

  fetchCapabilities: async () => {
    set({ fetchState: "loading", error: null });
    try {
      const capabilities = await invoke<Capability[]>("get_capabilities");
      set({ capabilities, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },
}));

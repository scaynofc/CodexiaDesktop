import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface OllamaRuntimeModel {
  name: string;
  size_vram_bytes: number | null;
  expires_at: string | null;
}

export interface OllamaRuntimeStatus {
  reachable: boolean;
  models: OllamaRuntimeModel[];
}

interface RuntimeStore {
  runtime: OllamaRuntimeStatus | null;
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  /**
   * Fetches Ollama's current runtime status via `get_ollama_runtime` - no
   * push event backs this store, same reasoning as `metricsStore`: nothing
   * in CodexiaCore notifies on a model being loaded/unloaded. Called on
   * Runtime.tsx's mount and by its "Refresh" button, see
   * docs/adr/010-runtime-center-ollama-proxy.md.
   */
  fetchRuntime: () => Promise<void>;
}

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  runtime: null,
  fetchState: "idle",
  error: null,

  fetchRuntime: async () => {
    set({ fetchState: "loading", error: null });
    try {
      const runtime = await invoke<OllamaRuntimeStatus>("get_ollama_runtime");
      set({ runtime, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },
}));

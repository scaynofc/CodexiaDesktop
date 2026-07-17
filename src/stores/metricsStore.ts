import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type ProviderType = "openrouter" | "ollama" | "generic";

export interface ModelHealth {
  provider: ProviderType;
  model: string;
  sample_count: number;
  success_rate: number;
  median_latency_ms: number | null;
  avg_cost_usd: number | null;
  consecutive_failures: number;
  in_cooldown: boolean;
}

export interface DailyCostSummary {
  date: string;
  calls: number;
  total_tokens: number;
  cost_usd: number | null;
}

export interface MetricsSnapshot {
  total_cost_usd: number | null;
  total_calls: number;
  daily_costs: DailyCostSummary[];
  model_health: ModelHealth[];
  router_accuracy: number | null;
  router_accuracy_by_role: Record<string, number | null>;
}

interface MetricsStore {
  snapshot: MetricsSnapshot | null;
  status: "idle" | "loading" | "error";
  error: string | null;
  /**
   * Fetches a fresh snapshot via `get_metrics` - no push event backs this
   * store (unlike taskStore/connectionStore), since CodexiaCore has no
   * metrics-changed notification of its own; every call is a real round
   * trip. Called on Providers.tsx's mount and by its "Refresh" button, see
   * docs/adr/009-provider-center-metrics-snapshot.md.
   */
  fetchMetrics: () => Promise<void>;
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  snapshot: null,
  status: "idle",
  error: null,

  fetchMetrics: async () => {
    set({ status: "loading", error: null });
    try {
      const snapshot = await invoke<MetricsSnapshot>("get_metrics");
      set({ snapshot, status: "idle" });
    } catch (error) {
      set({ status: "error", error: String(error) });
    }
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface Config {
  core_url: string;
  auth_token: string | null;
  default_project_id: string | null;
  /** Reserved - not wired to any behavior yet, see docs/adr/013. */
  debug_mode: boolean;
}

interface SettingsStore {
  config: Config | null;
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  testState: "idle" | "testing" | "success" | "error";
  testError: string | null;
  /** Idempotent - safe to call from multiple mount points (App.tsx's root
   * effect, so `config.default_project_id` is available to Task Center
   * without it needing to know anything about Settings; Settings.tsx's own
   * mount, in case it's opened before the root effect resolves). Mirrors
   * `taskStore.init()`'s single-shared-promise pattern. */
  init: () => Promise<void>;
  /** Forces a fresh read from disk (via `get_config`, which is itself a
   * synchronous read of the already-loaded in-memory cache - see
   * `commands::get_config`) - exposed separately from `init()` for a
   * possible future "Reload" action; Settings.tsx today only needs `init()`. */
  loadConfig: () => Promise<void>;
  /** Persists the given config and adopts the server's echoed-back copy as
   * the new current config - see `commands::save_config`. */
  saveConfig: (config: Config) => Promise<void>;
  /** Probes a URL/token pair without saving anything - see
   * `commands::test_connection`. Tracked in its own `testState`/`testError`
   * pair, separate from `fetchState`/`error`, since a failed test must not
   * be confused with a failed load/save. */
  testConnection: (coreUrl: string, authToken: string | null) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  config: null,
  fetchState: "idle",
  error: null,
  testState: "idle",
  testError: null,

  init: () => {
    if (initPromise) return initPromise;
    initPromise = get().loadConfig();
    return initPromise;
  },

  loadConfig: async () => {
    set({ fetchState: "loading", error: null });
    try {
      const config = await invoke<Config>("get_config");
      set({ config, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },

  saveConfig: async (config: Config) => {
    set({ fetchState: "loading", error: null });
    try {
      const saved = await invoke<Config>("save_config", { newConfig: config });
      set({ config: saved, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },

  testConnection: async (coreUrl: string, authToken: string | null) => {
    set({ testState: "testing", testError: null });
    try {
      await invoke("test_connection", { coreUrl, authToken });
      set({ testState: "success" });
    } catch (error) {
      set({ testState: "error", testError: String(error) });
    }
  },
}));

/** Exposed for tests only - lets each test start from a clean subscription,
 * same as `__resetTaskStoreForTests`. */
export function __resetSettingsStoreForTests(): void {
  initPromise = null;
}

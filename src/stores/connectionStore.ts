import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

export type ConnectionState = "Connecting" | "Connected" | "Reconnecting" | "Disconnected";

export interface HealthResponse {
  status: string;
  alive: boolean;
  core_version: string;
  api_version: number;
  protocol_version: number;
  instance_id: string;
  timestamp: string;
}

export interface ConnectionStatus {
  state: ConnectionState;
  health: HealthResponse | null;
  restarted: boolean;
}

const initialStatus: ConnectionStatus = { state: "Connecting", health: null, restarted: false };

interface ConnectionStore {
  status: ConnectionStatus;
  /**
   * Subscribes to `connection-status-changed` (emitted by Desktop Services'
   * poll loop, see src-tauri/src/services/connection.rs) and fetches the
   * current value once via `get_connection_status`, so a component mounting
   * after the app already connected doesn't have to wait for the next
   * change event to see a real status. Safe to call from multiple
   * components - only the first call actually subscribes.
   */
  init: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: initialStatus,
  init: () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const current = await invoke<ConnectionStatus>("get_connection_status");
      set({ status: current });

      await listen<ConnectionStatus>("connection-status-changed", (event) => {
        set({ status: event.payload });
      });
    })();

    return initPromise;
  },
}));

/** Exposed for tests only - lets each test start from a clean subscription. */
export function __resetConnectionStoreForTests(unlisten?: UnlistenFn): void {
  initPromise = null;
  unlisten?.();
}

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
  /** This Core instance's configured per-task cost ceiling
   * (settings.max_task_cost_usd there) - `null` means unlimited. See
   * docs/adr/018-cost-budget-visibility.md. */
  max_task_cost_usd: number | null;
}

export interface ConnectionStatus {
  state: ConnectionState;
  health: HealthResponse | null;
  restarted: boolean;
  /** Whether the connected Core's api_version/protocol_version match what
   * this Desktop build expects - computed in
   * src-tauri/src/services/connection.rs's next_status(), see
   * docs/adr/015-core-version-compatibility-check.md. `true` when no
   * health has been observed yet, same as `restarted` starting `false`. */
  api_compatible: boolean;
  protocol_compatible: boolean;
}

const initialStatus: ConnectionStatus = {
  state: "Connecting",
  health: null,
  restarted: false,
  api_compatible: true,
  protocol_compatible: true,
};

interface ConnectionStore {
  status: ConnectionStatus;
  /**
   * Whether a "Core restarted" notice should be visible. Deliberately NOT
   * read directly from `status.restarted` - that field is transient (Rust
   * recomputes it fresh on every poll, so it's back to `false` by the very
   * next successful poll, ~3s later - the same narrow window that took
   * repeated rapid screenshots to even capture during manual verification).
   * This flag instead latches on when this store observes an instance_id
   * change across updates, and only clears when `dismissRestartNotice` is
   * called - so a user has a real chance to see and act on it.
   */
  showRestartNotice: boolean;
  dismissRestartNotice: () => void;
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
let lastSeenInstanceId: string | null = null;

function applyStatus(status: ConnectionStatus, set: (partial: Partial<ConnectionStore>) => void) {
  const instanceId = status.health?.instance_id ?? null;
  const isRestart =
    lastSeenInstanceId !== null && instanceId !== null && instanceId !== lastSeenInstanceId;
  if (instanceId !== null) {
    lastSeenInstanceId = instanceId;
  }
  set(isRestart ? { status, showRestartNotice: true } : { status });
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: initialStatus,
  showRestartNotice: false,
  dismissRestartNotice: () => set({ showRestartNotice: false }),
  init: () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const current = await invoke<ConnectionStatus>("get_connection_status");
      applyStatus(current, set);

      await listen<ConnectionStatus>("connection-status-changed", (event) => {
        applyStatus(event.payload, set);
      });
    })();

    return initPromise;
  },
}));

/** Exposed for tests only - lets each test start from a clean subscription. */
export function __resetConnectionStoreForTests(unlisten?: UnlistenFn): void {
  initPromise = null;
  lastSeenInstanceId = null;
  unlisten?.();
}

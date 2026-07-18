import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

export type ApprovalType = "tool" | "memory";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

export interface Approval {
  id: string;
  task_id: string | null;
  step_id: number | null;
  type: ApprovalType;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  created_at: string;
  decided_at: string | null;
  expires_at: string | null;
  decision_reason: string | null;
}

interface ApprovalStore {
  approvals: Approval[];
  fetchState: "idle" | "loading" | "error";
  error: string | null;
  /** Ids currently mid-decision - lets the screen disable just the row being
   * acted on instead of the whole list while an approve/reject round trip
   * is in flight. */
  decidingIds: string[];
  /**
   * The current pending-approval count, kept live by
   * `services::approval_watch::run_approval_watch_loop` - a background
   * loop spawned once in `lib.rs`'s `setup()` that runs for the app's
   * whole lifetime, independent of Approvals.tsx's own screen-scoped
   * polling below. Powers the sidebar badge (App.tsx's root effect calls
   * `init()` once, same as `connectionStore`/`settingsStore`) - see
   * docs/adr/017-approval-awareness.md.
   */
  pendingCount: number;
  /** Subscribes to `approvals-changed` and fetches the current count once
   * via `get_pending_approval_count`, so a component mounting after the
   * app already has pending approvals doesn't have to wait for the next
   * change event to see a real count. Safe to call from multiple
   * components - only the first call actually subscribes. */
  init: () => Promise<void>;
  /**
   * Fetches CodexiaCore's current pending approvals via `get_pending_approvals`
   * - called on Approval Center's mount and by its screen-scoped poll
   * interval (owned by Approvals.tsx itself, not this store or a Rust
   * background loop - see docs/adr/014-approval-center-human-in-the-loop.md).
   */
  fetchApprovals: () => Promise<void>;
  /** Approves an approval, then applies the server's refreshed pending list
   * in one round trip (see `services::approvals::approve_and_refresh`), so
   * a decided approval disappears immediately rather than waiting for the
   * next poll tick. */
  approve: (approvalId: string, reason?: string) => Promise<void>;
  /** Rejects an approval - same shape as `approve`. */
  reject: (approvalId: string, reason?: string) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useApprovalStore = create<ApprovalStore>((set, get) => ({
  approvals: [],
  fetchState: "idle",
  error: null,
  decidingIds: [],
  pendingCount: 0,

  init: () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const count = await invoke<number>("get_pending_approval_count");
      set({ pendingCount: count });

      await listen<Approval[]>("approvals-changed", (event) => {
        set({ pendingCount: event.payload.length });
      });
    })();

    return initPromise;
  },

  fetchApprovals: async () => {
    set({ fetchState: "loading", error: null });
    try {
      const approvals = await invoke<Approval[]>("get_pending_approvals");
      set({ approvals, fetchState: "idle" });
    } catch (error) {
      set({ fetchState: "error", error: String(error) });
    }
  },

  approve: async (approvalId: string, reason?: string) => {
    set({ decidingIds: [...get().decidingIds, approvalId], error: null });
    try {
      const approvals = await invoke<Approval[]>("approve_approval", {
        approvalId,
        reason: reason ?? null,
      });
      set({ approvals, decidingIds: get().decidingIds.filter((id) => id !== approvalId) });
    } catch (error) {
      set({
        error: String(error),
        decidingIds: get().decidingIds.filter((id) => id !== approvalId),
      });
    }
  },

  reject: async (approvalId: string, reason?: string) => {
    set({ decidingIds: [...get().decidingIds, approvalId], error: null });
    try {
      const approvals = await invoke<Approval[]>("reject_approval", {
        approvalId,
        reason: reason ?? null,
      });
      set({ approvals, decidingIds: get().decidingIds.filter((id) => id !== approvalId) });
    } catch (error) {
      set({
        error: String(error),
        decidingIds: get().decidingIds.filter((id) => id !== approvalId),
      });
    }
  },
}));

/** Exposed for tests only - lets each test start from a clean subscription. */
export function __resetApprovalStoreForTests(unlisten?: UnlistenFn): void {
  initPromise = null;
  unlisten?.();
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApprovalStore, type Approval } from "./approvalStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "appr-1",
    task_id: "task-1",
    step_id: 1,
    type: "tool",
    payload: { name: "write_file" },
    status: "pending",
    created_at: "2026-07-18T12:00:00+00:00",
    decided_at: null,
    expires_at: "2026-07-18T12:02:00+00:00",
    decision_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  useApprovalStore.setState({ approvals: [], fetchState: "idle", error: null, decidingIds: [] });
  invokeMock.mockReset();
});

describe("useApprovalStore", () => {
  it("starts idle with no approvals", () => {
    const state = useApprovalStore.getState();
    expect(state.approvals).toEqual([]);
    expect(state.fetchState).toBe("idle");
    expect(state.decidingIds).toEqual([]);
  });

  it("fetchApprovals calls get_pending_approvals and stores the result", async () => {
    invokeMock.mockResolvedValueOnce([approval()]);

    await useApprovalStore.getState().fetchApprovals();

    expect(invokeMock).toHaveBeenCalledWith("get_pending_approvals");
    const state = useApprovalStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.approvals).toHaveLength(1);
    expect(state.error).toBeNull();
  });

  it("sets fetchState to error when the invoke call itself fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useApprovalStore.getState().fetchApprovals();

    const state = useApprovalStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.approvals).toEqual([]);
  });

  it("approve calls approve_approval with the id and reason, then applies the refreshed list", async () => {
    invokeMock.mockResolvedValueOnce([approval({ id: "appr-2" })]);

    await useApprovalStore.getState().approve("appr-1", "Looks fine");

    expect(invokeMock).toHaveBeenCalledWith("approve_approval", {
      approvalId: "appr-1",
      reason: "Looks fine",
    });
    const state = useApprovalStore.getState();
    expect(state.approvals).toEqual([approval({ id: "appr-2" })]);
    expect(state.decidingIds).toEqual([]);
  });

  it("approve sends null when no reason is given", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useApprovalStore.getState().approve("appr-1");

    expect(invokeMock).toHaveBeenCalledWith("approve_approval", {
      approvalId: "appr-1",
      reason: null,
    });
  });

  it("reject calls reject_approval with the id and reason, then applies the refreshed list", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useApprovalStore.getState().reject("appr-1", "Looks wrong");

    expect(invokeMock).toHaveBeenCalledWith("reject_approval", {
      approvalId: "appr-1",
      reason: "Looks wrong",
    });
    expect(useApprovalStore.getState().approvals).toEqual([]);
  });

  it("tracks decidingIds while an approve call is in flight", async () => {
    let resolveInvoke: (value: Approval[]) => void = () => {};
    invokeMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      }),
    );

    const pending = useApprovalStore.getState().approve("appr-1");
    expect(useApprovalStore.getState().decidingIds).toEqual(["appr-1"]);

    resolveInvoke([]);
    await pending;

    expect(useApprovalStore.getState().decidingIds).toEqual([]);
  });

  it("clears the deciding id and sets an error when reject fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Approval appr-1 is already 'approved'."));

    await useApprovalStore.getState().reject("appr-1");

    const state = useApprovalStore.getState();
    expect(state.error).toContain("already 'approved'");
    expect(state.decidingIds).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetApprovalStoreForTests, useApprovalStore, type Approval } from "./approvalStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

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
  __resetApprovalStoreForTests();
  useApprovalStore.setState({
    approvals: [],
    fetchState: "idle",
    error: null,
    decidingIds: [],
    pendingCount: 0,
    history: [],
    historyFetchState: "idle",
    historyError: null,
  });
  invokeMock.mockReset();
  listenMock.mockReset();
});

describe("useApprovalStore", () => {
  it("starts idle with no approvals", () => {
    const state = useApprovalStore.getState();
    expect(state.approvals).toEqual([]);
    expect(state.fetchState).toBe("idle");
    expect(state.decidingIds).toEqual([]);
    expect(state.pendingCount).toBe(0);
  });

  it("init fetches the initial count via get_pending_approval_count", async () => {
    invokeMock.mockResolvedValue(3);
    listenMock.mockResolvedValue(() => {});

    await useApprovalStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith("get_pending_approval_count");
    expect(useApprovalStore.getState().pendingCount).toBe(3);
  });

  it("init subscribes to approvals-changed exactly once even if init is called multiple times", async () => {
    invokeMock.mockResolvedValue(0);
    listenMock.mockResolvedValue(() => {});

    await Promise.all([
      useApprovalStore.getState().init(),
      useApprovalStore.getState().init(),
      useApprovalStore.getState().init(),
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledTimes(1);
  });

  it("updates pendingCount when approvals-changed fires", async () => {
    invokeMock.mockResolvedValue(0);
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useApprovalStore.getState().init();
    expect(useApprovalStore.getState().pendingCount).toBe(0);

    emit?.({ payload: [approval(), approval({ id: "appr-2" })] });

    expect(useApprovalStore.getState().pendingCount).toBe(2);
  });

  it("updates pendingCount back to zero when the last approval is decided", async () => {
    invokeMock.mockResolvedValue(1);
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useApprovalStore.getState().init();
    expect(useApprovalStore.getState().pendingCount).toBe(1);

    emit?.({ payload: [] });

    expect(useApprovalStore.getState().pendingCount).toBe(0);
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

  it("fetchHistory calls get_approval_history with a null status by default and stores the result", async () => {
    invokeMock.mockResolvedValueOnce([
      approval({ status: "rejected", decided_at: "2026-07-18T12:05:00+00:00" }),
    ]);

    await useApprovalStore.getState().fetchHistory();

    expect(invokeMock).toHaveBeenCalledWith("get_approval_history", { status: null });
    const state = useApprovalStore.getState();
    expect(state.historyFetchState).toBe("idle");
    expect(state.history).toHaveLength(1);
    expect(state.historyError).toBeNull();
  });

  it("fetchHistory passes an explicit status filter through", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useApprovalStore.getState().fetchHistory("cancelled");

    expect(invokeMock).toHaveBeenCalledWith("get_approval_history", { status: "cancelled" });
  });

  it("sets historyFetchState to error when the invoke call itself fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useApprovalStore.getState().fetchHistory();

    const state = useApprovalStore.getState();
    expect(state.historyFetchState).toBe("error");
    expect(state.historyError).toContain("Core unreachable");
    expect(state.history).toEqual([]);
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

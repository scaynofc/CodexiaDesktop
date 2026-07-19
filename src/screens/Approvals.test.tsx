import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Approvals from "./Approvals";
import { useApprovalStore, type Approval } from "@/stores/approvalStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

// Mirrors Approvals.tsx's own POLL_INTERVAL_MS (not exported - screen-scoped
// polling is this screen's private concern, not something other code needs
// to reference).
const POLL_INTERVAL_MS = 3000;

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "appr-1",
    task_id: "task-1",
    step_id: 2,
    type: "tool",
    payload: { name: "write_file", arguments: { path: "out.txt" } },
    status: "pending",
    created_at: "2026-07-18T12:00:00+00:00",
    decided_at: null,
    expires_at: "2026-07-18T12:02:00+00:00",
    decision_reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  useApprovalStore.setState({
    approvals: [],
    fetchState: "idle",
    error: null,
    decidingIds: [],
    history: [],
    historyFetchState: "idle",
    historyError: null,
  });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});

describe("Approvals", () => {
  it("fetches pending approvals on mount", async () => {
    render(<Approvals />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_pending_approvals"));
  });

  it("shows an empty-state message when there is nothing pending", async () => {
    render(<Approvals />);

    await waitFor(() => expect(screen.getByText("No pending approvals.")).toBeInTheDocument());
  });

  it("renders a pending approval with its type badge, task/step, and payload", async () => {
    invokeMock.mockResolvedValueOnce([approval()]);

    render(<Approvals />);

    await waitFor(() => expect(screen.getByText("Tool call")).toBeInTheDocument());
    // "Pending" also names the tab button, so two matches are expected here:
    // the tab and this approval's own status badge.
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getByText(/Task: task-1/)).toBeInTheDocument();
    expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    expect(screen.getByText(/write_file/)).toBeInTheDocument();
  });

  it("renders a memory approval with its own type label", async () => {
    invokeMock.mockResolvedValueOnce([
      approval({ id: "appr-2", type: "memory", payload: { key: "stack", value: "FastAPI" } }),
    ]);

    render(<Approvals />);

    await waitFor(() => expect(screen.getByText("Memory write")).toBeInTheDocument());
  });

  it("clicking Approve calls approve_approval with the id and typed reason", async () => {
    invokeMock.mockResolvedValueOnce([approval()]);
    invokeMock.mockResolvedValueOnce([]);

    render(<Approvals />);
    await waitFor(() => expect(screen.getByText("Tool call")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Optional reason"), {
      target: { value: "Looks fine" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("approve_approval", {
        approvalId: "appr-1",
        reason: "Looks fine",
      }),
    );
  });

  it("clicking Reject calls reject_approval with no reason when the field is left blank", async () => {
    invokeMock.mockResolvedValueOnce([approval()]);
    invokeMock.mockResolvedValueOnce([]);

    render(<Approvals />);
    await waitFor(() => expect(screen.getByText("Tool call")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("reject_approval", {
        approvalId: "appr-1",
        reason: null,
      }),
    );
  });

  it("a decided approval disappears once the refreshed list applies", async () => {
    invokeMock.mockResolvedValueOnce([approval()]);
    invokeMock.mockResolvedValueOnce([]);

    render(<Approvals />);
    await waitFor(() => expect(screen.getByText("Tool call")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByText("No pending approvals.")).toBeInTheDocument());
  });

  it("clicking Refresh calls get_pending_approvals again", async () => {
    render(<Approvals />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when the underlying invoke call fails", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Approvals />);

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });

  describe("screen-scoped polling", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("polls again after the interval elapses while mounted", async () => {
      render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(invokeMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it("stops polling once the screen unmounts", async () => {
      const { unmount } = render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(invokeMock).toHaveBeenCalledTimes(1);

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      });
      expect(invokeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("countdown", () => {
    const COUNTDOWN_TICK_MS = 1000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("shows the remaining time for a pending approval", async () => {
      invokeMock.mockResolvedValueOnce([approval({ expires_at: "2026-07-18T12:02:00.000Z" })]);

      render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText("Expires in 120s")).toBeInTheDocument();
    });

    it("ticks down every second independently of the poll interval", async () => {
      invokeMock.mockResolvedValue([approval({ expires_at: "2026-07-18T12:02:00.000Z" })]);

      render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("Expires in 120s")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(COUNTDOWN_TICK_MS * 3);
      });

      expect(screen.getByText("Expires in 117s")).toBeInTheDocument();
    });

    it("shows Expired once the countdown reaches zero", async () => {
      invokeMock.mockResolvedValue([approval({ expires_at: "2026-07-18T12:00:02.000Z" })]);

      render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("Expires in 2s")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(COUNTDOWN_TICK_MS * 2);
      });

      expect(screen.getByText("Expired")).toBeInTheDocument();
    });

    it("does not show a countdown for a decided (non-pending) approval", async () => {
      invokeMock.mockResolvedValueOnce([
        approval({ status: "approved", expires_at: "2026-07-18T12:02:00.000Z" }),
      ]);

      render(<Approvals />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
    });
  });

  describe("History tab", () => {
    it("does not fetch history until the History tab is selected", async () => {
      render(<Approvals />);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_pending_approvals"));

      expect(invokeMock).not.toHaveBeenCalledWith("get_approval_history", expect.anything());
    });

    it("fetches and renders history once the History tab is selected", async () => {
      invokeMock.mockResolvedValueOnce([]); // get_pending_approvals on mount
      invokeMock.mockResolvedValueOnce([
        approval({
          status: "rejected",
          decided_at: "2026-07-18T12:05:00+00:00",
          decision_reason: "Looks wrong",
        }),
      ]);

      render(<Approvals />);
      fireEvent.click(screen.getByText("History"));

      await waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith("get_approval_history", { status: null }),
      );
      expect(await screen.findByText("Reason: Looks wrong")).toBeInTheDocument();
    });

    it("shows an empty-state message when there is no history yet", async () => {
      render(<Approvals />);
      fireEvent.click(screen.getByText("History"));

      await waitFor(() => expect(screen.getByText("No approval history yet.")).toBeInTheDocument());
    });

    it("does not render Approve/Reject actions for a history entry", async () => {
      invokeMock.mockResolvedValueOnce([]); // get_pending_approvals on mount
      invokeMock.mockResolvedValueOnce([approval({ status: "approved" })]);

      render(<Approvals />);
      fireEvent.click(screen.getByText("History"));

      await waitFor(() => expect(screen.getAllByText("Approved")).toHaveLength(2));
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    });

    it("re-fetches with the selected status filter", async () => {
      invokeMock.mockResolvedValueOnce([]); // get_pending_approvals on mount
      invokeMock.mockResolvedValue([]); // every subsequent history fetch

      render(<Approvals />);
      fireEvent.click(screen.getByText("History"));
      await waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith("get_approval_history", { status: null }),
      );

      fireEvent.click(screen.getByText("Cancelled"));

      await waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith("get_approval_history", { status: "cancelled" }),
      );
    });
  });
});

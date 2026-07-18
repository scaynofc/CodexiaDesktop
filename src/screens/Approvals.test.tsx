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
  useApprovalStore.setState({ approvals: [], fetchState: "idle", error: null, decidingIds: [] });
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
    expect(screen.getByText("Pending")).toBeInTheDocument();
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
});

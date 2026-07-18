import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Log from "./Log";
import { useEventsStore, type SystemEvent } from "@/stores/eventsStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function event(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    timestamp: "2026-07-17T12:00:00+00:00",
    type: "error",
    source: "provider",
    message: "openrouter/model-a failed (rate_limit)",
    task_id: null,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  useEventsStore.setState({ events: [], fetchState: "idle", error: null });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});

describe("Log", () => {
  it("fetches events on mount", async () => {
    render(<Log />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_events", { limit: 100 }));
  });

  it("shows an empty-state message when nothing has been recorded", async () => {
    render(<Log />);

    await waitFor(() => expect(screen.getByText("No events recorded yet.")).toBeInTheDocument());
  });

  it("renders events with their type badge and message", async () => {
    invokeMock.mockResolvedValueOnce([
      event({ type: "error", message: "openrouter/model-a failed (rate_limit)" }),
      event({ type: "warning", source: "task", message: "Task cancelled by user" }),
    ]);

    render(<Log />);

    await waitFor(() =>
      expect(screen.getByText("openrouter/model-a failed (rate_limit)")).toBeInTheDocument(),
    );
    expect(screen.getByText("Task cancelled by user")).toBeInTheDocument();
    // "Error"/"Warning" also appear as filter button labels, so at least one
    // extra occurrence beyond the event's own badge is expected.
    expect(screen.getAllByText("Error").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Warning").length).toBeGreaterThanOrEqual(1);
  });

  it("clicking an event shows its details, including metadata", async () => {
    invokeMock.mockResolvedValueOnce([
      event({
        message: "openrouter/model-a failed (rate_limit)",
        task_id: "task-1",
        metadata: { kind: "rate_limit" },
      }),
    ]);

    render(<Log />);

    await waitFor(() =>
      expect(screen.getByText("openrouter/model-a failed (rate_limit)")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("openrouter/model-a failed (rate_limit)"));

    expect(screen.getByText("Task: task-1")).toBeInTheDocument();
    expect(screen.getByText("kind")).toBeInTheDocument();
    expect(screen.getByText("rate_limit")).toBeInTheDocument();
  });

  it("filtering by type narrows the visible events", async () => {
    invokeMock.mockResolvedValueOnce([
      event({ type: "error", message: "provider error message" }),
      event({ type: "warning", source: "task", message: "task cancelled message" }),
    ]);

    render(<Log />);

    await waitFor(() => expect(screen.getByText("provider error message")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Warning" }));

    expect(screen.queryByText("provider error message")).not.toBeInTheDocument();
    expect(screen.getByText("task cancelled message")).toBeInTheDocument();
  });

  it("filtering by source narrows the visible events", async () => {
    invokeMock.mockResolvedValueOnce([
      event({ source: "provider", message: "provider error message" }),
      event({ source: "task", type: "warning", message: "task cancelled message" }),
    ]);

    render(<Log />);

    await waitFor(() => expect(screen.getByText("provider error message")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Task" }));

    expect(screen.queryByText("provider error message")).not.toBeInTheDocument();
    expect(screen.getByText("task cancelled message")).toBeInTheDocument();
  });

  it("filtering by the approval source narrows the visible events", async () => {
    invokeMock.mockResolvedValueOnce([
      event({ source: "provider", message: "provider error message" }),
      event({
        source: "approval",
        type: "warning",
        message: "tool approval rejected (Too dangerous.)",
      }),
    ]);

    render(<Log />);

    await waitFor(() => expect(screen.getByText("provider error message")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Approval" }));

    expect(screen.queryByText("provider error message")).not.toBeInTheDocument();
    expect(screen.getByText("tool approval rejected (Too dangerous.)")).toBeInTheDocument();
  });

  it("shows a filtered-empty message distinct from the fully-empty one", async () => {
    invokeMock.mockResolvedValueOnce([event({ type: "error" })]);

    render(<Log />);

    await waitFor(() =>
      expect(screen.getByText("openrouter/model-a failed (rate_limit)")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Warning" }));

    expect(screen.getByText("No events match the current filters.")).toBeInTheDocument();
  });

  it("clicking Refresh calls get_events again", async () => {
    render(<Log />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when the underlying invoke call fails", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Log />);

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });
});

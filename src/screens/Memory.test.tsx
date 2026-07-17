import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Memory from "./Memory";
import { useMemoryStore, type MemoryItem } from "@/stores/memoryStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function item(key: string, overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: `id-${key}`,
    project_id: "proj-1",
    key,
    value: `Value for ${key}`,
    type: "fact",
    version: 1,
    superseded_by: null,
    importance_score: 0.5,
    tags: [],
    source_session_id: null,
    access_count: 0,
    last_accessed_at: null,
    expires_at: null,
    created_at: "2026-07-16T00:00:00+00:00",
    updated_at: "2026-07-16T00:00:00+00:00",
    ...overrides,
  };
}

beforeEach(() => {
  useMemoryStore.setState({ items: [], fetchState: "idle", error: null });
  invokeMock.mockReset();
});

describe("Memory", () => {
  it("does not fetch anything before a project id is entered", () => {
    render(<Memory />);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Enter a project id to browse its governed memory (matches the CLI's --project).",
      ),
    ).toBeInTheDocument();
  });

  it("fetches and renders items once a project id is submitted", async () => {
    invokeMock.mockResolvedValueOnce([item("stack", { value: "FastAPI + SQLite" })]);

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), { target: { value: "proj-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(invokeMock).toHaveBeenCalledWith("get_project_memory", { projectId: "proj-1" });
    await waitFor(() => expect(screen.getByText("stack")).toBeInTheDocument());
    expect(screen.getByText("FastAPI + SQLite")).toBeInTheDocument();
  });

  it("trims the project id before submitting", async () => {
    invokeMock.mockResolvedValueOnce([]);

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), {
      target: { value: "  proj-1  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("get_project_memory", { projectId: "proj-1" }),
    );
  });

  it("shows a not-found-yet message for a project with no items", async () => {
    invokeMock.mockResolvedValueOnce([]);

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), {
      target: { value: "empty-proj" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() =>
      expect(screen.getByText('No memory items for project "empty-proj" yet.')).toBeInTheDocument(),
    );
  });

  it("does not submit with a blank project id", () => {
    render(<Memory />);

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("renders tags when present", async () => {
    invokeMock.mockResolvedValueOnce([item("stack", { tags: ["backend", "infra"] })]);

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), { target: { value: "proj-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => expect(screen.getByText("backend")).toBeInTheDocument());
    expect(screen.getByText("infra")).toBeInTheDocument();
  });

  it("clicking Forget calls forget_project_memory with the item's key and project id", async () => {
    invokeMock.mockResolvedValueOnce([item("stack")]);
    invokeMock.mockResolvedValueOnce([]);

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), { target: { value: "proj-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByText("stack")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Forget" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("forget_project_memory", {
        projectId: "proj-1",
        key: "stack",
      }),
    );
  });

  it("shows an error message when the fetch fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Memory />);
    fireEvent.change(screen.getByPlaceholderText("Project id"), { target: { value: "proj-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });
});

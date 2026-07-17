import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStore, type MemoryItem } from "./memoryStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function item(key: string, overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: "item-1",
    project_id: "proj-1",
    key,
    value: "some value",
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

describe("useMemoryStore", () => {
  it("starts idle with no items", () => {
    const state = useMemoryStore.getState();
    expect(state.items).toEqual([]);
    expect(state.fetchState).toBe("idle");
  });

  it("fetchMemory calls get_project_memory with the given project id", async () => {
    invokeMock.mockResolvedValueOnce([item("stack")]);

    await useMemoryStore.getState().fetchMemory("proj-1");

    expect(invokeMock).toHaveBeenCalledWith("get_project_memory", { projectId: "proj-1" });
    const state = useMemoryStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.fetchState).toBe("idle");
  });

  it("sets fetchState to error when the fetch fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useMemoryStore.getState().fetchMemory("proj-1");

    const state = useMemoryStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
  });

  it("forgetKey calls forget_project_memory and applies the refreshed list", async () => {
    invokeMock.mockResolvedValueOnce([item("kept")]);

    await useMemoryStore.getState().forgetKey("proj-1", "stack");

    expect(invokeMock).toHaveBeenCalledWith("forget_project_memory", {
      projectId: "proj-1",
      key: "stack",
    });
    const state = useMemoryStore.getState();
    expect(state.items).toEqual([item("kept")]);
    expect(state.fetchState).toBe("idle");
  });

  it("sets fetchState to error when forgetting fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useMemoryStore.getState().forgetKey("proj-1", "stack");

    expect(useMemoryStore.getState().fetchState).toBe("error");
  });
});

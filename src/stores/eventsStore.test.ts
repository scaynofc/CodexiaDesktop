import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEventsStore, type SystemEvent } from "./eventsStore";

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
});

describe("useEventsStore", () => {
  it("starts idle with no events", () => {
    const state = useEventsStore.getState();
    expect(state.events).toEqual([]);
    expect(state.fetchState).toBe("idle");
  });

  it("fetchEvents calls get_events with the default limit and stores the result", async () => {
    invokeMock.mockResolvedValueOnce([event()]);

    await useEventsStore.getState().fetchEvents();

    expect(invokeMock).toHaveBeenCalledWith("get_events", { limit: 100 });
    const state = useEventsStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.events).toHaveLength(1);
    expect(state.error).toBeNull();
  });

  it("fetchEvents passes through an explicit limit", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useEventsStore.getState().fetchEvents(25);

    expect(invokeMock).toHaveBeenCalledWith("get_events", { limit: 25 });
  });

  it("stores an empty list without treating it as a fetch error", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useEventsStore.getState().fetchEvents();

    const state = useEventsStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.events).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("sets fetchState to error when the invoke call itself fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useEventsStore.getState().fetchEvents();

    const state = useEventsStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.events).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCapabilityStore, type Capability } from "./capabilityStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function capability(overrides: Partial<Capability> = {}): Capability {
  return {
    name: "read_file",
    description: "Reads a file.",
    parameters: { type: "object", properties: {} },
    requires_approval: false,
    source: "built_in",
    ...overrides,
  };
}

beforeEach(() => {
  useCapabilityStore.setState({ capabilities: [], fetchState: "idle", error: null });
  invokeMock.mockReset();
});

describe("useCapabilityStore", () => {
  it("starts idle with no capabilities", () => {
    const state = useCapabilityStore.getState();
    expect(state.capabilities).toEqual([]);
    expect(state.fetchState).toBe("idle");
  });

  it("fetchCapabilities calls get_capabilities and stores the result", async () => {
    invokeMock.mockResolvedValueOnce([capability()]);

    await useCapabilityStore.getState().fetchCapabilities();

    expect(invokeMock).toHaveBeenCalledWith("get_capabilities");
    const state = useCapabilityStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.capabilities).toHaveLength(1);
    expect(state.capabilities[0].name).toBe("read_file");
    expect(state.error).toBeNull();
  });

  it("stores an mcp-sourced capability without treating it differently", async () => {
    invokeMock.mockResolvedValueOnce([
      capability({ name: "mcp__github__create_issue", source: "mcp", requires_approval: true }),
    ]);

    await useCapabilityStore.getState().fetchCapabilities();

    expect(useCapabilityStore.getState().capabilities[0].source).toBe("mcp");
  });

  it("stores an empty registry without treating it as a fetch error", async () => {
    invokeMock.mockResolvedValueOnce([]);

    await useCapabilityStore.getState().fetchCapabilities();

    const state = useCapabilityStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.capabilities).toEqual([]);
    expect(state.error).toBeNull();
  });

  it("sets fetchState to error when the invoke call itself fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useCapabilityStore.getState().fetchCapabilities();

    const state = useCapabilityStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.capabilities).toEqual([]);
  });
});

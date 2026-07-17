import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeStore, type OllamaRuntimeStatus } from "./runtimeStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function status(overrides: Partial<OllamaRuntimeStatus> = {}): OllamaRuntimeStatus {
  return {
    reachable: true,
    models: [{ name: "qwen2.5:7b", size_vram_bytes: 4800000, expires_at: "2026-07-17T12:00:00Z" }],
    ...overrides,
  };
}

beforeEach(() => {
  useRuntimeStore.setState({ runtime: null, fetchState: "idle", error: null });
  invokeMock.mockReset();
});

describe("useRuntimeStore", () => {
  it("starts idle with no runtime status", () => {
    const state = useRuntimeStore.getState();
    expect(state.runtime).toBeNull();
    expect(state.fetchState).toBe("idle");
  });

  it("fetchRuntime calls get_ollama_runtime and stores the result", async () => {
    invokeMock.mockResolvedValueOnce(status());

    await useRuntimeStore.getState().fetchRuntime();

    expect(invokeMock).toHaveBeenCalledWith("get_ollama_runtime");
    const state = useRuntimeStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.runtime?.reachable).toBe(true);
    expect(state.error).toBeNull();
  });

  it("stores an unreachable status without treating it as a fetch error", async () => {
    invokeMock.mockResolvedValueOnce(status({ reachable: false, models: [] }));

    await useRuntimeStore.getState().fetchRuntime();

    const state = useRuntimeStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.runtime?.reachable).toBe(false);
    expect(state.error).toBeNull();
  });

  it("sets fetchState to error when the invoke call itself fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useRuntimeStore.getState().fetchRuntime();

    const state = useRuntimeStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.runtime).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMetricsStore, type MetricsSnapshot } from "./metricsStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function snapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    total_cost_usd: 1.23,
    total_calls: 4,
    daily_costs: [{ date: "2026-07-17", calls: 4, total_tokens: 1000, cost_usd: 1.23 }],
    model_health: [
      {
        provider: "ollama",
        model: "qwen2.5:7b",
        sample_count: 4,
        success_rate: 1,
        median_latency_ms: 500,
        avg_cost_usd: null,
        consecutive_failures: 0,
        in_cooldown: false,
      },
    ],
    router_accuracy: 1,
    router_accuracy_by_role: { coder: 1, planner: null },
    ...overrides,
  };
}

beforeEach(() => {
  useMetricsStore.setState({ snapshot: null, status: "idle", error: null });
  invokeMock.mockReset();
});

describe("useMetricsStore", () => {
  it("starts idle with no snapshot", () => {
    const state = useMetricsStore.getState();
    expect(state.snapshot).toBeNull();
    expect(state.status).toBe("idle");
  });

  it("fetchMetrics calls get_metrics and stores the result", async () => {
    invokeMock.mockResolvedValueOnce(snapshot());

    await useMetricsStore.getState().fetchMetrics();

    expect(invokeMock).toHaveBeenCalledWith("get_metrics");
    const state = useMetricsStore.getState();
    expect(state.status).toBe("idle");
    expect(state.snapshot?.total_calls).toBe(4);
    expect(state.error).toBeNull();
  });

  it("sets status to loading while the call is in flight", () => {
    let resolveInvoke: (value: MetricsSnapshot) => void = () => {};
    invokeMock.mockReturnValueOnce(
      new Promise<MetricsSnapshot>((resolve) => {
        resolveInvoke = resolve;
      }),
    );

    const promise = useMetricsStore.getState().fetchMetrics();

    expect(useMetricsStore.getState().status).toBe("loading");
    resolveInvoke(snapshot());
    return promise;
  });

  it("sets status to error and records the message when get_metrics rejects", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useMetricsStore.getState().fetchMetrics();

    const state = useMetricsStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.snapshot).toBeNull();
  });

  it("clears a previous error on a new fetch attempt", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    await useMetricsStore.getState().fetchMetrics();
    expect(useMetricsStore.getState().error).not.toBeNull();

    invokeMock.mockResolvedValueOnce(snapshot());
    await useMetricsStore.getState().fetchMetrics();

    expect(useMetricsStore.getState().error).toBeNull();
    expect(useMetricsStore.getState().status).toBe("idle");
  });
});

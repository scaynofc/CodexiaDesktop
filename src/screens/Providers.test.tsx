import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Providers from "./Providers";
import { useMetricsStore, type MetricsSnapshot } from "@/stores/metricsStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function snapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    total_cost_usd: 1.23,
    total_calls: 4,
    daily_costs: [],
    model_health: [],
    router_accuracy: 1,
    router_accuracy_by_role: { coder: 1, planner: null },
    ...overrides,
  };
}

beforeEach(() => {
  useMetricsStore.setState({ snapshot: null, status: "idle", error: null });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(snapshot());
});

describe("Providers", () => {
  it("fetches metrics on mount", async () => {
    render(<Providers />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_metrics"));
  });

  it("shows a loading placeholder before the first snapshot arrives", () => {
    invokeMock.mockReturnValueOnce(new Promise(() => {}));

    render(<Providers />);

    expect(screen.getByText("Loading metrics…")).toBeInTheDocument();
  });

  it("shows summary totals once a snapshot loads", async () => {
    invokeMock.mockResolvedValueOnce(
      snapshot({
        total_cost_usd: 0.42,
        total_calls: 11,
        router_accuracy: 0.75,
        router_accuracy_by_role: {},
      }),
    );

    render(<Providers />);

    await waitFor(() => expect(screen.getByText("$0.4200")).toBeInTheDocument());
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  it("renders Unknown for a null total cost rather than $0", async () => {
    invokeMock.mockResolvedValueOnce(snapshot({ total_cost_usd: null }));

    render(<Providers />);

    await waitFor(() => expect(screen.getByText("Unknown")).toBeInTheDocument());
  });

  it("renders router accuracy by role, including a null accuracy as an em dash", async () => {
    render(<Providers />);

    await waitFor(() => expect(screen.getByText("Coder")).toBeInTheDocument());
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a placeholder when there is no model health data yet", async () => {
    render(<Providers />);

    await waitFor(() =>
      expect(screen.getByText("No model activity recorded yet.")).toBeInTheDocument(),
    );
  });

  it("renders model health entries with provider badge, cooldown, and formatted stats", async () => {
    invokeMock.mockResolvedValueOnce(
      snapshot({
        model_health: [
          {
            provider: "ollama",
            model: "qwen2.5:7b",
            sample_count: 11,
            success_rate: 0.9090909090909091,
            median_latency_ms: 850.5,
            avg_cost_usd: null,
            consecutive_failures: 2,
            in_cooldown: true,
          },
        ],
      }),
    );

    render(<Providers />);

    await waitFor(() => expect(screen.getByText("qwen2.5:7b")).toBeInTheDocument());
    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("In cooldown")).toBeInTheDocument();
    expect(screen.getByText("90.9% (11 calls)")).toBeInTheDocument();
    expect(screen.getByText("851 ms")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show a cooldown badge or failure count for a healthy model", async () => {
    invokeMock.mockResolvedValueOnce(
      snapshot({
        model_health: [
          {
            provider: "openrouter",
            model: "model-a",
            sample_count: 5,
            success_rate: 1,
            median_latency_ms: 200,
            avg_cost_usd: 0.001,
            consecutive_failures: 0,
            in_cooldown: false,
          },
        ],
      }),
    );

    render(<Providers />);

    await waitFor(() => expect(screen.getByText("model-a")).toBeInTheDocument());
    expect(screen.queryByText("In cooldown")).not.toBeInTheDocument();
    expect(screen.queryByText("Consecutive failures")).not.toBeInTheDocument();
  });

  it("clicking Refresh calls get_metrics again", async () => {
    render(<Providers />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when the fetch fails", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Providers />);

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });
});

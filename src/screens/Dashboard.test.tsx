import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Dashboard from "./Dashboard";
import { useConnectionStore, type HealthResponse } from "@/stores/connectionStore";

function setStatus(health: HealthResponse | null) {
  useConnectionStore.setState({
    status: { state: "Connected", health, restarted: false },
  });
}

describe("Dashboard", () => {
  it("shows a waiting message when there is no health payload yet", () => {
    setStatus(null);

    render(<Dashboard />);

    expect(screen.getByText(/Waiting for Codexia Core/)).toBeInTheDocument();
  });

  it("shows the health details once a payload arrives", () => {
    setStatus({
      status: "ok",
      alive: true,
      core_version: "2.0.0",
      api_version: 1,
      protocol_version: 1,
      instance_id: "abcdef1234567890",
      timestamp: "2026-07-16T00:00:00+00:00",
    });

    render(<Dashboard />);

    expect(screen.getByText("2.0.0")).toBeInTheDocument();
    expect(screen.getByText("abcdef12")).toBeInTheDocument();
    // api_version and protocol_version are both "1" - assert there are two
    // distinct values shown rather than a single ambiguous getByText("1").
    expect(screen.getAllByText("1")).toHaveLength(2);
  });
});

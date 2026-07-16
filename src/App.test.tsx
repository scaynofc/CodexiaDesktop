import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { __resetConnectionStoreForTests, useConnectionStore } from "@/stores/connectionStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

beforeEach(() => {
  __resetConnectionStoreForTests();
  useConnectionStore.setState({ status: { state: "Connecting", health: null, restarted: false } });
  invokeMock.mockReset();
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => {});
});

describe("App", () => {
  it("shows Connecting before the initial status arrives", () => {
    invokeMock.mockReturnValue(new Promise(() => {})); // never resolves in this test

    render(<App />);

    expect(screen.getByRole("heading", { name: "Codexia Desktop" })).toBeInTheDocument();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Codexia Core/)).toBeInTheDocument();
  });

  it("shows Connected with Core version details once the initial status resolves", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: {
        status: "ok",
        alive: true,
        core_version: "2.0.0",
        api_version: 1,
        protocol_version: 1,
        instance_id: "abcdef1234567890",
        timestamp: "2026-07-16T00:00:00+00:00",
      },
      restarted: false,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
    expect(screen.getByText("2.0.0")).toBeInTheDocument();
    expect(screen.getByText("abcdef12")).toBeInTheDocument();
    expect(screen.queryByText("Core restarted")).not.toBeInTheDocument();
  });

  it("shows a restart badge when the status reports one", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: {
        status: "ok",
        alive: true,
        core_version: "2.0.0",
        api_version: 1,
        protocol_version: 1,
        instance_id: "new-instance",
        timestamp: "2026-07-16T00:00:00+00:00",
      },
      restarted: true,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Core restarted")).toBeInTheDocument());
  });
});

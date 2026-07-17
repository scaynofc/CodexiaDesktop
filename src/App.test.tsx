import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { NAV_ITEMS } from "@/shell/navigation";
import { __resetConnectionStoreForTests, useConnectionStore } from "@/stores/connectionStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

beforeEach(() => {
  __resetConnectionStoreForTests();
  useConnectionStore.setState({
    status: { state: "Connecting", health: null, restarted: false },
    showRestartNotice: false,
  });
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockReturnValue(new Promise(() => {})); // never resolves - status detail isn't this test's concern
  listenMock.mockResolvedValue(() => {});
});

describe("App shell", () => {
  it("renders the sidebar with every planned screen", () => {
    render(<App />);

    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    for (const item of NAV_ITEMS) {
      expect(nav.getByText(item.label)).toBeInTheDocument();
    }
  });

  it("shows Dashboard on the default route", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Codexia Core/)).toBeInTheDocument();
  });

  it("does not let a disabled item navigate anywhere", () => {
    render(<App />);

    const gpuButton = screen.getByRole("button", { name: /GPU Center/ });
    expect(gpuButton).toBeDisabled();
    // Still on Dashboard - clicking (were it possible) has nowhere to go.
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});

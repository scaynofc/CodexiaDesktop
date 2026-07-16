import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import AppHeader from "./AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { __resetConnectionStoreForTests, useConnectionStore } from "@/stores/connectionStore";

function health(instanceId: string) {
  return {
    status: "ok",
    alive: true,
    core_version: "2.0.0",
    api_version: 1,
    protocol_version: 1,
    instance_id: instanceId,
    timestamp: "2026-07-16T00:00:00+00:00",
  };
}

function renderHeader(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <AppHeader />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  __resetConnectionStoreForTests();
  useConnectionStore.setState({
    status: { state: "Connecting", health: null, restarted: false },
    showRestartNotice: false,
  });
});

describe("AppHeader", () => {
  it("shows the current connection state", () => {
    useConnectionStore.setState({
      status: { state: "Connected", health: health("boot-1"), restarted: false },
    });

    renderHeader();

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText("Core restarted")).not.toBeInTheDocument();
  });

  it("shows the page title for the current route", () => {
    renderHeader("/");

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("raises a restart notice that survives a later same-instance update, until dismissed", () => {
    useConnectionStore.setState({
      status: { state: "Connected", health: health("boot-1"), restarted: false },
    });
    renderHeader();

    // Core restarted: a genuinely new instance_id arrives.
    act(() => {
      useConnectionStore.setState({
        status: { state: "Connected", health: health("boot-2"), restarted: true },
        showRestartNotice: true,
      });
    });
    expect(screen.getByText("Core restarted")).toBeInTheDocument();

    // A later poll with the same instance must not clear it on its own.
    act(() => {
      useConnectionStore.setState({
        status: { state: "Connected", health: health("boot-2"), restarted: false },
      });
    });
    expect(screen.getByText("Core restarted")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Core restarted")).not.toBeInTheDocument();
  });
});

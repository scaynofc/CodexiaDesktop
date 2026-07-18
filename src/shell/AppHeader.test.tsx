import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import AppHeader from "./AppHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  __resetConnectionStoreForTests,
  useConnectionStore,
  type HealthResponse,
} from "@/stores/connectionStore";

function health(instanceId: string, overrides: Partial<HealthResponse> = {}) {
  return {
    status: "ok",
    alive: true,
    core_version: "2.0.0",
    api_version: 1,
    protocol_version: 1,
    instance_id: instanceId,
    timestamp: "2026-07-16T00:00:00+00:00",
    ...overrides,
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
    status: {
      state: "Connecting",
      health: null,
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    },
    showRestartNotice: false,
  });
});

describe("AppHeader", () => {
  it("shows the current connection state", () => {
    useConnectionStore.setState({
      status: {
        state: "Connected",
        health: health("boot-1"),
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
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
      status: {
        state: "Connected",
        health: health("boot-1"),
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    renderHeader();

    // Core restarted: a genuinely new instance_id arrives.
    act(() => {
      useConnectionStore.setState({
        status: {
          state: "Connected",
          health: health("boot-2"),
          restarted: true,
          api_compatible: true,
          protocol_compatible: true,
        },
        showRestartNotice: true,
      });
    });
    expect(screen.getByText("Core restarted")).toBeInTheDocument();

    // A later poll with the same instance must not clear it on its own.
    act(() => {
      useConnectionStore.setState({
        status: {
          state: "Connected",
          health: health("boot-2"),
          restarted: false,
          api_compatible: true,
          protocol_compatible: true,
        },
      });
    });
    expect(screen.getByText("Core restarted")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByText("Core restarted")).not.toBeInTheDocument();
  });

  it("shows no version-mismatch banner when versions match", () => {
    useConnectionStore.setState({
      status: {
        state: "Connected",
        health: health("boot-1"),
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
    });

    renderHeader();

    expect(screen.queryByText(/Incompatible Core/)).not.toBeInTheDocument();
  });

  it("shows a version-mismatch banner naming the incompatible axis", () => {
    useConnectionStore.setState({
      status: {
        state: "Connected",
        health: health("boot-1", { api_version: 2 }),
        restarted: false,
        api_compatible: false,
        protocol_compatible: true,
      },
    });

    renderHeader();

    expect(screen.getByText("Incompatible Core (API v2)")).toBeInTheDocument();
  });

  it("names both axes when both are incompatible", () => {
    useConnectionStore.setState({
      status: {
        state: "Connected",
        health: health("boot-1", { api_version: 2, protocol_version: 3 }),
        restarted: false,
        api_compatible: false,
        protocol_compatible: false,
      },
    });

    renderHeader();

    expect(screen.getByText("Incompatible Core (API v2, protocol v3)")).toBeInTheDocument();
  });

  it("the version-mismatch banner is not dismissible", () => {
    useConnectionStore.setState({
      status: {
        state: "Connected",
        health: health("boot-1", { api_version: 2 }),
        restarted: false,
        api_compatible: false,
        protocol_compatible: true,
      },
    });

    renderHeader();

    expect(screen.getByText("Incompatible Core (API v2)")).toBeInTheDocument();
    expect(screen.queryByText("Dismiss")).not.toBeInTheDocument();
  });
});

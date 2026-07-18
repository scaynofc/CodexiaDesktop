import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetConnectionStoreForTests, useConnectionStore } from "./connectionStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

function health(instanceId: string) {
  return {
    status: "ok",
    alive: true,
    core_version: "2.0.0",
    api_version: 1,
    protocol_version: 1,
    instance_id: instanceId,
    timestamp: "2026-07-16T00:00:00+00:00",
    max_task_cost_usd: null,
  };
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
  invokeMock.mockReset();
  listenMock.mockReset();
});

describe("useConnectionStore", () => {
  it("fetches the initial status via get_connection_status on init", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: health("boot-1"),
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    listenMock.mockResolvedValue(() => {});

    await useConnectionStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith("get_connection_status");
    expect(useConnectionStore.getState().status.state).toBe("Connected");
    expect(useConnectionStore.getState().status.health?.core_version).toBe("2.0.0");
  });

  it("subscribes to connection-status-changed exactly once even if init is called multiple times", async () => {
    invokeMock.mockResolvedValue({
      state: "Connecting",
      health: null,
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    listenMock.mockResolvedValue(() => {});

    await Promise.all([
      useConnectionStore.getState().init(),
      useConnectionStore.getState().init(),
      useConnectionStore.getState().init(),
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledTimes(1);
  });

  it("updates the store when connection-status-changed fires", async () => {
    invokeMock.mockResolvedValue({
      state: "Connecting",
      health: null,
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useConnectionStore.getState().init();
    emit?.({
      payload: {
        state: "Reconnecting",
        health: null,
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
    });

    expect(useConnectionStore.getState().status.state).toBe("Reconnecting");
  });

  it("does not raise the restart notice on the very first status it ever sees", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: health("boot-1"),
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    listenMock.mockResolvedValue(() => {});

    await useConnectionStore.getState().init();

    expect(useConnectionStore.getState().showRestartNotice).toBe(false);
  });

  it("raises the restart notice when instance_id changes across updates, and it persists across a subsequent same-instance update", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: health("boot-1"),
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useConnectionStore.getState().init();
    expect(useConnectionStore.getState().showRestartNotice).toBe(false);

    // Core restarted: a genuinely new instance_id arrives.
    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-2"),
        restarted: true,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    expect(useConnectionStore.getState().showRestartNotice).toBe(true);

    // The Rust-side `restarted` flag is transient and would already be back
    // to `false` on this next poll (same instance, no change) - the notice
    // must stay visible anyway, since the user hasn't dismissed it yet.
    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-2"),
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    expect(useConnectionStore.getState().showRestartNotice).toBe(true);
  });

  it("clears the restart notice on dismissRestartNotice and does not bring it back for the same instance", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: health("boot-1"),
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useConnectionStore.getState().init();
    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-2"),
        restarted: true,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    expect(useConnectionStore.getState().showRestartNotice).toBe(true);

    useConnectionStore.getState().dismissRestartNotice();
    expect(useConnectionStore.getState().showRestartNotice).toBe(false);

    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-2"),
        restarted: false,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    expect(useConnectionStore.getState().showRestartNotice).toBe(false);
  });

  it("re-raises the restart notice for a further, different instance after a dismiss", async () => {
    invokeMock.mockResolvedValue({
      state: "Connected",
      health: health("boot-1"),
      restarted: false,
      api_compatible: true,
      protocol_compatible: true,
    });
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useConnectionStore.getState().init();
    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-2"),
        restarted: true,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    useConnectionStore.getState().dismissRestartNotice();
    expect(useConnectionStore.getState().showRestartNotice).toBe(false);

    emit?.({
      payload: {
        state: "Connected",
        health: health("boot-3"),
        restarted: true,
        api_compatible: true,
        protocol_compatible: true,
      },
    });
    expect(useConnectionStore.getState().showRestartNotice).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetConnectionStoreForTests, useConnectionStore } from "./connectionStore";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

const initialHealth = {
  status: "ok",
  alive: true,
  core_version: "2.0.0",
  api_version: 1,
  protocol_version: 1,
  instance_id: "boot-1",
  timestamp: "2026-07-16T00:00:00+00:00",
};

beforeEach(() => {
  __resetConnectionStoreForTests();
  useConnectionStore.setState({ status: { state: "Connecting", health: null, restarted: false } });
  invokeMock.mockReset();
  listenMock.mockReset();
});

describe("useConnectionStore", () => {
  it("fetches the initial status via get_connection_status on init", async () => {
    invokeMock.mockResolvedValue({ state: "Connected", health: initialHealth, restarted: false });
    listenMock.mockResolvedValue(() => {});

    await useConnectionStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith("get_connection_status");
    expect(useConnectionStore.getState().status.state).toBe("Connected");
    expect(useConnectionStore.getState().status.health?.core_version).toBe("2.0.0");
  });

  it("subscribes to connection-status-changed exactly once even if init is called multiple times", async () => {
    invokeMock.mockResolvedValue({ state: "Connecting", health: null, restarted: false });
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
    invokeMock.mockResolvedValue({ state: "Connecting", health: null, restarted: false });
    let emit: ((event: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(
      (_event: string, callback: (event: { payload: unknown }) => void) => {
        emit = callback;
        return Promise.resolve(() => {});
      },
    );

    await useConnectionStore.getState().init();
    emit?.({ payload: { state: "Reconnecting", health: null, restarted: false } });

    expect(useConnectionStore.getState().status.state).toBe("Reconnecting");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSettingsStoreForTests, useSettingsStore, type Config } from "./settingsStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function config(overrides: Partial<Config> = {}): Config {
  return {
    core_url: "http://127.0.0.1:8000",
    auth_token: null,
    default_project_id: null,
    debug_mode: false,
    ...overrides,
  };
}

beforeEach(() => {
  __resetSettingsStoreForTests();
  useSettingsStore.setState({
    config: null,
    fetchState: "idle",
    error: null,
    testState: "idle",
    testError: null,
  });
  invokeMock.mockReset();
});

describe("useSettingsStore", () => {
  it("starts with no config loaded", () => {
    const state = useSettingsStore.getState();
    expect(state.config).toBeNull();
    expect(state.fetchState).toBe("idle");
  });

  it("loadConfig calls get_config and stores the result", async () => {
    invokeMock.mockResolvedValueOnce(config({ core_url: "http://example.com:9000" }));

    await useSettingsStore.getState().loadConfig();

    expect(invokeMock).toHaveBeenCalledWith("get_config");
    const state = useSettingsStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.config?.core_url).toBe("http://example.com:9000");
    expect(state.error).toBeNull();
  });

  it("sets fetchState to error when loadConfig's invoke call fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    await useSettingsStore.getState().loadConfig();

    const state = useSettingsStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("Core unreachable");
    expect(state.config).toBeNull();
  });

  it("init calls get_config exactly once even if called multiple times concurrently", async () => {
    invokeMock.mockResolvedValue(config());

    await Promise.all([
      useSettingsStore.getState().init(),
      useSettingsStore.getState().init(),
      useSettingsStore.getState().init(),
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("saveConfig calls save_config with newConfig and adopts the echoed-back result", async () => {
    const toSave = config({ core_url: "http://new-host:1234", auth_token: "secret" });
    invokeMock.mockResolvedValueOnce(toSave);

    await useSettingsStore.getState().saveConfig(toSave);

    expect(invokeMock).toHaveBeenCalledWith("save_config", { newConfig: toSave });
    const state = useSettingsStore.getState();
    expect(state.fetchState).toBe("idle");
    expect(state.config).toEqual(toSave);
  });

  it("sets fetchState to error when saveConfig's invoke call fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("permission denied"));

    await useSettingsStore.getState().saveConfig(config());

    const state = useSettingsStore.getState();
    expect(state.fetchState).toBe("error");
    expect(state.error).toContain("permission denied");
  });

  it("testConnection calls test_connection and sets testState to success", async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await useSettingsStore.getState().testConnection("http://127.0.0.1:8000", null);

    expect(invokeMock).toHaveBeenCalledWith("test_connection", {
      coreUrl: "http://127.0.0.1:8000",
      authToken: null,
    });
    const state = useSettingsStore.getState();
    expect(state.testState).toBe("success");
    expect(state.testError).toBeNull();
  });

  it("testConnection sets testState to error without touching fetchState/config on failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("unexpected status 401"));

    await useSettingsStore.getState().testConnection("http://127.0.0.1:8000", "bad-token");

    const state = useSettingsStore.getState();
    expect(state.testState).toBe("error");
    expect(state.testError).toContain("401");
    expect(state.fetchState).toBe("idle");
    expect(state.config).toBeNull();
  });
});

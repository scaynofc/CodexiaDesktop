import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";
import {
  __resetSettingsStoreForTests,
  useSettingsStore,
  type Config,
} from "@/stores/settingsStore";

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
  invokeMock.mockResolvedValue(config());
});

describe("Settings", () => {
  it("loads config on mount and seeds the form", async () => {
    invokeMock.mockResolvedValueOnce(
      config({ core_url: "http://example.com:9000", default_project_id: "proj-1" }),
    );

    render(<Settings />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("http://example.com:9000")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("proj-1")).toBeInTheDocument();
  });

  it("clicking Test Connection calls test_connection with the current form values", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    fireEvent.change(screen.getByPlaceholderText("http://127.0.0.1:8000"), {
      target: { value: "http://custom-host:7000" },
    });
    invokeMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("test_connection", {
        coreUrl: "http://custom-host:7000",
        authToken: null,
      }),
    );
    await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
  });

  it("shows a Failed badge and the error message when Test Connection fails", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    invokeMock.mockRejectedValueOnce(new Error("unexpected status 401"));
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    expect(screen.getByText(/401/)).toBeInTheDocument();
  });

  it("clicking Save Settings calls save_config with every field, including a masked token", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    fireEvent.change(screen.getByPlaceholderText("http://127.0.0.1:8000"), {
      target: { value: "http://custom-host:7000" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Optional - leave blank if Core has no API_BEARER_TOKEN set"),
      { target: { value: "secret-token" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "Optional - used automatically in Task Center when left blank there",
      ),
      { target: { value: "proj-1" } },
    );
    fireEvent.click(screen.getByLabelText("Debug mode"));

    invokeMock.mockResolvedValueOnce(
      config({
        core_url: "http://custom-host:7000",
        auth_token: "secret-token",
        default_project_id: "proj-1",
        debug_mode: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_config", {
        newConfig: {
          core_url: "http://custom-host:7000",
          auth_token: "secret-token",
          default_project_id: "proj-1",
          debug_mode: true,
        },
      }),
    );
  });

  it("the bearer token input is masked", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    const tokenInput = screen.getByPlaceholderText(
      "Optional - leave blank if Core has no API_BEARER_TOKEN set",
    );
    expect(tokenInput).toHaveAttribute("type", "password");
  });

  it("sends null for auth_token and default_project_id when left blank", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    fireEvent.change(screen.getByPlaceholderText("http://127.0.0.1:8000"), {
      target: { value: "http://custom-host:7000" },
    });
    invokeMock.mockResolvedValueOnce(config({ core_url: "http://custom-host:7000" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_config", {
        newConfig: {
          core_url: "http://custom-host:7000",
          auth_token: null,
          default_project_id: null,
          debug_mode: false,
        },
      }),
    );
  });

  it("shows an error message when saving fails", async () => {
    render(<Settings />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_config"));

    invokeMock.mockRejectedValueOnce(new Error("permission denied"));
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() => expect(screen.getByText(/permission denied/)).toBeInTheDocument());
  });
});

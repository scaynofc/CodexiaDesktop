import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Runtime from "./Runtime";
import { useRuntimeStore, type OllamaRuntimeStatus } from "@/stores/runtimeStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function status(overrides: Partial<OllamaRuntimeStatus> = {}): OllamaRuntimeStatus {
  return {
    reachable: true,
    models: [],
    ...overrides,
  };
}

beforeEach(() => {
  useRuntimeStore.setState({ runtime: null, fetchState: "idle", error: null });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(status());
});

describe("Runtime", () => {
  it("fetches runtime status on mount", async () => {
    render(<Runtime />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_ollama_runtime"));
  });

  it("shows a loading placeholder before the first status arrives", () => {
    invokeMock.mockReturnValueOnce(new Promise(() => {}));

    render(<Runtime />);

    expect(screen.getByText("Loading Ollama runtime status…")).toBeInTheDocument();
  });

  it("shows an unreachable message when Ollama isn't running", async () => {
    invokeMock.mockResolvedValueOnce(status({ reachable: false, models: [] }));

    render(<Runtime />);

    await waitFor(() => expect(screen.getByText(/not reachable/)).toBeInTheDocument());
    expect(screen.getByText("ollama serve")).toBeInTheDocument();
  });

  it("shows an empty-but-reachable message when nothing is loaded", async () => {
    invokeMock.mockResolvedValueOnce(status({ reachable: true, models: [] }));

    render(<Runtime />);

    await waitFor(() =>
      expect(
        screen.getByText("Ollama is reachable, but no models are currently loaded in memory."),
      ).toBeInTheDocument(),
    );
  });

  it("renders loaded models with formatted VRAM and expiry", async () => {
    invokeMock.mockResolvedValueOnce(
      status({
        reachable: true,
        models: [
          { name: "qwen2.5:7b", size_vram_bytes: 4800000, expires_at: "2026-07-17T12:00:00Z" },
        ],
      }),
    );

    render(<Runtime />);

    await waitFor(() => expect(screen.getByText("qwen2.5:7b")).toBeInTheDocument());
    expect(screen.getByText("4.6 MB VRAM")).toBeInTheDocument();
  });

  it("renders an em dash for a model with no VRAM figure", async () => {
    invokeMock.mockResolvedValueOnce(
      status({
        reachable: true,
        models: [{ name: "mistral:latest", size_vram_bytes: null, expires_at: null }],
      }),
    );

    render(<Runtime />);

    await waitFor(() => expect(screen.getByText("— VRAM")).toBeInTheDocument());
  });

  it("clicking Refresh calls get_ollama_runtime again", async () => {
    render(<Runtime />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when the underlying invoke call fails (Core itself unreachable)", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Runtime />);

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });
});

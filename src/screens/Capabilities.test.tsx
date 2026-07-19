import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Capabilities from "./Capabilities";
import { useCapabilityStore, type Capability } from "@/stores/capabilityStore";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

function capability(overrides: Partial<Capability> = {}): Capability {
  return {
    name: "read_file",
    description: "Reads a file.",
    parameters: { type: "object", properties: {} },
    requires_approval: false,
    source: "built_in",
    ...overrides,
  };
}

beforeEach(() => {
  useCapabilityStore.setState({ capabilities: [], fetchState: "idle", error: null });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
});

describe("Capabilities", () => {
  it("fetches the capability registry on mount", async () => {
    render(<Capabilities />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_capabilities"));
  });

  it("shows a loading placeholder before the first response arrives", () => {
    invokeMock.mockReturnValueOnce(new Promise(() => {}));

    render(<Capabilities />);

    expect(screen.getByText("Loading capability registry…")).toBeInTheDocument();
  });

  it("shows an empty-registry message when nothing is registered", async () => {
    render(<Capabilities />);

    await waitFor(() =>
      expect(screen.getByText("No capabilities registered.")).toBeInTheDocument(),
    );
  });

  it("renders a built-in tool with its label and no approval badge", async () => {
    invokeMock.mockResolvedValueOnce([capability()]);

    render(<Capabilities />);

    await waitFor(() => expect(screen.getByText("read_file")).toBeInTheDocument());
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.getByText("Reads a file.")).toBeInTheDocument();
    expect(screen.queryByText("Requires approval")).not.toBeInTheDocument();
  });

  it("renders an mcp-sourced tool labeled MCP with an approval badge", async () => {
    invokeMock.mockResolvedValueOnce([
      capability({
        name: "mcp__github__create_issue",
        description: "Creates a GitHub issue.",
        source: "mcp",
        requires_approval: true,
      }),
    ]);

    render(<Capabilities />);

    await waitFor(() => expect(screen.getByText("mcp__github__create_issue")).toBeInTheDocument());
    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.getByText("Requires approval")).toBeInTheDocument();
  });

  it("clicking Refresh calls get_capabilities again", async () => {
    render(<Capabilities />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("shows an error message when the underlying invoke call fails", async () => {
    invokeMock.mockReset();
    invokeMock.mockRejectedValueOnce(new Error("Core unreachable"));

    render(<Capabilities />);

    await waitFor(() => expect(screen.getByText(/Core unreachable/)).toBeInTheDocument());
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("mocked"),
}));

describe("App", () => {
  it("renders the Phase 1 foundation shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Codexia Desktop" })).toBeInTheDocument();
    expect(screen.getByText("Phase 1 — Foundation")).toBeInTheDocument();
  });

  it("renders the Rust bridge smoke-test form", () => {
    render(<App />);

    expect(screen.getByPlaceholderText("Rust bridge smoke test...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invoke" })).toBeInTheDocument();
  });
});

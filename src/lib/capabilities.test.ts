import { describe, expect, it } from "vitest";
import {
  capabilitySourceBadgeClassName,
  capabilitySourceLabel,
  formatCapabilityParameters,
} from "./capabilities";

describe("capabilitySourceLabel", () => {
  it("labels every source", () => {
    expect(capabilitySourceLabel("built_in")).toBe("Built-in");
    expect(capabilitySourceLabel("mcp")).toBe("MCP");
  });
});

describe("capabilitySourceBadgeClassName", () => {
  it("color-codes mcp distinctly from built_in", () => {
    expect(capabilitySourceBadgeClassName("mcp")).toContain("sky");
    expect(capabilitySourceBadgeClassName("built_in")).not.toContain("sky");
  });
});

describe("formatCapabilityParameters", () => {
  it("pretty-prints an arbitrary JSON-schema parameters object", () => {
    const formatted = formatCapabilityParameters({
      type: "object",
      properties: { path: { type: "string" } },
    });
    expect(formatted).toContain('"type": "object"');
    expect(formatted).toContain('"path"');
  });

  it("handles an empty parameters object", () => {
    expect(formatCapabilityParameters({})).toBe("{}");
  });
});

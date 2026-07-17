import { describe, expect, it } from "vitest";
import { capitalize, formatCostUsd, formatLatencyMs, formatPercent } from "./metrics";

describe("formatCostUsd", () => {
  it("renders a known cost to 4 decimal places", () => {
    expect(formatCostUsd(0.42)).toBe("$0.4200");
    expect(formatCostUsd(1)).toBe("$1.0000");
  });

  it("renders null as Unknown, never $0", () => {
    expect(formatCostUsd(null)).toBe("Unknown");
  });
});

describe("formatPercent", () => {
  it("renders a 0-1 fraction as a one-decimal percentage", () => {
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0.9090909090909091)).toBe("90.9%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("renders null as an em dash", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatLatencyMs", () => {
  it("renders sub-second latency in milliseconds", () => {
    expect(formatLatencyMs(850.5)).toBe("851 ms");
    expect(formatLatencyMs(0)).toBe("0 ms");
  });

  it("renders one second or more in seconds", () => {
    expect(formatLatencyMs(1500)).toBe("1.5 s");
    expect(formatLatencyMs(1000)).toBe("1.0 s");
  });

  it("renders null as an em dash", () => {
    expect(formatLatencyMs(null)).toBe("—");
  });
});

describe("capitalize", () => {
  it("capitalizes the first letter only", () => {
    expect(capitalize("coder")).toBe("Coder");
    expect(capitalize("ollama")).toBe("Ollama");
  });

  it("handles an empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

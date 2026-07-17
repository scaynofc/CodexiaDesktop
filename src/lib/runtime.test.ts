import { describe, expect, it } from "vitest";
import { formatBytes, formatExpiresAt } from "./runtime";

describe("formatBytes", () => {
  it("renders bytes in the largest unit under 1024", () => {
    expect(formatBytes(500)).toBe("500.0 B");
    expect(formatBytes(4800000)).toBe("4.6 MB");
    expect(formatBytes(4_800_000_000)).toBe("4.5 GB");
  });

  it("renders null or non-positive values as an em dash, never 0 B", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("formatExpiresAt", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatExpiresAt("2026-07-17T12:00:00Z");
    expect(formatted).not.toBe("2026-07-17T12:00:00Z");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("renders null as an em dash", () => {
    expect(formatExpiresAt(null)).toBe("—");
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatExpiresAt("not-a-date")).toBe("not-a-date");
  });
});

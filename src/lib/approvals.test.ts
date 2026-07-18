import { describe, expect, it } from "vitest";
import {
  approvalStatusBadgeClassName,
  approvalStatusLabel,
  approvalTypeLabel,
  formatApprovalPayload,
  formatApprovalTimestamp,
} from "./approvals";

describe("approvalTypeLabel", () => {
  it("labels every type", () => {
    expect(approvalTypeLabel("tool")).toBe("Tool call");
    expect(approvalTypeLabel("memory")).toBe("Memory write");
  });
});

describe("approvalStatusLabel", () => {
  it("labels every status", () => {
    expect(approvalStatusLabel("pending")).toBe("Pending");
    expect(approvalStatusLabel("approved")).toBe("Approved");
    expect(approvalStatusLabel("rejected")).toBe("Rejected");
    expect(approvalStatusLabel("expired")).toBe("Expired");
    expect(approvalStatusLabel("cancelled")).toBe("Cancelled");
  });
});

describe("approvalStatusBadgeClassName", () => {
  it("color-codes pending as amber", () => {
    expect(approvalStatusBadgeClassName("pending")).toContain("amber");
  });

  it("color-codes approved as emerald/green", () => {
    expect(approvalStatusBadgeClassName("approved")).toContain("emerald");
  });

  it("color-codes rejected as destructive/red", () => {
    expect(approvalStatusBadgeClassName("rejected")).toContain("destructive");
  });

  it("color-codes expired and cancelled as neutral/gray", () => {
    expect(approvalStatusBadgeClassName("expired")).toContain("muted-foreground");
    expect(approvalStatusBadgeClassName("cancelled")).toContain("muted-foreground");
  });
});

describe("formatApprovalTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const formatted = formatApprovalTimestamp("2026-07-18T12:00:00+00:00");
    expect(formatted).not.toBe("2026-07-18T12:00:00+00:00");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatApprovalTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("formatApprovalPayload", () => {
  it("pretty-prints an arbitrary payload object", () => {
    const formatted = formatApprovalPayload({ name: "write_file", arguments: { path: "out.txt" } });
    expect(formatted).toContain('"name": "write_file"');
    expect(formatted).toContain('"path": "out.txt"');
  });

  it("handles an empty payload", () => {
    expect(formatApprovalPayload({})).toBe("{}");
  });
});

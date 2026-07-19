import { describe, expect, it } from "vitest";
import { findNavItemByPath, NAV_ITEMS } from "./navigation";

describe("NAV_ITEMS", () => {
  it("has a unique id for every item", () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a unique path for every item", () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("has every screen built and enabled, as of Wave 3 (Capability Registry)", () => {
    const enabledIds = NAV_ITEMS.filter((item) => item.enabled).map((item) => item.id);
    expect(enabledIds).toEqual([
      "dashboard",
      "tasks",
      "timeline",
      "providers",
      "runtime",
      "approvals",
      "memory",
      "logs",
      "capabilities",
      "settings",
    ]);
  });

  it("gives Dashboard the root path", () => {
    const dashboard = NAV_ITEMS.find((item) => item.id === "dashboard");
    expect(dashboard?.path).toBe("/");
  });
});

describe("findNavItemByPath", () => {
  it("finds the item matching a given path", () => {
    expect(findNavItemByPath("/")?.id).toBe("dashboard");
    expect(findNavItemByPath("/tasks")?.id).toBe("tasks");
    expect(findNavItemByPath("/timeline")?.id).toBe("timeline");
    expect(findNavItemByPath("/providers")?.id).toBe("providers");
    expect(findNavItemByPath("/runtime")?.id).toBe("runtime");
    expect(findNavItemByPath("/approvals")?.id).toBe("approvals");
    expect(findNavItemByPath("/memory")?.id).toBe("memory");
    expect(findNavItemByPath("/logs")?.id).toBe("logs");
    expect(findNavItemByPath("/capabilities")?.id).toBe("capabilities");
    expect(findNavItemByPath("/settings")?.id).toBe("settings");
  });

  it("returns undefined for an unregistered path", () => {
    expect(findNavItemByPath("/does-not-exist")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { versionMismatchMessage } from "./connection";
import type { ConnectionStatus, HealthResponse } from "@/stores/connectionStore";

function health(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: "ok",
    alive: true,
    core_version: "2.0.0",
    api_version: 1,
    protocol_version: 1,
    instance_id: "boot-1",
    timestamp: "2026-07-16T00:00:00+00:00",
    max_task_cost_usd: null,
    ...overrides,
  };
}

function status(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    state: "Connected",
    health: health(),
    restarted: false,
    api_compatible: true,
    protocol_compatible: true,
    ...overrides,
  };
}

describe("versionMismatchMessage", () => {
  it("returns null when there is no health payload yet", () => {
    expect(versionMismatchMessage(status({ health: null }))).toBeNull();
  });

  it("returns null when both axes are compatible", () => {
    expect(versionMismatchMessage(status())).toBeNull();
  });

  it("names the API version when only the API axis is incompatible", () => {
    const message = versionMismatchMessage(
      status({ health: health({ api_version: 2 }), api_compatible: false }),
    );

    expect(message).toBe("Incompatible Core (API v2)");
  });

  it("names the protocol version when only the protocol axis is incompatible", () => {
    const message = versionMismatchMessage(
      status({ health: health({ protocol_version: 3 }), protocol_compatible: false }),
    );

    expect(message).toBe("Incompatible Core (protocol v3)");
  });

  it("names both versions when both axes are incompatible", () => {
    const message = versionMismatchMessage(
      status({
        health: health({ api_version: 2, protocol_version: 3 }),
        api_compatible: false,
        protocol_compatible: false,
      }),
    );

    expect(message).toBe("Incompatible Core (API v2, protocol v3)");
  });
});

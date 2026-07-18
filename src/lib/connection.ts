import type { ConnectionStatus } from "@/stores/connectionStore";

/**
 * Version-compatibility banner text for AppHeader (see
 * docs/adr/015-core-version-compatibility-check.md). Pure and
 * unit-tested, mirroring lib/events.ts's split between pure logic and the
 * component that renders it.
 *
 * `api_compatible`/`protocol_compatible` are already computed Rust-side
 * (services/connection.rs's next_status()) against this build's known-good
 * versions - this only turns that verdict into a human-readable message,
 * naming Core's actual reported version(s) so the banner is diagnostic,
 * not just a bare warning.
 */
export function versionMismatchMessage(status: ConnectionStatus): string | null {
  if (!status.health) return null;
  if (status.api_compatible && status.protocol_compatible) return null;

  const parts: string[] = [];
  if (!status.api_compatible) parts.push(`API v${status.health.api_version}`);
  if (!status.protocol_compatible) parts.push(`protocol v${status.health.protocol_version}`);
  return `Incompatible Core (${parts.join(", ")})`;
}

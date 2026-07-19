import type { CapabilitySource } from "@/stores/capabilityStore";

/**
 * Formatting helpers for Capability Registry (Wave 3). Pure and
 * unit-tested, mirroring `lib/runtime.ts`/`lib/approvals.ts`'s split
 * between pure formatting and the screen that renders it.
 */

const SOURCE_LABEL: Record<CapabilitySource, string> = {
  built_in: "Built-in",
  mcp: "MCP",
};

export function capabilitySourceLabel(source: CapabilitySource): string {
  return SOURCE_LABEL[source];
}

/** Color-codes MCP tools distinctly from built-ins - the fact a Desktop
 * user would most want to scan for (external, config-sourced code running
 * as a tool vs. this app's own shipped set), same "outline variant +
 * className override" approach `lib/approvals.ts`'s status colors use. */
const SOURCE_BADGE_CLASSNAME: Record<CapabilitySource, string> = {
  built_in: "border-border text-muted-foreground",
  mcp: "border-sky-500/50 text-sky-600 dark:text-sky-400",
};

export function capabilitySourceBadgeClassName(source: CapabilitySource): string {
  return SOURCE_BADGE_CLASSNAME[source];
}

/** Pretty-prints a capability's JSON-schema `parameters` for display -
 * same reasoning as `lib/approvals.ts`'s `formatApprovalPayload`: shape
 * varies per tool, so render as-is rather than pattern-matching fields
 * that might not exist. */
export function formatCapabilityParameters(parameters: Record<string, unknown>): string {
  return JSON.stringify(parameters, null, 2);
}

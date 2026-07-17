/**
 * Formatting helpers for Provider Center (Phase 6). Pure and unit-tested,
 * mirroring `lib/timeline.ts`'s split between pure formatting and the
 * screen that renders it.
 */

/** `null` means "at least one contributing row's cost is unknown" (see
 * CodexiaCore's `_sum_cost`/ADR-012's Consequences) - renders as "Unknown",
 * never `$0`, so a user can't mistake missing data for a real zero cost. */
export function formatCostUsd(value: number | null): string {
  if (value === null) return "Unknown";
  return `$${value.toFixed(4)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatLatencyMs(value: number | null): string {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

/** `role`/`provider` keys off the wire are lowercase single words
 * ("coder", "ollama") - CodexiaCore has no separate display-name field for
 * either, so a simple capitalize is enough (unlike Timeline's `kind`
 * vocabulary, which has irregular multi-word labels needing a lookup table). */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

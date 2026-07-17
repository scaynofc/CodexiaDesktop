/**
 * Formatting helpers for Runtime Center (Phase 7). Pure and unit-tested,
 * mirroring `lib/metrics.ts`/`lib/timeline.ts`'s split between pure
 * formatting and the screen that renders it.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** `null`/non-positive means CodexiaCore had nothing to report (Ollama
 * unreachable, or a model with no VRAM figure) - renders as an em dash,
 * never `0 B`, which would misleadingly imply a confirmed zero. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "—";

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

const EXPIRY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Renders Ollama's `expires_at` (when it'll unload this model from memory
 * if idle) in the viewer's locale/timezone; falls back to the raw string
 * for anything unparseable, and an em dash when absent entirely. */
export function formatExpiresAt(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? expiresAt : EXPIRY_FORMATTER.format(parsed);
}

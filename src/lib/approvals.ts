import type { Approval, ApprovalStatus, ApprovalType } from "@/stores/approvalStore";

/**
 * Formatting helpers for Approval Center (Phase 10). Pure and unit-tested,
 * mirroring `lib/events.ts`'s split between pure logic and the screen that
 * renders it.
 */

const TYPE_LABEL: Record<ApprovalType, string> = {
  tool: "Tool call",
  memory: "Memory write",
};

export function approvalTypeLabel(type: ApprovalType): string {
  return TYPE_LABEL[type];
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function approvalStatusLabel(status: ApprovalStatus): string {
  return STATUS_LABEL[status];
}

/** Status color-coding as className overrides on Badge's "outline" variant -
 * same approach `lib/events.ts`'s `eventTypeBadgeClassName` established for
 * Log Center. `GET /approvals/pending` only ever returns `pending` rows in
 * practice, but the map covers every `ApprovalStatus` value so a decided
 * row (e.g. shown briefly before the next poll drops it) never falls
 * through with no styling - `cancelled` (currently unreachable in
 * CodexiaCore, reserved for a future task-cancellation cascade) gets the
 * same neutral treatment as `expired` rather than being left unmapped. */
const STATUS_BADGE_CLASSNAME: Record<ApprovalStatus, string> = {
  pending: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  approved: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  rejected: "border-destructive/50 text-destructive",
  expired: "border-border text-muted-foreground",
  cancelled: "border-border text-muted-foreground",
};

export function approvalStatusBadgeClassName(status: ApprovalStatus): string {
  return STATUS_BADGE_CLASSNAME[status];
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Renders CodexiaCore's ISO 8601 timestamp in the viewer's locale/timezone;
 * falls back to the raw string for anything `Date` can't parse rather than
 * showing "Invalid Date" - same fallback `lib/events.ts` uses. */
export function formatApprovalTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : TIMESTAMP_FORMATTER.format(parsed);
}

/** Pretty-prints an approval's untyped payload for display - CodexiaCore
 * never guarantees a shape beyond "valid JSON object" (it varies by
 * `type`), so this renders it as-is rather than pattern-matching fields
 * that might not exist. */
export function formatApprovalPayload(payload: Approval["payload"]): string {
  return JSON.stringify(payload, null, 2);
}

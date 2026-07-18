import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approvalStatusBadgeClassName,
  approvalStatusLabel,
  approvalTypeLabel,
  formatApprovalCountdown,
  formatApprovalPayload,
  formatApprovalTimestamp,
} from "@/lib/approvals";
import { useApprovalStore, type Approval } from "@/stores/approvalStore";

/** How often Approval Center re-polls while it's the active screen - short
 * enough to feel responsive against CodexiaCore's own
 * `settings.approval_timeout_seconds` (120s default), without polling so
 * fast it'd be indistinguishable from a push channel this app doesn't
 * have. */
const POLL_INTERVAL_MS = 3000;

/** How often the countdown display ticks - independent of POLL_INTERVAL_MS
 * above: the approvals list itself only needs to change when the server's
 * state changes (3s is plenty), but a countdown that only moved every 3s
 * would look broken/jumpy. See docs/adr/016-approval-queue-desktop-controls.md. */
const COUNTDOWN_TICK_MS = 1000;

interface ApprovalCardProps {
  approval: Approval;
  now: Date;
  deciding: boolean;
  onApprove: (reason: string) => void;
  onReject: (reason: string) => void;
}

function ApprovalCard({ approval, now, deciding, onApprove, onReject }: ApprovalCardProps) {
  const [reason, setReason] = useState("");
  const countdown = formatApprovalCountdown(approval.expires_at, now);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{approvalTypeLabel(approval.type)}</Badge>
        <Badge variant="outline" className={approvalStatusBadgeClassName(approval.status)}>
          {approvalStatusLabel(approval.status)}
        </Badge>
        {countdown && approval.status === "pending" && (
          <span className="text-xs text-muted-foreground">{countdown}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatApprovalTimestamp(approval.created_at)}
        </span>
      </div>
      {(approval.task_id || approval.step_id !== null) && (
        <p className="text-xs text-muted-foreground">
          {approval.task_id && <>Task: {approval.task_id} </>}
          {approval.step_id !== null && <>· Step {approval.step_id}</>}
        </p>
      )}
      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
        {formatApprovalPayload(approval.payload)}
      </pre>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional reason"
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          onClick={() => onApprove(reason)}
          size="sm"
          disabled={deciding}
          className="shrink-0"
        >
          Approve
        </Button>
        <Button
          onClick={() => onReject(reason)}
          variant="destructive"
          size="sm"
          disabled={deciding}
          className="shrink-0"
        >
          Reject
        </Button>
      </div>
    </li>
  );
}

/**
 * Phase 10 (its original slot, deferred twice - see
 * docs/adr/013-settings-local-desktop-configuration.md and CodexiaCore's
 * docs/adr/017-approval-system.md). Human-in-the-loop control over gated
 * tool calls/memory writes for a task run with `enable_approval_queue:
 * true` - reads/decides CodexiaCore's persisted `Approval` rows via
 * `GET /approvals/pending`, `POST /approvals/{id}/approve`,
 * `POST /approvals/{id}/reject`. See
 * docs/adr/014-approval-center-human-in-the-loop.md.
 *
 * Polls only while this screen is mounted (a plain `useEffect`/
 * `setInterval`, cleared on unmount) - unlike Task Center's always-on
 * background loops, a pending approval is only actionable from this
 * screen, so there's no reason to keep polling once the user navigates
 * away. Each card also shows a live countdown to its `expires_at`, ticking
 * on its own independent 1s timer - see
 * docs/adr/016-approval-queue-desktop-controls.md.
 */
function Approvals() {
  const approvals = useApprovalStore((state) => state.approvals);
  const fetchState = useApprovalStore((state) => state.fetchState);
  const error = useApprovalStore((state) => state.error);
  const decidingIds = useApprovalStore((state) => state.decidingIds);
  const fetchApprovals = useApprovalStore((state) => state.fetchApprovals);
  const approve = useApprovalStore((state) => state.approve);
  const reject = useApprovalStore((state) => state.reject);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void fetchApprovals();
    const interval = setInterval(() => void fetchApprovals(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Gated tool calls and memory writes waiting on a human decision.
        </p>
        <Button
          onClick={() => void fetchApprovals()}
          size="sm"
          disabled={fetchState === "loading"}
          className="ml-auto"
        >
          {fetchState === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fetchState === "loading" ? "Loading…" : "No pending approvals."}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              now={now}
              deciding={decidingIds.includes(approval.id)}
              onApprove={(reason) => void approve(approval.id, reason || undefined)}
              onReject={(reason) => void reject(approval.id, reason || undefined)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export default Approvals;

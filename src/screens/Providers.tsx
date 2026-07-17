import { Fragment, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { capitalize, formatCostUsd, formatLatencyMs, formatPercent } from "@/lib/metrics";
import { useMetricsStore } from "@/stores/metricsStore";

/**
 * Phase 6. Reads CodexiaCore's `GET /metrics` (ADR-012 in the CodexiaCore
 * repo) - per-model health/cooldown (Faz 14), cost totals (Faz 13), router
 * accuracy (Faz 12), already aggregated server-side by `MetricsSnapshot`.
 * No push event backs this screen (see docs/adr/009-provider-center-metrics-snapshot.md)
 * - it fetches once on mount and again on "Refresh," same as CodexiaCore's
 * own reference dashboard's manual-refresh-only model.
 */
function Providers() {
  const snapshot = useMetricsStore((state) => state.snapshot);
  const status = useMetricsStore((state) => state.status);
  const error = useMetricsStore((state) => state.error);
  const fetchMetrics = useMetricsStore((state) => state.fetchMetrics);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const roleAccuracyEntries = snapshot ? Object.entries(snapshot.router_accuracy_by_role) : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button onClick={() => void fetchMetrics()} size="sm" disabled={status === "loading"}>
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {!snapshot ? (
        <p className="text-sm text-muted-foreground">
          {status === "loading" ? "Loading metrics…" : "No metrics yet."}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt>Total cost</dt>
            <dd>{formatCostUsd(snapshot.total_cost_usd)}</dd>
            <dt>Total calls</dt>
            <dd>{snapshot.total_calls}</dd>
            <dt>Router accuracy</dt>
            <dd>{formatPercent(snapshot.router_accuracy)}</dd>
          </dl>

          {roleAccuracyEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Router accuracy by role</h3>
              <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {roleAccuracyEntries.map(([role, accuracy]) => (
                  <Fragment key={role}>
                    <dt>{capitalize(role)}</dt>
                    <dd>{formatPercent(accuracy)}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold">Model health</h3>
            {snapshot.model_health.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No model activity recorded yet.</p>
            ) : (
              <ol className="mt-2 flex flex-col gap-2">
                {snapshot.model_health.map((health) => (
                  <li
                    key={`${health.provider}:${health.model}`}
                    className="rounded-md border border-border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{health.model}</span>
                      <Badge variant="outline">{capitalize(health.provider)}</Badge>
                      {health.in_cooldown && <Badge variant="destructive">In cooldown</Badge>}
                    </div>
                    <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 text-xs text-muted-foreground">
                      <dt>Success rate</dt>
                      <dd>
                        {formatPercent(health.success_rate)} ({health.sample_count} calls)
                      </dd>
                      <dt>Median latency</dt>
                      <dd>{formatLatencyMs(health.median_latency_ms)}</dd>
                      <dt>Avg cost</dt>
                      <dd>{formatCostUsd(health.avg_cost_usd)}</dd>
                      {health.consecutive_failures > 0 && (
                        <>
                          <dt>Consecutive failures</dt>
                          <dd>{health.consecutive_failures}</dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Providers;

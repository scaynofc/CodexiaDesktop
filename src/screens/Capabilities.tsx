import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  capabilitySourceBadgeClassName,
  capabilitySourceLabel,
  formatCapabilityParameters,
} from "@/lib/capabilities";
import { useCapabilityStore } from "@/stores/capabilityStore";

/**
 * Wave 3 (Capability Registry). Reads CodexiaCore's `GET /capabilities`
 * (ADR-026 there) - a read-only snapshot of every tool `Engine.tools`
 * currently has registered (built-in, MCP-sourced, browser), the same
 * data `PlannerAgent` is blind to today via its hardcoded
 * `ALLOWED_TOOLS = ["web_search"]`. See docs/adr/022-capability-registry.md.
 *
 * No push event backs this screen (mirrors Runtime Center/Provider
 * Center) - it fetches once on mount and again on "Refresh."
 */
function Capabilities() {
  const capabilities = useCapabilityStore((state) => state.capabilities);
  const fetchState = useCapabilityStore((state) => state.fetchState);
  const error = useCapabilityStore((state) => state.error);
  const fetchCapabilities = useCapabilityStore((state) => state.fetchCapabilities);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          onClick={() => void fetchCapabilities()}
          size="sm"
          disabled={fetchState === "loading"}
        >
          {fetchState === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {capabilities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fetchState === "loading"
            ? "Loading capability registry…"
            : "No capabilities registered."}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {capabilities.map((capability) => (
            <li key={capability.name} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{capability.name}</span>
                <Badge
                  variant="outline"
                  className={capabilitySourceBadgeClassName(capability.source)}
                >
                  {capabilitySourceLabel(capability.source)}
                </Badge>
                {capability.requires_approval && <Badge variant="outline">Requires approval</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{capability.description}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Parameters
                </summary>
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {formatCapabilityParameters(capability.parameters)}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default Capabilities;

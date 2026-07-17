import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatExpiresAt } from "@/lib/runtime";
import { useRuntimeStore } from "@/stores/runtimeStore";

/**
 * Phase 7. Reads CodexiaCore's `GET /providers/ollama/runtime` (ADR-013
 * there) - a read-only proxy over Ollama's own `GET /api/ps`, i.e. which
 * models Ollama currently has loaded in memory and their VRAM footprint.
 * Originally planned as "GPU Center"; renamed once its actual scope was
 * decided - see docs/adr/010-runtime-center-ollama-proxy.md for why this
 * is Ollama-runtime-state, not host-machine GPU/hardware monitoring, and
 * why Desktop reaches this through Core rather than talking to Ollama
 * directly.
 *
 * No push event backs this screen (mirrors Provider Center) - it fetches
 * once on mount and again on "Refresh."
 */
function Runtime() {
  const runtime = useRuntimeStore((state) => state.runtime);
  const fetchState = useRuntimeStore((state) => state.fetchState);
  const error = useRuntimeStore((state) => state.error);
  const fetchRuntime = useRuntimeStore((state) => state.fetchRuntime);

  useEffect(() => {
    void fetchRuntime();
  }, [fetchRuntime]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button onClick={() => void fetchRuntime()} size="sm" disabled={fetchState === "loading"}>
          {fetchState === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {!runtime ? (
        <p className="text-sm text-muted-foreground">
          {fetchState === "loading" ? "Loading Ollama runtime status…" : "No runtime status yet."}
        </p>
      ) : !runtime.reachable ? (
        <p className="text-sm text-muted-foreground">
          Ollama is not reachable. Start it with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ollama serve</code>, then Refresh.
        </p>
      ) : runtime.models.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ollama is reachable, but no models are currently loaded in memory.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {runtime.models.map((model) => (
            <li key={model.name} className="rounded-md border border-border p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{model.name}</span>
                <Badge variant="outline">{formatBytes(model.size_vram_bytes)} VRAM</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Unloads at {formatExpiresAt(model.expires_at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default Runtime;

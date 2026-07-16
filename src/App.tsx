import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useConnectionStore, type ConnectionState } from "@/stores/connectionStore";

const STATE_LABEL: Record<ConnectionState, string> = {
  Connecting: "Connecting…",
  Connected: "Connected",
  Reconnecting: "Reconnecting…",
  Disconnected: "Disconnected",
};

const STATE_BADGE_VARIANT: Record<
  ConnectionState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Connecting: "outline",
  Connected: "default",
  Reconnecting: "secondary",
  Disconnected: "destructive",
};

/**
 * Phase 2 (Core Bridge) shell.
 *
 * Real connection status now, replacing Phase 1's smoke-test screen -
 * proves the whole chain (Rust poll loop -> Tauri event -> Zustand store
 * -> React render) actually works end to end. Real screens (Dashboard,
 * Tasks, ...) still arrive starting Phase 3.
 */
function App() {
  const status = useConnectionStore((state) => state.status);
  const init = useConnectionStore((state) => state.init);
  const showRestartNotice = useConnectionStore((state) => state.showRestartNotice);
  const dismissRestartNotice = useConnectionStore((state) => state.dismissRestartNotice);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <TooltipProvider>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Codexia Desktop</h1>
          <Badge variant={STATE_BADGE_VARIANT[status.state]}>{STATE_LABEL[status.state]}</Badge>
          {showRestartNotice && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-600 dark:text-amber-400"
              >
                Core restarted
              </Badge>
              <button
                type="button"
                onClick={dismissRestartNotice}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {status.health ? (
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <dt>Core version</dt>
            <dd>{status.health.core_version}</dd>
            <dt>API version</dt>
            <dd>{status.health.api_version}</dd>
            <dt>Protocol version</dt>
            <dd>{status.health.protocol_version}</dd>
            <dt>Instance</dt>
            <dd className="font-mono text-xs">{status.health.instance_id.slice(0, 8)}</dd>
          </dl>
        ) : (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Waiting for Codexia Core at http://127.0.0.1:8000 …
          </p>
        )}
      </main>
    </TooltipProvider>
  );
}

export default App;

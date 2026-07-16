import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findNavItemByPath } from "@/shell/navigation";
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
 * Persistent across every screen - connectivity matters app-wide, not just
 * on Dashboard (see docs/adr/005-connection-state-machine.md's
 * Consequences: "any future screen that cares about connectivity reads the
 * same store"). Dashboard itself only owns the health-detail table now.
 */
function AppHeader() {
  const location = useLocation();
  const status = useConnectionStore((state) => state.status);
  const showRestartNotice = useConnectionStore((state) => state.showRestartNotice);
  const dismissRestartNotice = useConnectionStore((state) => state.dismissRestartNotice);

  const pageTitle = findNavItemByPath(location.pathname)?.label ?? "Codexia Desktop";

  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <SidebarTrigger />
      <h1 className="text-lg font-semibold tracking-tight">{pageTitle}</h1>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant={STATE_BADGE_VARIANT[status.state]}>{STATE_LABEL[status.state]}</Badge>
        {showRestartNotice && (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}

export default AppHeader;

import { useConnectionStore } from "@/stores/connectionStore";

/**
 * The one real screen Phase 3 ships. Connection state itself (badge,
 * restart notice) lives in the shared AppHeader now, not here - see
 * docs/adr/006-application-shell-navigation.md - this screen only owns
 * genuinely dashboard-specific detail: the health payload's fields.
 */
function Dashboard() {
  const health = useConnectionStore((state) => state.status.health);

  if (!health) {
    return (
      <p className="max-w-md text-sm text-muted-foreground">
        Waiting for Codexia Core at http://127.0.0.1:8000 …
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <dt>Core version</dt>
      <dd>{health.core_version}</dd>
      <dt>API version</dt>
      <dd>{health.api_version}</dd>
      <dt>Protocol version</dt>
      <dd>{health.protocol_version}</dd>
      <dt>Instance</dt>
      <dd className="font-mono text-xs">{health.instance_id.slice(0, 8)}</dd>
    </dl>
  );
}

export default Dashboard;

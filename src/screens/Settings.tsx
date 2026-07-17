import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";

const INPUT_CLASSNAME =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Phase 11. Local Desktop configuration - Core's connection URL, an
 * optional bearer token, a default project id for Task Center, and a
 * reserved (currently inert) debug-mode flag. Persisted to disk on this
 * machine only, never sent to Core as a concept - Core stays stateless and
 * config-free (see docs/adr/003/004 and
 * docs/adr/013-settings-local-desktop-configuration.md).
 *
 * One combined form, one "Save Settings" action - "Test Connection" is a
 * separate, non-persisting probe of whatever is currently typed, so a user
 * can verify a URL/token before committing to it.
 */
function Settings() {
  const config = useSettingsStore((state) => state.config);
  const fetchState = useSettingsStore((state) => state.fetchState);
  const error = useSettingsStore((state) => state.error);
  const testState = useSettingsStore((state) => state.testState);
  const testError = useSettingsStore((state) => state.testError);
  const init = useSettingsStore((state) => state.init);
  const saveConfig = useSettingsStore((state) => state.saveConfig);
  const testConnection = useSettingsStore((state) => state.testConnection);

  const [coreUrl, setCoreUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [defaultProjectId, setDefaultProjectId] = useState("");
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Seeds the form from the persisted config the first time it arrives -
  // guarded by a ref (not a `config === null` dependency) so a later save
  // updating `config` never clobbers whatever the user is mid-editing.
  const seeded = useRef(false);
  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true;
      setCoreUrl(config.core_url);
      setAuthToken(config.auth_token ?? "");
      setDefaultProjectId(config.default_project_id ?? "");
      setDebugMode(config.debug_mode);
    }
  }, [config]);

  const handleSave = () => {
    void saveConfig({
      core_url: coreUrl.trim(),
      auth_token: authToken.trim() ? authToken.trim() : null,
      default_project_id: defaultProjectId.trim() ? defaultProjectId.trim() : null,
      debug_mode: debugMode,
    });
  };

  const handleTestConnection = () => {
    void testConnection(coreUrl.trim(), authToken.trim() ? authToken.trim() : null);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Core Connection</h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Core URL
          <input
            type="text"
            value={coreUrl}
            onChange={(event) => setCoreUrl(event.target.value)}
            placeholder="http://127.0.0.1:8000"
            className={INPUT_CLASSNAME}
          />
        </label>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleTestConnection}
            size="sm"
            variant="outline"
            disabled={!coreUrl.trim() || testState === "testing"}
          >
            {testState === "testing" ? "Testing…" : "Test Connection"}
          </Button>
          {testState === "success" && <Badge variant="default">Connected</Badge>}
          {testState === "error" && <Badge variant="destructive">Failed</Badge>}
        </div>
        {testState === "error" && testError && (
          <p className="text-sm text-destructive">{testError}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Authentication</h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Bearer Token
          <input
            type="password"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            placeholder="Optional - leave blank if Core has no API_BEARER_TOKEN set"
            className={INPUT_CLASSNAME}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Default Project</h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Default project id
          <input
            type="text"
            value={defaultProjectId}
            onChange={(event) => setDefaultProjectId(event.target.value)}
            placeholder="Optional - used automatically in Task Center when left blank there"
            className={INPUT_CLASSNAME}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Developer Options</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(event) => setDebugMode(event.target.checked)}
          />
          Debug mode
        </label>
      </section>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!coreUrl.trim() || fetchState === "loading"}>
          {fetchState === "loading" ? "Saving…" : "Save Settings"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}

export default Settings;

import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppHeader from "@/shell/AppHeader";
import AppSidebar from "@/shell/AppSidebar";
import Dashboard from "@/screens/Dashboard";
import Log from "@/screens/Log";
import Memory from "@/screens/Memory";
import Providers from "@/screens/Providers";
import Runtime from "@/screens/Runtime";
import Settings from "@/screens/Settings";
import Tasks from "@/screens/Tasks";
import Timeline from "@/screens/Timeline";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Phase 3 (Application Shell) + Phase 4 (Task Center) + Phase 5 (Timeline)
 * + Phase 6 (Provider Center) + Phase 7 (Runtime Center) + Phase 8
 * (Memory Center) + Phase 9 (Log Center) + Phase 11 (Settings, out of
 * numeric order - Approval Center's Phase 10 slot remains deferred, see
 * docs/adr/013-settings-local-desktop-configuration.md). `MemoryRouter`
 * (not Browser/HashRouter) - a desktop app has no meaningful URL bar, and
 * Tauri's asset protocol has no SPA-fallback for a deep path on reload -
 * see docs/adr/006-application-shell-navigation.md. Every screen except
 * Approval Center has a registered `<Route>`; Approval Center (see
 * src/shell/navigation.ts) renders as a disabled sidebar item until its
 * own phase lands.
 */
function App() {
  const init = useConnectionStore((state) => state.init);
  const initSettings = useSettingsStore((state) => state.init);

  useEffect(() => {
    void init();
    // Loaded here, not just on Settings' own mount, so
    // `config.default_project_id` is available to Task Center (and any
    // future screen) regardless of whether the user ever opens Settings.
    void initSettings();
  }, [init, initSettings]);

  return (
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <main className="flex-1 p-6">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/providers" element={<Providers />} />
                <Route path="/runtime" element={<Runtime />} />
                <Route path="/memory" element={<Memory />} />
                <Route path="/logs" element={<Log />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>
  );
}

export default App;

import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppHeader from "@/shell/AppHeader";
import AppSidebar from "@/shell/AppSidebar";
import Dashboard from "@/screens/Dashboard";
import { useConnectionStore } from "@/stores/connectionStore";

/**
 * Phase 3 (Application Shell). `MemoryRouter` (not Browser/HashRouter) -
 * a desktop app has no meaningful URL bar, and Tauri's asset protocol has
 * no SPA-fallback for a deep path on reload - see
 * docs/adr/006-application-shell-navigation.md. Only Dashboard has a
 * registered `<Route>` today; every other planned screen (see
 * src/shell/navigation.ts) renders as a disabled sidebar item until its
 * own phase lands.
 */
function App() {
  const init = useConnectionStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

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
              </Routes>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>
  );
}

export default App;

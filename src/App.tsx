import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Phase 1 (Desktop Foundation) shell.
 *
 * This intentionally does NOT contain the real application navigation/
 * sidebar - that is Phase 3 (Application Shell). This screen exists only
 * to prove the stack (Tauri + React + TypeScript + Tailwind + shadcn/ui)
 * renders correctly and that the Rust <-> JS bridge (`invoke`) works
 * end to end, via the `commands::greet` smoke-test command.
 */
function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <TooltipProvider>
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Codexia Desktop</h1>
          <Badge variant="secondary">Phase 1 — Foundation</Badge>
          <p className="max-w-md text-sm text-muted-foreground">
            Native control center for the Codexia Core runtime. This screen only proves the stack is
            wired correctly - real screens arrive in later phases.
          </p>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void greet();
          }}
        >
          <input
            id="greet-input"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Rust bridge smoke test..."
          />
          <Button type="submit">Invoke</Button>
        </form>
        {greetMsg && <p className="text-sm text-muted-foreground">{greetMsg}</p>}
      </main>
    </TooltipProvider>
  );
}

export default App;

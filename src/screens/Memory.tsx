import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMemoryStore, type MemoryItem, type MemoryItemType } from "@/stores/memoryStore";

const TYPE_BADGE_VARIANT: Record<
  MemoryItemType,
  "default" | "secondary" | "destructive" | "outline"
> = {
  fact: "default",
  pattern: "secondary",
  strategy: "secondary",
  error: "destructive",
};

interface MemoryItemCardProps {
  item: MemoryItem;
  onForget: () => void;
}

function MemoryItemCard({ item, onForget }: MemoryItemCardProps) {
  return (
    <li className="rounded-md border border-border p-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{item.key}</span>
        <Badge variant={TYPE_BADGE_VARIANT[item.type]}>{item.type}</Badge>
        <Button onClick={onForget} variant="destructive" size="sm" className="ml-auto">
          Forget
        </Button>
      </div>
      <p className="mt-1 text-muted-foreground">{item.value}</p>
      {item.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * Phase 8. Reads/deletes CodexiaCore's governed project memory (ADR-014
 * there: `GET`/`DELETE /projects/{id}/memory`, thin mirrors of the CLI's
 * `--memory-list`/`--memory-forget`). Unlike every other built screen,
 * there's no single "the" project - the user types a project id to
 * browse, matching the CLI's own `--project PROJECT_ID` mental model. See
 * docs/adr/011-memory-center-project-scoped-tasks.md, including why this
 * phase also had to make CodexiaCore's `POST /tasks` accept a `project_id`
 * at all - without it, Desktop-created tasks could never populate this
 * screen with anything real.
 */
function Memory() {
  const [projectIdInput, setProjectIdInput] = useState("");
  const [submittedProjectId, setSubmittedProjectId] = useState<string | null>(null);
  const items = useMemoryStore((state) => state.items);
  const fetchState = useMemoryStore((state) => state.fetchState);
  const error = useMemoryStore((state) => state.error);
  const fetchMemory = useMemoryStore((state) => state.fetchMemory);
  const forgetKey = useMemoryStore((state) => state.forgetKey);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = projectIdInput.trim();
          if (!trimmed) return;
          setSubmittedProjectId(trimmed);
          void fetchMemory(trimmed);
        }}
      >
        <input
          type="text"
          value={projectIdInput}
          onChange={(event) => setProjectIdInput(event.target.value)}
          placeholder="Project id"
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!projectIdInput.trim() || fetchState === "loading"}
        >
          {fetchState === "loading" ? "Loading…" : "Load"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {submittedProjectId === null ? (
        <p className="text-sm text-muted-foreground">
          Enter a project id to browse its governed memory (matches the CLI's --project).
        </p>
      ) : items.length === 0 && fetchState !== "loading" ? (
        <p className="text-sm text-muted-foreground">
          No memory items for project &quot;{submittedProjectId}&quot; yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item) => (
            <MemoryItemCard
              key={item.id}
              item={item}
              onForget={() => void forgetKey(submittedProjectId, item.key)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export default Memory;

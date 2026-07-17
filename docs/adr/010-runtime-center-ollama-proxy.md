# ADR-010: Runtime Center — Ollama State via a Core Proxy, Not a Direct Connection

**Status:** Accepted

## Context

Phase 7 was originally scoped as "GPU Center" (`navigation.ts`, ADR-003,
ADR-006) with no defined content - the name was placeholder-level, carried
over from the original 9-screen list. CodexiaCore has no GPU/VRAM/hardware
concept anywhere, and explicitly rejected building one: Faz 27 in
CodexiaCore's `MASTER_ROADMAP_V2.md` scrapped an original "Resource
Scheduler" (GPU/RAM monitoring) framework with the stated reason _"Codexia
yerel GPU çıkarımı yapmıyor, uzak/yerel HTTP API'lere gidiyor"_ (Codexia
doesn't do local GPU inference itself; it talks to remote/local HTTP
APIs). A literal host-machine GPU dashboard (`nvidia-smi`, driver/CUDA
detail) would therefore have no connection to anything Codexia actually
does, and would need NVIDIA-specific tooling with no generic cross-vendor
equivalent.

The screen was rescoped and renamed before any code was written: **Runtime
Center** - the fourth pillar alongside Task Center (what's running),
Timeline (what happened), and Provider Center (how well) - answers
_where_ a model is actually running, scoped narrowly to what Ollama's own
API already reports about models it currently has loaded in memory
(`GET /api/ps`).

## Decision

**Desktop reaches Ollama's runtime state through CodexiaCore, never
directly.** CodexiaCore gained `GET /providers/ollama/runtime` (its own
ADR-013) - a thin, read-only proxy over `GET /api/ps`. Desktop's Core
Bridge calls that endpoint exactly like every other CodexiaCore capability
it consumes; nothing in `core_bridge`/`services` opens a connection to
Ollama's own port.

This was the one point actually in question during this phase's design -
an earlier draft proposed Desktop connecting to Ollama directly, reasoning
that a read-only status check felt too trivial to justify a CodexiaCore
change. Rejected on inspection of this repo's own founding decisions:

- **ADR-003**: _"Core Bridge is pure transport - the only code in the
  whole app that speaks HTTP/SSE to Codexia Core."_ A second HTTP target
  (Ollama's own port) is a second transport this layer was never designed
  to carry, not a shortcut around it.
- **ADR-004**: _"Any endpoint or field Codexia Desktop needs that Core
  doesn't yet expose is proposed and built as a general CodexiaCore API
  capability... not as a quick addition scoped to what Desktop's current
  screen needs."_ `/metrics` (Phase 6) is cited in that ADR's own text as
  exactly this pattern already in motion; a direct-to-Ollama bypass here
  would be the first violation of a rule this project has followed
  consistently for two prior phases.
- **Concrete failure mode a bypass would introduce**: Ollama's address is
  `settings.ollama_base_url` inside CodexiaCore, not anything Desktop
  reads today. If Core reaches Ollama through a host/port Desktop can't
  independently resolve (a container network, a non-default port), a
  direct Desktop connection would silently point at nothing while Core
  itself works fine - a config-drift bug with no proxy pattern would ever
  produce, since the proxy always asks the same process actually talking
  to Ollama.
- **Multi-client cost**: Mobile/VS Code/Cloud (this project's own stated
  roadmap) would each need to reimplement the same direct-Ollama logic
  independently were this endpoint not built once in Core - the exact
  duplication ADR-003 exists to prevent.

Faz 27's rejection was of a _scheduler_ (allocation/decision logic on top
of hardware metrics), not of Core answering a _read-only_ question about
its own configured provider - `/metrics` already established that a thin,
faithful proxy over already-available data doesn't reintroduce the
business logic Faz 27 actually rejected.

**Ollama-scoped, not a general provider-status endpoint.** OpenRouter and
the generic OpenAI-compatible provider have no "loaded in memory" concept
to report - genericizing this endpoint's shape for providers that don't
have what it represents would be premature, see CodexiaCore's ADR-013.

**No system-level GPU/hardware detail anywhere in this screen.** No
`nvidia-smi`, no CUDA/driver version, no scheduler or resource-allocation
behavior - `Runtime.tsx` renders exactly what `OllamaRuntimeStatus`
carries: a model name, its VRAM footprint, and when Ollama will unload it
if idle.

**Same one-shot-fetch, no-poll-loop shape as Provider Center** (ADR-009):
`services::runtime::fetch_ollama_runtime` and `runtimeStore.ts`'s
`fetchRuntime()` mirror `services::metrics`/`metricsStore.ts` field-for-
field - fetched on mount and on an explicit "Refresh" click, no shared
Tauri-managed state, no periodic poll. Loaded-model state changes only as
a side effect of a task actually running inference, the same reasoning
Provider Center already established for cost/model-health data.

## Alternatives Considered

- **Desktop connects to Ollama directly** (see Decision above for the
  full rejection rationale) - the only alternative seriously considered;
  rejected as an architecture violation with a real config-drift failure
  mode, not merely a style preference.
- **A literal GPU Center: `nvidia-smi`/`sysinfo` host-machine dashboard,
  no CodexiaCore involvement** - rejected: disconnected from anything
  Codexia actually does (it never runs local inference against host GPU
  state the way this would imply), NVIDIA-specific with no cross-vendor
  story, and contradicts Faz 27's explicit scope decision that Codexia
  doesn't concern itself with local GPU hardware at all.
- **Defer this phase entirely, build Approval Center instead** -
  considered given Faz 27's rejection and the screen's originally-undefined
  scope; not taken once the Ollama-runtime reframing gave the phase a
  real, coherent, already-available data source.

## Consequences

- Runtime Center works only for the Ollama provider - a session using
  OpenRouter/generic exclusively will always see `reachable: false` (no
  Ollama configured/running), which is correct, not a bug: those
  providers have nothing analogous to report.
- If OpenRouter/generic ever gain a comparable "what's active right now"
  concept, extending this screen to cover it is a new decision building on
  CodexiaCore's own future API surface, not a retrofit of this endpoint's
  Ollama-specific shape.
- `docs/adr/003-layered-architecture.md` and
  `docs/adr/006-application-shell-navigation.md` still say "GPU Center" in
  their own historical text - left as-is, since ADRs record the decision
  as understood at the time they were written; this ADR is the current,
  authoritative name and scope for this phase going forward.

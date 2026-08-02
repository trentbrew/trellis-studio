# Claude Code (subscription) in the agent companion — ACP backend

> **Status:** Spec v0 — tracked on **studio** graph.  
> **Tracking:** **TRL-185** (epic) · **TRL-187**–**TRL-193** (CC0–CC6) · spec in this file.  
> **North star:** Use **Claude Pro/Max via Claude Code** (same auth as terminal) inside `shell.companion`, with structured chat UI — not a second subscription path through OpenCode API keys.  
> **Related:** [agent-focus-context.md](./agent-focus-context.md) · [session-branches.md](./session-branches.md) · [agent-lanes.md](../../tooling/planning/agent-lanes.md) · OpenCode [ACP README](../packages/opencode/src/acp/README.md) · desk [claude-adapter.sh](../../.cursor/hooks/adapters/claude-adapter.sh)

## Problem

Studio’s right dock (`#chat-panel`, `data-ui-region="companion"`) only talks to **OpenCode sessions** over HTTP (`:4096`). Claude Code in the embedded terminal uses **product auth** and its own session store (`~/.claude/…`).

| Symptom | Cause |
| ------- | ----- |
| Pro/Max works in terminal, not in sidebar | Companion ≠ Claude Code runtime |
| “Same prompt, two threads” | OpenCode `session/*` vs Claude session ids |
| OpenCode `/connect` Anthropic Pro/Max | Removed from bundled plugins (1.3.0); not Anthropic-supported |
| TUI in sidebar | PTY can render TUI; companion is message UI, not a terminal |

**Subscription access in the sidebar is achievable** by making the companion an **ACP client** to a **Claude Code ACP bridge**, not by syncing bytes from the terminal TUI.

## North star

```text
User types in companion (shell.companion)
        │
        ▼
  AgentRuntime ──► ACP Client (Studio)
        │              │ JSON-RPC / stdio
        │              ▼
        │         claude-code-acp (subprocess)
        │              │ Claude Agent SDK + CLI auth
        │              ▼
        │         Claude Code (Pro/Max subscription)
        │
        └──► (default) OpenCode SDK ──► :4096 (unchanged)
```

1. **One conversation surface** per tab — companion OR terminal TUI for Claude, not both on the same task.
2. **Same auth as terminal** — bridge uses Claude Code login; Studio never stores Anthropic subscription tokens in OpenCode `auth`.
3. **Reuse companion chrome** — `MessageTimeline`, `SessionComposerRegion`, permissions, review handoff where ACP exposes them.
4. **Trellis stays on graph** — MCP + hooks for ops/lanes; optional parity with harness `trellis code`.

## Non-goals (v1)

- Live mirror of an active Claude Code **TUI** session in the sidebar
- Reviving OpenCode-native **Claude Pro/Max OAuth** in provider plugins
- Replacing OpenCode as the default agent for all Studio users
- Browser-only turtlecode (`:3333` WebContainer) — no real Claude CLI there
- Official Anthropic endorsement of subscription-via-bridge (operational risk called out below)

## Architecture

### Agent backends

Introduce a per-workspace (per `directory`) **agent backend** setting:

| Backend | Transport | Auth | Session store |
| ------- | --------- | ---- | ------------- |
| `opencode` (default) | HTTP SDK → local OpenCode server | Provider oauth/API (Codex, Copilot, keys) | OpenCode DB / API |
| `claude-acp` | ACP stdio → subprocess | Claude Code CLI (`claude` login / setup-token) | Claude native + ACP session id map |

```ts
type AgentBackend = "opencode" | "claude-acp"

type AgentBackendConfig = {
  backend: AgentBackend
  /** claude-acp only */
  bridge?: {
    command: string // default: "npx"
    args: string[] // default: ["@zed-industries/claude-code-acp"]
    env?: Record<string, string>
  }
}
```

Persist under existing settings / workspace prefs (same pattern as layout session width).

### ACP client layer (new: `packages/app`)

| Module | Responsibility |
| ------ | -------------- |
| `src/agent/acp-client.ts` | Spawn bridge, `ndJsonStream`, connection lifecycle |
| `src/agent/acp-session.ts` | `session/new`, `session/prompt`, `session/load`, abort |
| `src/agent/acp-events.ts` | Subscribe to `session/update` → internal message model |
| `src/agent/runtime.ts` | `AgentRuntime` interface; `OpenCodeRuntime` + `ClaudeAcpRuntime` |
| `src/context/agent-runtime.tsx` | Solid provider; switches SDK vs ACP by backend |

**Dependency:** `@agentclientprotocol/sdk` (already in `packages/opencode`; add to `packages/app`).

### Bridge selection (v1 default)

Use **`@zed-industries/claude-code-acp`** (Zed-maintained; maps ACP ↔ Claude sessions with resume).

Alternatives (document only): `@mrtkrcm/acp-claude-code`, community `acp-claude-code` (deprecated).

Env knobs (pass through settings UI advanced):

| Env | Purpose |
| --- | ------- |
| `ACP_PERMISSION_MODE` | `default` \| `acceptEdits` \| … |
| `ACP_PATH_TO_CLAUDE_CODE_EXECUTABLE` | Non-PATH `claude` |
| `ACP_MAX_TURNS` | Safety cap |

### Message model adapter

Companion UI today expects OpenCode **message parts** from the global event stream. For `claude-acp`, map ACP updates:

| ACP `sessionUpdate` | Companion UI |
| ------------------- | ------------ |
| `agent_message_chunk` | Assistant text (streaming) |
| `agent_thought_chunk` | Reasoning block (if enabled in UI) |
| `tool_call_update` | Tool card (reuse `message-part` patterns) |
| `plan` | Plan approval banner hook |
| `usage_update` | Token/cost footer (optional v1) |

Implement a thin **`NormalizedMessage` / `NormalizedPart`** type both runtimes implement so `MessageTimeline` stays backend-agnostic.

### Auth UX

**Prerequisite (user-facing):** Claude Code authenticated on the machine running the OpenCode/Studio backend (same host as `:4096`, not the browser alone when remote).

| Step | UI |
| ---- | -- |
| Detect | On backend `claude-acp`, probe `claude --version` + auth status (bridge or `claude auth status` if available) |
| Not authed | Companion banner: “Log in to Claude Code” → **terminal-auth** spawn in PTY: `claude login` or documented setup-token flow |
| Authed | Show “Claude Pro/Max via Claude Code” in model/agent selector |

ACP **`terminal-auth`** client capability (already used by OpenCode ACP agent for `opencode auth login`): Studio client advertises `_meta["terminal-auth"]` and runs auth commands in **existing** `TerminalPanel` PTY.

Do **not** copy OAuth tokens into OpenCode `auth` store.

### MCP and Trellis

On `session/new`, pass `mcpServers` per ACP spec (same handshake Zed uses):

1. **Desk MCP** — `tooling/mcp/desk-servers.json` resolved for workspace `directory` (graph at `localhost:1414`, trellis tools).
2. **Project `opencode.jsonc` / `.cursor/mcp.json`** — merge rules TBD; prefer same manifest as `trellis code` harness.

OpenCode server **need not** be the inference path for `claude-acp`; it may still run for file index, Trellis store routes, and `opencode` backend switching.

**Hooks:** Claude tool events continue to flow to `.trellis` via [claude-adapter.sh](../../.cursor/hooks/adapters/claude-adapter.sh) when user also uses terminal Claude; companion path should not disable hooks.

### Session tabs and resume

| Feature | `opencode` | `claude-acp` v1 | v2 |
| ------- | ---------- | --------------- | -- |
| New tab | `session.create` API | ACP `session/new` | |
| List sessions | OpenCode session list | ACP `session/list` + Claude project dirs | |
| Resume | OpenCode session id | ACP `session/load` + Claude resume id | Pick from `~/.claude/projects/…` |
| Fork | OpenCode fork → lane (ADR 0006) | Defer or map to Claude fork if bridge supports | |

Store mapping in workspace-local index:

```json
{ "acpSessionId": "…", "claudeSessionId": "…", "cwd": "…", "title": "…" }
```

### Permissions and review

ACP **`session/request_permission`** → reuse existing permission dialog patterns (or Studio modal).

File edits from Claude tools → **review panel** / diff tab:

- Prefer ACP client callbacks `fs/read_text_file`, `fs/write_text_file` wired to Studio VFS (already have file tree + editor).
- Align with [session-branches.md](./session-branches.md) finish flow in v2 (branch-backed work sessions).

### Layout and ontology

| Region | Change |
| ------ | ------ |
| `shell.companion` | Backend-agnostic; add `data-agent-backend` attribute |
| Agent selector | Settings + session header: OpenCode \| Claude Code |
| `shell.panel` terminal | Auth helper + optional “open Claude Code TUI” (unchanged) |

## Phased delivery

### Phase CC0 — Spike and bridge contract

**Goal:** Prove subscription-backed prompts from a minimal ACP client.

| Task | Notes |
| ---- | ----- |
| Local script or Vitest harness | Spawn `npx @zed-industries/claude-code-acp`, `initialize`, `session/new`, `session/prompt` |
| Document auth prereqs | README section in spec → `packages/app/AGENTS.md` |
| Capture sample `session/update` stream | Fixture JSON for adapter tests |
| Decision record | Confirm bridge package + version pin in studio `package.json` or `npx` only |

**Acceptance:** One end-to-end prompt returns streamed text in harness; fails clearly when not logged in.

**Est:** S

---

### Phase CC1 — Agent runtime abstraction

**Goal:** Companion code paths call `AgentRuntime`, not raw `useSDK()` only.

| Task | Notes |
| ---- | ----- |
| `AgentRuntime` interface | `createSession`, `prompt`, `abort`, `subscribe`, `listSessions` |
| `OpenCodeRuntime` | Wrap existing SDK/global event usage |
| `context/agent-runtime.tsx` | Provider selected by `AgentBackend` |
| Settings UI | Workspace setting `agent.backend` default `opencode` |

**Acceptance:** Toggle backend in dev flag; OpenCode path unchanged (regression smoke).

**Deps:** CC0

**Est:** M

---

### Phase CC2 — ACP client + Claude runtime

**Goal:** `claude-acp` backend functional in isolation (dev panel or hidden route).

| Task | Notes |
| ---- | ----- |
| `acp-client.ts` | Subprocess lifecycle, stderr logging, restart on crash |
| `ClaudeAcpRuntime` | Implement `AgentRuntime` |
| Event adapter | `session/update` → `NormalizedPart[]` |
| Process discovery | Backend runs bridge on **server host** (turtlecode); document remote dev limitation |

**Acceptance:** Hidden `/session?agent=claude-acp` sends prompt and renders streamed reply.

**Deps:** CC1

**Est:** L

---

### Phase CC3 — Companion integration

**Goal:** Production wiring in `session.tsx` companion.

| Task | Notes |
| ---- | ----- |
| Wire `MessageTimeline` + composer | Use `AgentRuntime` for active backend |
| Session tabs | Separate tab namespace or prefix ids (`claude:…`) to avoid OpenCode id collisions |
| Auth banner + terminal-auth | Login flow in PTY |
| Model/mode selector | Hide OpenCode provider picker when `claude-acp`; show Claude model list from ACP `loadSession` |
| i18n | `en.ts` strings for Claude backend |

**Acceptance:** User selects “Claude Code” in companion, completes auth once, multi-turn chat in sidebar on `localhost:4848`.

**Deps:** CC2

**Est:** L

---

### Phase CC4 — Tools, permissions, MCP

**Goal:** Parity with harness for Trellis-aware coding.

| Task | Notes |
| ---- | ----- |
| MCP injection on `session/new` | Desk trellis-graph + project servers |
| Permission UI | Map ACP permission requests |
| Tool cards | Bash/edit/read tools in timeline |
| Focus context (optional) | Inject `[FOCUS]` text into prompt when [agent-focus-context.md](./agent-focus-context.md) F1+ ships |

**Acceptance:** Prompt “query graph for active project” succeeds with MCP; edit permission shows UI.

**Deps:** CC3

**Est:** M

---

### Phase CC5 — Session list, resume, fork policy

**Goal:** Don’t lose threads on reload.

| Task | Notes |
| ---- | ----- |
| Persist `acpSessionId` ↔ `claudeSessionId` map | Workspace storage |
| Resume picker | List Claude projects / ACP sessions |
| Fork | Document: defer lane binding OR hook Claude fork → `trellis lane fork` (ADR 0006) |
| Main vs work session | Align with [session-branches.md](./session-branches.md) later |

**Acceptance:** Reload Studio, resume last Claude companion session.

**Deps:** CC3

**Est:** M

---

### Phase CC6 — Polish, remote, docs

**Goal:** Shippable beta.

| Task | Notes |
| ---- | ----- |
| Error states | Bridge crash, auth expired, version mismatch |
| Remote Studio | Banner when API host ≠ user machine (auth must run on server via SSH/terminal) |
| `packages/app/AGENTS.md` + docs site | `docs/content/3.studio/claude-code-companion.md` |
| QA | `bun typecheck` in `packages/app`; adapter unit tests |

**Deps:** CC4–CC5

**Est:** S–M

## Work unit mapping (studio graph)

| Phase | Issue | Title | Est. |
| ----- | ----- | ----- | ---- |
| — | **TRL-185** | Epic: Claude Code in Companion (ACP) | — |
| CC0 | **TRL-187** | Claude companion CC0 ACP bridge spike | S |
| CC1 | **TRL-188** | Claude companion CC1 AgentRuntime abstraction | M |
| CC2 | **TRL-189** | Claude companion CC2 ACP client and ClaudeAcpRuntime | L |
| CC3 | **TRL-190** | Claude companion CC3 shell.companion integration | L |
| CC4 | **TRL-191** | Claude companion CC4 MCP permissions tools | M |
| CC5 | **TRL-192** | Claude companion CC5 session resume mapping | M |
| CC6 | **TRL-193** | Claude companion CC6 docs remote polish | S |

```bash
cd ~/TURTLE/Projects/TRELLIS/studio
trellis issue list --parent TRL-185
trellis issue start TRL-187   # CC0 spike
```

**Related epics (do not merge):** Agent Focus Context · Session Branches (TRL-108) · Agent Lanes (TRL-34).

## Risks and policy

| Risk | Mitigation |
| ---- | ---------- |
| Anthropic ToS / unsupported subscription use in third-party UI | Treat as **power-user opt-in**; document; default remains `opencode` |
| Bridge breakage on Claude CLI updates | Pin bridge version; CI smoke CC0 |
| Two agents, one repo | UI copy: pick one backend per task |
| Remote dev | terminal-auth on **backend** machine; clear UX |
| Feature drift vs OpenCode | Keep OpenCode default; Claude path explicit |

## Open questions

1. **Pin bridge in monorepo** vs `npx` at runtime? (Recommend: devDependency in `packages/app` for reproducible CI.)
2. **Single OpenCode server required?** For Trellis store/CMS while on `claude-acp` — likely yes; document.
3. **Session tab UX** — Separate “Claude” tab group vs unified list with badges?
4. **Codex parity** — `@zed-industries/codex-acp` as third backend later? Same `AgentRuntime` pattern.
5. **Native `claude --acp`** — Switch bridge when Anthropic ships first-party ACP flag.

## Validation strategy

| Layer | Check |
| ----- | ----- |
| CC0 | Scripted ACP prompt; fixture-based adapter tests |
| CC1 | OpenCode regression: create session, send message |
| CC3 | Manual: 4848 + local backend, auth, 3-turn chat |
| CC4 | MCP tool call visible; Trellis graph query |
| CI | `cd packages/app && bun typecheck`; `cd packages/opencode && bun test test/acp` |

## References (code)

| Area | Path |
| ---- | ---- |
| Companion shell | `packages/app/src/pages/session.tsx` (`#chat-panel`) |
| Message UI | `packages/app/src/pages/session/message-timeline.tsx`, `packages/ui/.../message-part.tsx` |
| OpenCode ACP server | `packages/opencode/src/acp/agent.ts`, `src/cli/cmd/acp.ts` |
| OpenCode ACP docs | `packages/opencode/src/acp/README.md` |
| Provider connect (not Claude sub) | `packages/app/src/components/dialog-connect-provider.tsx` |
| Codex subscription pattern | `packages/opencode/src/plugin/codex.ts`, `packages/app/src/lib/codex-model.ts` |
| Trellis harness | `trellis-node/src/cli/index.ts` (`trellis code`), desk `just trellis code` |
| Claude hooks | `.cursor/hooks/adapters/claude-adapter.sh` |
| UI ontology | `packages/app/ONTOLOGY.md` (`shell.companion`) |

## Changelog

| Date | Change |
| ---- | ------ |
| 2026-05-30 | Initial spec v0 from desk conversation (ACP + subscription via Claude Code bridge) |
| 2026-06-01 | Seeded studio graph: TRL-185 epic, TRL-187–TRL-193 (CC0–CC6) |
| 2026-06-01 | CC0 shipped: `packages/app/src/agent/*`, `bun run acp:spike`; CC1 scaffold: `AgentRuntime`, `AgentBackendProvider` |

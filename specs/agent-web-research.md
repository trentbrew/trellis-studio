# Agent Web Research Stack

> Milestone tracker: **TRL-126** · children **TRL-127**–**TRL-130**  
> Companion: [research-command.md](./research-command.md) (primary UX entry point)

## Problem

Agents relied on weak MCP search (e.g. DuckDuckGo) when the native `websearch` tool was gated behind the OpenCode provider. Single-query search is insufficient for open-ended investigation, and there was no path to exhaustive multi-step research with citations.

## Target stack

Three tiers, increasing cost and depth:

| Tier | Tool / agent | Latency | Best for |
|------|----------------|---------|----------|
| **Quick** | `websearch` (Exa default) | seconds | Facts, versions, API docs, “what is X?” |
| **Deep** | `research` subagent (`websearch` + `webfetch`, multi-hop) | 1–3 min | Comparisons, how-things-work, plan-mode context |
| **Exhaustive** | `deep_research` (Gemini Interactions API) | 2–20 min | Market scans, literature surveys, due diligence |

### Providers (`websearch`)

- **Exa** — default, no API key (`https://mcp.exa.ai/mcp`)
- **Parallel** — opt-in via `OPENCODE_ENABLE_PARALLEL=1` or `OPENCODE_WEBSEARCH_PROVIDER=parallel` + `PARALLEL_API_KEY`

### Deep research (`deep_research`)

- Gemini Interactions API, agents `deep-research-preview-04-2026` (standard) and `deep-research-max-preview-04-2026` (max)
- Requires `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENCODE_GEMINI_API_KEY`)
- Async poll until complete; returns report wrapped in `<deep_research_report>`

### Research subagent

- Native agent `research` — web-only investigation, no codebase edits
- Permissions: `websearch`, `webfetch`, `deep_research`, `read`
- Prompt: `packages/opencode/src/agent/prompt/research.txt`

## Tool selection guidance (for agents)

```
Need a single fact or doc URL?           → websearch (+ webfetch to verify)
Need several angles / corroboration?     → delegate to research subagent
Need a full cited report on a topic?     → deep_research (or /research exhaustive)
Exploring this repo's code?              → explore subagent (not research)
```

## Citation rules

System prompt block `<web_research>` applies to all tiers:

- Web results are evidence, not truth
- Cite URLs next to claims; never invent sources
- Use `webfetch` on primary URLs before relying on snippets for dates, versions, pricing, etc.
- Say what is unknown when sources conflict or are missing

## Implementation status

| Issue | Status | Notes |
|-------|--------|-------|
| TRL-127 Enable Exa for all providers | ✅ | Removed registry gate |
| TRL-128 Parallel provider | ✅ | `mcp-websearch.ts`, `OPENCODE_ENABLE_PARALLEL` |
| TRL-129 Gemini Deep Research tool | ✅ | `deep_research` tool |
| TRL-130 Research subagent | ✅ | `research` agent, plan-mode Phase 1 |
| TRL-138 Research sources | ✅ | Source entities + Sources footer UI |
| TRL-137 `/research` command | ✅ Phase 1 | `.opencode/command/research.md` |

## Files

| Path | Role |
|------|------|
| `packages/opencode/src/tool/websearch.ts` | Exa / Parallel search |
| `packages/opencode/src/tool/mcp-websearch.ts` | Shared MCP client |
| `packages/opencode/src/tool/deep-research.ts` | Gemini Deep Research |
| `packages/opencode/src/agent/prompt/research.txt` | Research subagent prompt |
| `packages/opencode/src/agent/agent.ts` | `research` agent definition |
| `packages/opencode/src/file/source-entity.ts` | Source graph entity upsert |
| `packages/opencode/src/capture/sources.ts` | Auto-capture from research tools |
| `.opencode/command/research.md` | `/research` slash command |

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENCODE_WEBSEARCH_PROVIDER` | `exa` \| `parallel` override |
| `OPENCODE_ENABLE_PARALLEL` | Prefer Parallel when set |
| `PARALLEL_API_KEY` | Parallel Web Search auth |
| `EXA_API_KEY` | Optional Exa key |
| `GEMINI_API_KEY` | Required for `deep_research` |
| `capture.researchSources` | Auto-save research URLs as Source entities (default true) |

## Research sources (TRL-138)

Every research pass should end with a stylized **Sources** footer in the session timeline. URLs consulted via `websearch`, `webfetch`, `deep_research`, or `codesearch` are auto-persisted as **`Source`** entities when `capture.researchSources` is enabled (default).

- **Source** — citation/provenance node for evidence retrieved during research
- **Link asset** — user-facing bookmark in Design → Links (distinct lifecycle)
- Session linkage: `session:{id} → consulted → source:{hash}`

## Out of scope (for now)

- Vertex AI / enterprise Gemini Deep Research hosting
- MCP replacement for all external search servers
- `cites` edges from saved reports/notes (TRL-137 Phase 2 `--save`)
- Research projection pack (`papers`) — see WU-8

## Related

- TRL-94 Server-side content extractor (browser read path)
- TRL-88 Agent-testable runtime (browser is read surface, not automation target)
- [workspace-process-discovery.md](./workspace-process-discovery.md) — **TRL-5** sandbox TCP listeners + agent tool (orthogonal)
- Plan mode Phase 1: `explore` for code, `research` for web

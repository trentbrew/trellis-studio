# `/research` Slash Command

> Milestone: **TRL-126** · UX entry point for [agent-web-research.md](./agent-web-research.md)  
> Tracking issue: **TRL-137**

## Summary

`/research` is the user-facing command for web investigation in Turtlecode IDE. It turns a natural-language topic into a structured, cited research artifact in the session — and optionally in the Trellis graph — without requiring the user to pick tools, agents, or depth tiers manually.

**One-liner:** `/research <topic>` → research subagent runs the appropriate tier → user gets a report with sources.

---

## User stories

1. **Teacher planning a unit:** `/research common misconceptions about fractions for 4th grade` → quick summary + links she can bookmark.
2. **Builder evaluating tech:** `/research exhaustive: Bun vs Node for serverless edge 2026` → long-running deep report with comparison table.
3. **Plan mode:** User in plan mode runs `/research Stripe Connect onboarding requirements` before implementation planning.
4. **Persist findings:** `/research --save competitive landscape for AI coding IDEs` → report + Trellis note + link assets for cited URLs.

---

## Invocation

```
/research [<flags>] <topic...>
```

### Flags (v1)

| Flag | Alias | Effect |
|------|-------|--------|
| `--quick` | `-q` | Force tier 1: 1–3 `websearch` calls, no subagent |
| `--deep` | `-d` | Default. Delegate to `research` subagent |
| `--exhaustive` | `-x` | Use `deep_research` tool (Gemini; requires API key) |
| `--save` | `-s` | Persist report + sources to Trellis (see below) |
| `--format <type>` | | Output shape: `brief` (default), `report`, `bullets` |

If no flag is given, **auto-select tier** from topic heuristics (see Auto-routing).

### Examples

```
/research latest WCAG 2.2 color contrast rules
/research --quick Gemini Flash pricing 2026
/research --exhaustive market analysis: AI-native IDEs for educators
/research --save --format report state of RDF-star adoption
/research -d how does OpenCode load slash commands from .opencode/command
```

Arguments after flags become `$ARGUMENTS` in the command template (standard OpenCode command behavior).

---

## Command definition

File: `.opencode/command/research.md`

```yaml
---
description: Research a topic on the web with citations (quick, deep, or exhaustive)
agent: research
subtask: true
---
```

Body: structured prompt template (see Workflow). `subtask: true` + `agent: research` matches existing patterns (`db-schema.md`, `commit.md`) — runs as a Task/subagent under the current session agent.

Optional future frontmatter:

```yaml
model: google/gemini-2.5-flash   # optional override for orchestrator only
permission:
  deep_research: allow
```

---

## Auto-routing (when no tier flag)

| Signal | Tier | Mechanism |
|--------|------|-----------|
| `--quick` / `-q` | Quick | Inline prompt: websearch only |
| `--exhaustive` / `-x` | Exhaustive | Must call `deep_research` |
| Topic contains “exhaustive:”, “full report”, “due diligence”, “literature review” | Exhaustive | Same |
| `--deep` / default | Deep | Research subagent |
| Topic &lt; ~12 words, single factual question | Quick | Optional optimization in v2 |

Auto-routing is implemented in the **command template text** (agent instructions), not server-side parsing — keeps v1 shippable as a markdown command only.

---

## Workflow

### Phase 0 — Parse intent

Command template receives `$ARGUMENTS`. Agent extracts:

- Topic (required)
- Tier from flags or heuristics
- Output format (`brief` | `report` | `bullets`)
- Whether to `--save` to Trellis

### Phase 1 — Research

**Quick**

1. One targeted `websearch` (prefer `type: deep`, `livecrawl: preferred` for high-stakes facts)
2. `webfetch` on 1–2 primary URLs
3. Synthesize with citations

**Deep (default)**

1. Delegate to self as research specialist (already `research` agent via subtask)
2. 2–5 `websearch` queries from different angles
3. `webfetch` on authoritative sources
4. Cross-check conflicting claims; state uncertainty

**Exhaustive**

1. Call `deep_research` with structured brief (include desired sections in brief)
2. Optionally supplement with `webfetch` on key citations
3. Do not duplicate full deep research with redundant searches

### Phase 2 — Respond

Post to session using format:

**Brief (default)**

```markdown
## Research: {topic}

{2–4 paragraphs with inline or footnote citations}

### Sources
- [title](url) — why it matters
```

**Report**

```markdown
# {topic}

## Summary
...

## Findings
### {section}
...

## Open questions
...

## Sources
| # | Source | Used for |
|---|--------|----------|
```

**Bullets**

- Claim → [source](url)
- ...

### Phase 3 — Persist (`--save`)

When `--save` is set, after the session response:

1. **Note entity** — create or update a Trellis note (CMS `note` or tagged `type:research`) with report body + metadata (`researchedAt`, `tier`, `interactionId` if exhaustive)
2. **Source entities** — for each cited URL, upsert a `Source` graph entity (auto-captured during research; `--save` adds `cites` edges from the note)
3. **Link assets (optional)** — user may promote important sources to Design link assets via `create_link_asset`
4. **Optional:** emit `vcs:decision` or comment on active `issue:TRL-*` if session is issue-scoped

Persistence instructions live in the command template until a dedicated `research_save` tool exists (v2).

---

## IDE UX

### Slash menu

- **Trigger:** `/research`
- **Badge:** `custom` (same as other `.opencode/command/*` entries)
- **Description:** “Research a topic on the web with citations”
- **Source:** `sync.data.command` from server `Command.list()`

No new builtin `slash:` entry in `use-session-commands.tsx` required for v1 — custom commands appear automatically via prompt-input slash popover.

### Progress / feedback

| Tier | User-visible behavior |
|------|------------------------|
| Quick | Normal streaming response |
| Deep | Subagent task card (“Research: …”) |
| Exhaustive | Subagent card + message that research may take several minutes; show `deep_research` tool call in timeline |

### v2 enhancements (not v1)

- Dedicated **Research panel** or session tab for long reports
- Progress polling UI for `deep_research` interaction status
- “Save to Trellis” button on completed reports (even without `--save`)
- Pin `/research` to command palette with `mod+shift+R`

---

## Permissions

| Permission | Quick | Deep | Exhaustive |
|------------|-------|------|------------|
| `websearch` | ✓ | ✓ | ✓ (optional supplement) |
| `webfetch` | ✓ | ✓ | ✓ |
| `deep_research` | | | ✓ |
| `asset` (link) | if `--save` | if `--save` | if `--save` |
| `trellis_store_mutate` | if `--save` | if `--save` | if `--save` |

Default session agent (`build`) allows `*`; plan mode restricts edits but should allow research via command (read-only tools).

Ask user once per session for `deep_research` if permission is `ask` (configurable in settings).

---

## Error handling

| Condition | Behavior |
|-----------|----------|
| No `$ARGUMENTS` / empty topic | Command fails fast: “Provide a research topic, e.g. `/research WCAG 2.2 contrast rules`” |
| No `GEMINI_API_KEY` + exhaustive tier | Clear error; suggest `--deep` or set key |
| `deep_research` timeout (20m) | Partial failure message; offer to retry with `--deep` |
| No search results | Report “insufficient evidence”; do not hallucinate |
| `--save` without Trellis initialized | Save to session only; warn user |

---

## Command template (v1 draft)

This is the intended body of `.opencode/command/research.md`:

```markdown
---
description: Research a topic on the web with citations
agent: research
subtask: true
---

You are executing the `/research` command. Investigate the user's topic and return a cited research result.

## Input
$ARGUMENTS

## Parse flags from input
- `--quick` / `-q` → quick tier (websearch + webfetch only)
- `--exhaustive` / `-x` or topic prefix `exhaustive:` → call `deep_research`
- `--save` / `-s` → after responding, persist note + link assets to Trellis
- `--format brief|report|bullets` → output shape (default: brief)

If no tier flag, use **deep** tier (multi-step search + corroboration).

## Rules
- Cite source URLs for every web-backed claim
- Use webfetch on primary sources before stating exact dates, versions, or pricing
- Say what is unknown when evidence is insufficient
- Do not modify code or project files unless `--save` persistence requires store mutations only

## Output
Produce the research result in the requested format, then stop.

## If --save
Create a Trellis note titled with the topic, body = full report, tags: research.
Create link assets for cited URLs (dedupe).
```

---

## Implementation phases

### Phase 1 — Command file only (TRL-137a)

- [x] Add `.opencode/command/research.md` from template above
- [ ] Verify slash menu shows `/research`
- [ ] Manual test: quick / deep / exhaustive topics
- [x] Document in [agent-web-research.md](./agent-web-research.md)

**Acceptance:** `/research <topic>` runs research subagent and returns cited markdown in session.

### Phase 2 — Save path (TRL-137b)

- [ ] Harden `--save` flow (note + link assets)
- [ ] Tag notes `research` for future `papers` projection (WU-8)
- [ ] Wiki-link `[[note:…]]` in report when note id known

### Phase 3 — IDE polish (TRL-137c)

- [ ] i18n: `command.research.*` strings if promoted to builtin
- [ ] Deep research progress indicator in message timeline
- [ ] Optional research report preview component (markdown + source list)

---

## Open questions

1. **Default model for exhaustive tier** — inherit session model for orchestrator; deep_research is Gemini-only today. OK?
2. **Note schema** — CMS `note` vs dedicated `research_report` collection?
3. **Session fork** — should `/research` always run in a forked session to avoid polluting build context? (Default: no, keep in current session.)
4. **Rate limits** — cap exhaustive researches per session/day?
5. **Builtin vs custom** — stay as `.opencode/command/research.md` or promote to `Command.Default.RESEARCH` in opencode core?

---

## Related issues

| ID | Title |
|----|-------|
| TRL-126 | Agent web research stack upgrade (parent) |
| TRL-127–130 | Stack implementation (done) |
| TRL-137 | `/research` slash command |
| TRL-94 | Content extractor (complements webfetch for user-pasted URLs) |
| WU-8 | `papers` projection for saved research notes |

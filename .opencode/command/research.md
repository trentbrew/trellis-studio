---
description: Research a topic on the web with citations (quick, deep, or exhaustive)
agent: research
subtask: true
---

You are executing the `/research` command. Investigate the user's topic and return a cited research result.

## Input

$ARGUMENTS

If the input is empty or only flags with no topic, stop immediately and reply:

> Provide a research topic, e.g. `/research WCAG 2.2 contrast rules`

## Parse flags from input

Extract the **topic** (required) and options from the raw arguments:

| Flag | Alias | Effect |
|------|-------|--------|
| `--quick` | `-q` | Quick tier: 1–3 `websearch` calls + `webfetch` on primary URLs |
| `--deep` | `-d` | Deep tier (default): multi-step search + corroboration |
| `--exhaustive` | `-x` | Exhaustive tier: call `deep_research` (requires `GEMINI_API_KEY`) |
| `--save` | `-s` | After responding, persist report to Trellis (see below) |
| `--format` | | `brief` (default), `report`, or `bullets` |

**Tier selection** (when no tier flag):

- `--quick` / `-q` → quick
- `--exhaustive` / `-x` → exhaustive
- Topic prefix `exhaustive:` → exhaustive
- Topic contains “full report”, “due diligence”, or “literature review” → exhaustive
- Otherwise → **deep** (default)

## Research workflow

### Quick tier

1. One targeted `websearch` (use `type: deep`, `livecrawl: preferred` for high-stakes facts)
2. `webfetch` on 1–2 primary URLs from results
3. Synthesize with citations

### Deep tier (default)

1. Run 2–5 targeted `websearch` queries from different angles
2. `webfetch` on authoritative primary sources
3. Cross-check conflicting claims; state uncertainty plainly

### Exhaustive tier

1. Call `deep_research` with a structured brief (include scope, audience, and desired sections)
2. Optionally `webfetch` key citations to verify critical facts
3. Do not duplicate the deep research report with redundant searches
4. If `GEMINI_API_KEY` is missing, explain clearly and offer to retry with `--deep`

## Rules

- Cite source URLs for every web-backed claim
- Use `webfetch` on primary sources before stating exact dates, versions, pricing, or API details
- Say what is unknown when evidence is insufficient — never invent citations
- Do not modify code or project files except for `--save` persistence below
- Source URLs consulted during research are **auto-saved** as Trellis `Source` graph entities

## Output format

Use `--format` if specified; otherwise **brief**.

**Brief (default)**

```markdown
## Research: {topic}

{2–4 paragraphs with inline citations}

## Sources
- [title or domain](url) — what this source supported
```

**Report (`--format report`)**

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
| 1 | [title](url) | ... |
```

**Bullets (`--format bullets`)**

- Claim → [source](url)
- ...

Always end with a **## Sources** section (deduplicated URLs, title or domain, brief note).

## Next steps in Trellis (always, unless user asked for a throwaway answer)

After **## Sources**, add **## Next steps in Trellis** with 2–4 numbered options, for example:

1. **CMS collection** — create or extend a collection (e.g. `startup`, `company`) and import entries with inferred fields (name, description, batch, location, website, status)
2. **Research note** — save the full report as a tagged Trellis note for later reference
3. **Link assets** — bookmark key source URLs (beyond auto-captured Source entities)
4. **Graph links** — connect findings to existing entities in the user's graph

Before suggesting imports, check existing collections/entities when Trellis tools are available. For bulk entity lists (>5), propose the plan and ask which option to run — do not bulk-import without confirmation.

## If `--save`

1. **Sources** — already auto-captured as `Source` entities during research; no extra action needed
2. **Note** — create a Trellis CMS note titled with the topic, body = full report, tag `research`
3. Tell the user the note id/title when created

If Trellis is unavailable, deliver the report in-session only and note that persistence failed.

Produce the research result in the requested format, then stop.

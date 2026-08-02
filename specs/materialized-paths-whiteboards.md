# Materialized paths & whiteboard storage — Filegraph RFC-002 alignment

> **Status:** Spec v0 — seeded on **studio** graph as **TRL-194** (epic).
> **Milestone:** **TRL-194** (epic) · **TRL-195**–**TRL-199** (children) · **TRL-200** (follow-on — graph-first persistence)
> **North star:** Adopt Filegraph’s **namespace + payload split** for Studio visual content — without replacing Trellis ops as the entity source of truth.
> **Related:** [whiteboard-ontology.md](./whiteboard-ontology.md) · [projections-rail.md](./projections-rail.md) · [agent-focus-context.md](./agent-focus-context.md) · [turtleos-campus-native.md](../../tooling/planning/turtleos-campus-native.md) · Filegraph RFC-002 (`@entities/`, `@canvases/`)

## Problem

New `.whiteboard` files land in repo-root `whiteboards/` with no distinction between **durable project diagrams** and **agent/session scratch**. That clutters the workspace tree and fights the three-tier ontology Trellis already documents:

| Tier | Form | Role |
| ---- | ---- | ---- |
| **1. Graph ID** | `whiteboard:agent-lanes` | Canonical — federation, agents, ops |
| **2. Declaration** | `@canvases/*.whiteboard`, store facts | Human-editable payloads + metadata |
| **3. Materialized path** | Same files on disk | Rebuildable; safe to relocate |

Filegraph solved this with **`@`-namespaces** (semantic buckets) and a **runtime/internal** dir (`.filegraph/`). Trellis has `.trellis/` for ops/kernel but no equivalent convention for canvases.

| Symptom | Cause |
| ------- | ----- |
| `agent-lanes.whiteboard` beside `src/` | Default path is repo-root `whiteboards/` |
| No board-level graph node | Files only; no `whiteboard:*` store entity |
| Agent vs user boards conflated | Single default; no sketch tier |
| Drift between UI, agent prompt, tool | Paths hardcoded in three places |

## North star

```text
User / agent creates board
        │
        ▼
  materialized-paths registry (single source)
        │
        ├── sketch intent  →  .trellis/sketch/<slug>.whiteboard   (runtime, gitignored)
        │
        └── durable intent →  @canvases/<slug>.whiteboard           (versioned, linkable)
        │
        ▼
  optional storeAssert whiteboard:<slug> { path, title, … }
        │
        ▼
  Whiteboards projection lists store + filesystem; graph can link boards
```

**Principles (from Filegraph RFC-002):**

1. **`.trellis/` = causal/runtime** — ops, kernel, sketch scratch. Not the home for durable product diagrams.
2. **`@`-prefix = ontology** — `@canvases/`, `@notes/` signal “materialized content,” not app source.
3. **Registry + payload** — store holds metadata and links; file holds Excalidraw JSON.
4. **One registry file** — agents, UI, and OpenCode tools import the same defaults.

## Non-goals (v1)

- Replacing `vcs:storeAssert` with Filegraph-style `.data` JSON-LD files
- Full `@entities/` mirror for all store types (whiteboards only)
- RFC-001 universal backlink index across the whole repo (follow-on)
- F10 native `materialized/@canvases/` path migration (mac-compat uses `@canvases/` at workspace root)
- Moving existing CMS notes or graph notes into `@notes/` files

---

## Path conventions

### Mac-compat (Studio repos today)

```text
<workspace>/
├── @canvases/                    # Durable Excalidraw boards (tier 2/3)
│   └── agent-lanes.whiteboard
├── .trellis/
│   ├── ops.json                  # causal — do not conflate with canvases
│   ├── sketch/                   # Agent/session scratch boards (gitignored)
│   │   └── session-untitled.whiteboard
│   └── media/                    # existing — unchanged
└── src/ …                        # product code — never default whiteboard parent
```

### Native Campus (F10 target)

```text
facilities/lab/materialized/
├── @canvases/
├── @notes/
└── @entities/
```

Same semantics; path prefix moves under `materialized/`.

### Legacy alias

| Legacy | v1 default | Notes |
| ------ | ---------- | ----- |
| `whiteboards/<slug>.whiteboard` | `@canvases/<slug>.whiteboard` | Read + list both during migration |
| repo-root `*.whiteboard` | — | Treat as discoverable; “Move to @canvases” action optional |

---

## Namespace registry

**New module:** `packages/app/src/lib/materialized-paths.ts`
**Shared re-export:** `packages/whiteboard/src/paths.ts` (Node-safe; no Solid imports)

```ts
export type MaterializedKind = "whiteboard-sketch" | "whiteboard-durable"

export type MaterializedPathRule = {
  kind: MaterializedKind
  /** Directory relative to workspace root (mac-compat). */
  dir: string
  ext: string
  /** store entity prefix when registered */
  entityPrefix?: string
  /** gitignored — not tracked as product artifact */
  gitignored?: boolean
}

export const MATERIALIZED_PATHS: Record<MaterializedKind, MaterializedPathRule> = {
  "whiteboard-durable": {
    kind: "whiteboard-durable",
    dir: "@canvases",
    ext: ".whiteboard",
    entityPrefix: "whiteboard",
  },
  "whiteboard-sketch": {
    kind: "whiteboard-sketch",
    dir: ".trellis/sketch",
    ext: ".whiteboard",
    gitignored: true,
  },
}

export function defaultWhiteboardPath(
  title?: string,
  intent: "durable" | "sketch" = "durable",
): string

export function legacyWhiteboardDirs(): string[] // ["whiteboards", "@canvases"]
```

**Consumers (must import registry, not hardcode):**

| Consumer | Change |
| -------- | ------ |
| `whiteboards-projection.tsx` | `createWhiteboard()` → durable default |
| `packages/whiteboard/src/document.ts` | `defaultWhiteboardPath` delegates to paths module |
| `packages/opencode/src/session/prompt.ts` | Agent hint: `@canvases/<slug>.whiteboard` |
| `packages/opencode/src/tool/whiteboard.ts` | Docstring + examples use registry |
| Projections registry | `query.extensions` unchanged; list merges legacy dirs |

### Sketch vs durable — when to use which

| Intent | Default path | UI entry |
| ------ | ------------ | -------- |
| **+ New whiteboard** (projection) | `@canvases/untitled.whiteboard` | User-facing durable |
| Agent diagram with no path given | `@canvases/<slug>.whiteboard` | Prompt hint |
| Agent-lanes / session thinking | `.trellis/sketch/<slug>.whiteboard` | Agent tool flag or focus context `sketch: true` (v1: explicit path only) |

**Promote sketch → durable:** copy file to `@canvases/`, update store entity path, delete sketch (future UI; not v1 blocker).

---

## Whiteboard store entities

Register durable boards in the Trellis store (same pattern as notes, calendar events):

```ts
// storeAssert on create (durable only)
{
  e: "whiteboard:agent-lanes",
  a: "type",
  v: "whiteboard",
}
{
  e: "whiteboard:agent-lanes",
  a: "path",
  v: "@canvases/agent-lanes.whiteboard",
}
{
  e: "whiteboard:agent-lanes",
  a: "title",
  v: "Agent lanes",
}
```

**Whiteboards projection list (v1):**

1. Query store for `type:whiteboard` entities with `path` attribute.
2. Union with filesystem scan: `@canvases/`, `whiteboards/` (legacy), `.trellis/sketch/` (optional toggle “Show sketch”).
3. Dedupe by normalized path.

**Graph view:** `FileNode` for path + optional link to `whiteboard:*` entity (existing file nodes; enrich when store entity exists).

Element-level bindings (`customData.trellis.bind`) unchanged — see [whiteboard-ontology.md](./whiteboard-ontology.md).

---

## Entity storage tiers & FS projections

Generalizes TRL-194 beyond whiteboards: **where an entity's _content_ is canonical**, and **how files are derived**. North star — the graph is canonical; the filesystem is a rebuildable **projection**, not a co-equal source.

### Storage tier by entity class

| Class | Examples | Canonical | FS role |
| ----- | -------- | --------- | ------- |
| **Small structured** | `note`, `person`, `calendar`, `issue`, `decision` | Store (EAV ops) | Optional read-only export |
| **Large payload** | `whiteboard`, attachments, long media | **Blob + store** (content-addressed blob + facts) | Tier-3 cache, materialized |
| **Prose doc** | long-form notes/docs | Store, or **markdown co-canonical** | Round-trip — only class where ingest is worth it |
| **Product code** | `src/`, `content/` | Files (already) | Not graph-materialized |

### FS projection contract

- **Direction:** `op → materialize FS` by default. `FS → op` (ingest) is **opt-in per namespace** with an explicit conflict policy. No silent co-equal sources.
- **Writability:** projections are **read-only** unless an ingest rule exists. Foreign-tool edits to a read-only projection are lost on next materialize — document per namespace.
- **Format by audience:** **markdown** (human / Obsidian / VS Code), **JSON-LD** (machine / federation / `jq`), **specialized ext** (`.whiteboard`, CMS frontmatter) where the tool demands. Not every format for every type.
- **Path authority:** `materialized-paths.ts` owns `@namespace` dirs/exts. The projections **lens** registry (`lib/projections/registry.ts`) references it — never hardcode dirs/extensions in two places.
- **gitignore:** runtime/scratch (`.trellis/**`) excluded; durable projections (`@canvases/`, `@notes/`) tracked.

**Rule:** materialize to FS when a tool needs a file — never promote the export to source of truth (that rebuilds Filegraph inside a Trellis repo).

### Whiteboard authority — current → target

| | Current (TRL-194 / 195–199) | Target (**TRL-200**) |
| --- | --- | --- |
| **Content canonical** | `.whiteboard` file | Content-addressed **blob** in store |
| **Store entity** | `{type, path, title}` — pointer | `{type, title, contentHash, updatedAt}` + **binding facts** |
| **Write path** | File-first | `storeAssert` + blob; file materialized on save/watch |
| **File** | Source | Tier-3 cache (`@canvases/*` ↔ blob, like `materialized/repo/kernel` ↔ `repo:kernel`) |

**Buys:** store-owned identity, snapshot history, dedupe, authority — renames / external deletes can't orphan a board.
**Does not buy:** element-level causal/semantic merge or board-as-subgraph — that is **element-as-entity** (out of scope; the large track). Blob model stays **last-writer-wins** on whole boards.
**Bindings:** promote `customData.trellis.bind` → store facts (`whiteboard:x binds issue:42`) so boards are queryable without parsing every blob.

---

## VCS & gitignore

### Git

Desk/spoke `.gitignore` additions:

```gitignore
.trellis/sketch/
```

Do **not** gitignore `@canvases/` — durable boards are product artifacts.

### TrellisVCS scan

Today `.trellis` is ignored wholesale. Whitelist sketch separately if needed for watch; **do not** ignore `@canvases/`:

- `@canvases/**` → tracked as file nodes
- `.trellis/sketch/**` → excluded from graph (runtime scratch)

Implementation may live in kernel ignore patterns or Studio opencode file watcher — child issue scopes the exact change.

---

## Migration

**Phase A — read compat (ship first):**

- `listWhiteboardPaths` searches `@canvases/`, `whiteboards/`, optionally `.trellis/sketch/`
- `defaultWhiteboardPath()` writes only to `@canvases/`
- No automatic file moves

**Phase B — optional workspace action:**

- “Relocate to @canvases” for legacy `whiteboards/*` paths
- Update store entities if present

**Phase C — docs & agent defaults:**

- Public docs: `@canvases/` replaces `whiteboards/` in examples
- Agent prompt + tool descriptions updated

---

## Sequencing

| Order | Issue | Why |
| ----- | ----- | --- |
| **1** | TRL-195 Registry + path module | Single source before any consumer changes |
| **2** | TRL-196 Default paths + create flow | Fixes root clutter immediately |
| **3** | TRL-197 Store entities on durable create | Enables graph-native board list |
| **4** | TRL-198 Agent + list compat | Prompt, tool, legacy dir scan |
| **5** | TRL-199 VCS/gitignore + docs | Policy + discoverability |

**Parallelism:** TRL-195 blocks TRL-196 and TRL-198. TRL-197 depends on TRL-196. TRL-199 depends on TRL-196.

---

## Work units (Trellis issues)

| ID | Title | Priority | Depends |
| -- | ----- | -------- | ------- |
| **TRL-194** | Epic: Materialized paths & whiteboard storage (RFC-002) | high | — |
| **TRL-195** | Materialized-paths registry module | high | TRL-194 |
| **TRL-196** | @canvases + .trellis/sketch default paths | high | TRL-195 |
| **TRL-197** | Whiteboard store entities (registry + payload) | high | TRL-196 |
| **TRL-198** | Agent + list compat (prompt, tool, legacy dirs) | medium | TRL-195 |
| **TRL-199** | VCS/gitignore whitelist + public docs | medium | TRL-196 |
| **TRL-200** | Graph-first whiteboard persistence (blob + materialize) | high | TRL-197 |

### Acceptance (TRL-194 epic)

- [ ] Spec committed; linked from `whiteboard-ontology.md` and `projections-rail.md`
- [ ] New boards default to `@canvases/`; sketch path documented and gitignored
- [ ] Durable create registers `whiteboard:*` store entity with `path`
- [ ] Legacy `whiteboards/` still listed; agent prompt references `@canvases/`

---

## Acceptance criteria (children)

### TRL-195 — Registry module

- `materialized-paths.ts` exports `MATERIALIZED_PATHS`, `defaultWhiteboardPath`, `legacyWhiteboardDirs`
- `packages/whiteboard` re-exports path helpers for Node/browser
- Unit tests for slug dedupe and intent selection

### TRL-196 — Default paths

- `createWhiteboard()` in `whiteboards-projection.tsx` uses `@canvases/`
- `defaultWhiteboardPath()` in document.ts removed or delegates to registry
- `.trellis/sketch/` created on first sketch write; gitignore entry added at desk template

### TRL-197 — Store entities

- On durable board create: `storeAssert` `whiteboard:<slug>` with `type`, `path`, `title`
- Whiteboards projection prefers store paths; falls back to file scan
- Delete/rename updates or removes store facts

### TRL-198 — Agent + list compat

- Session prompt hint: `@canvases/<slug>.whiteboard`
- `listWhiteboardPaths` includes `@canvases/` and `whiteboards/`
- Tests updated (`apply-agent-destination`, `whiteboard-navigate`, schema tests)

### TRL-199 — VCS + docs

- TrellisVCS / watcher: `@canvases/**` tracked; `.trellis/sketch/**` excluded
- `docs/content/2.guides/11.projections-and-whiteboards.md` updated
- `specs/whiteboard-ontology.md` links this spec; path section added

### TRL-200 — Graph-first whiteboard persistence (follow-on; supersedes file-first create)

**Summary:** Make the store the authority for whiteboard _content_. Save writes a content-addressed blob + `whiteboard:*` facts; `@canvases/<slug>.whiteboard` is materialized from the blob. Supersedes the file-first write path in TRL-196/197 (paths + entity registration stay).

**In scope**

- [ ] Save flow: `storeAssert whiteboard:<slug> {type,title,contentHash,updatedAt}` + write Excalidraw JSON to the kernel blob store (content-addressed)
- [ ] Materialize `@canvases/<slug>.whiteboard` from blob on save and on projection open / `trellis watch`
- [ ] Promote element bindings to store facts (`binds`), derived from `customData.trellis.bind`
- [ ] File is a tier-3 cache: rebuildable, safe to delete/regenerate; projection list prefers store over file scan
- [ ] Conflict policy: last-writer-wins by `contentHash`; external `.whiteboard` edits ingested or flagged (define)
- [ ] Save coalescing/debounce so high-frequency canvas edits don't flood ops

**Out of scope**

- Element-as-entity (per-element nodes/ops), live collaboration, causal/semantic board merge
- Generic `trellis materialize --projection filesystem` for notes/entities (separate issue)
- `@notes/` Obsidian ingest / round-trip

**Acceptance**

- [ ] Creating/editing a board produces ops + blob (no file-first write); `.whiteboard` is regenerated from the blob
- [ ] Deleting `@canvases/*.whiteboard` then re-materializing restores byte-identical content from the blob
- [ ] `find Whiteboard where binds = "issue:42"` returns boards without parsing files
- [ ] Public docs state `@canvases/` is a projection, not the write path

**Depends:** TRL-197 (store entities). **Risks:** blob GC for superseded snapshots; kernel blob API surface exposed to Studio; coalescing high-frequency saves.

---

## Related epics (do not merge)

- **TRL-172** Affordance layout — whiteboards stay `layout: canvas`; path change is independent
- **TRL-146** Entity navigation — benefits from `whiteboard:*` entities when landed
- **Agent Focus Context** — `focus.surface: whiteboard` can add `intent: sketch | durable` later
- **Filesystem ontology / F10** — native `materialized/@canvases/` is a Campus migration concern

---

## Open questions

1. **Sketch in projection list?** Default hidden; dev setting or “Show sketch boards” toggle.
2. **`@canvases` at repo root vs `materialized/@canvases` on mac-compat** — v1 uses root `@canvases/` for visibility; alias to native path at F10.
3. **Auto-promote on save from agent?** Defer — explicit promote action is clearer.

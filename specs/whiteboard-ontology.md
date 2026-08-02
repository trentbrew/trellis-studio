# Whiteboard ontology

Agent-facing vocabulary for Trellis Studio `.whiteboard` files (Excalidraw JSON on disk).

Implementation: `@opencode-ai/whiteboard` (`packages/whiteboard/`), OpenCode tool `whiteboard`, UI in `packages/app/src/pages/session/`.

## Kinds

| Kind | ID prefix | Purpose |
| ---- | --------- | ------- |
| **primitive** | `primitive.` | Atomic Excalidraw shapes (rectangle, arrow, text) |
| **figure** | `figure.` | Named composites (mindmap node, API endpoint) |
| **layout** | `layout.` | Spatial scaffolds (architecture layers) |
| **template** | `template.` | Full starter scenes (retro, flow, system context) |

Agents should use **corpus slugs**, not hand-authored element `id` values.

## Storage paths

Durable boards default to **`@canvases/<slug>.whiteboard`**; agent scratch uses **`.trellis/sketch/<slug>.whiteboard`**. Durable creates register a **`whiteboard:*`** store entity with a `path` attribute. See [materialized-paths-whiteboards.md](./materialized-paths-whiteboards.md) (**TRL-194**).

## Bindings

Graph links live on each element under `customData.trellis`:

```json
{
  "customData": {
    "trellis": {
      "corpusId": "figure.mindmap-node",
      "bind": "issue:42",
      "label": "Auth service"
    }
  }
}
```

- **`bind`**: `issue:<id>`, `entity:<id>`, `workunit:<id>`, etc. (no `binds:` prefix in storage).
- **`describe`** reports bindings as `binds:issue:42` for readability.

## Corpus layout

```text
packages/whiteboard/corpus/
  primitives.json
  figures/*.json
  layouts/*.json
  templates/*.json
```

Each entry: `id`, `version`, `kind`, `description`, `tags?`, `elements[]`, optional `appState` (templates), optional `slots`.

## Agent tool (`whiteboard`)

| Action | Description |
| ------ | ----------- |
| `list_catalog` | List corpus ids (`kind` optional) |
| `describe` | Semantic summary of a `.whiteboard` file |
| `apply_template` | Merge or replace from `template.*` |
| `insert_figure` | Place `figure.*` / `primitive.*` at `x`,`y` with optional `label`, `bind` |

## Studio UX (later)

- Template picker in Whiteboards projection (“New from template”).
- Richer figures via YappyDraw or custom corpus entries without changing the tool API.

## Related

- [Materialized paths & whiteboard storage](./materialized-paths-whiteboards.md) — **TRL-194** epic: `@canvases/`, `.trellis/sketch/`, store entities
- [Projections and whiteboards](https://trellis.computer/guides/projections-and-whiteboards) (public docs)
- `packages/app/src/lib/projections/registry.ts` — Whiteboards lens

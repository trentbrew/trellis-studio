# Projections rail — plan & workspace defaults

Companion to `.agent/plans/projections-notes.md` (CYCLE-1). Defines the icon-rail
projection zone, registry shape, and **default pins per workspace type**.

See also [fractal-responsiveness.md](./fractal-responsiveness.md) for the full rendering
model (vantage scalar, shell registry, projection ceilings). This doc covers rail IA and
registry shape; fractal spec covers *how Things render inside* projections.

## Problem

The core rail must stay activity-shaped (~5 modes). Domain-specific lenses (notes,
catalog, levels, scripts) belong in an optional **projection zone** — not as permanent
top-level icons. Defaults should match what the user is building so they never start
from an empty rail.

## Rail layout

```text
CORE (fixed, not removable)          PROJECTIONS (pinned, per type + user)
────────────────────────────         ─────────────────────────────────────
Graph · Plan · Code · CMS · Assets     Notes · … · [ + ]
         ↑ divider
```

Route: `?view=projection&lens=<id>` (distinct from `?view=cms`, `?view=assets`).

Core modes answer _what am I doing?_ Projections answer _show me this slice_.

### Overlap policy

| Core mode  | Projection must not…                 |
| ---------- | ------------------------------------ |
| **CMS**    | Replace full schema/collection admin |
| **Assets** | Replace full asset library           |
| **Plan**   | Duplicate issue board                |

Projections **filter and present** — narrower query, friendlier layout, one-click create.
Power users still use CMS/Assets for schema edits and bulk ops.

## Workspace type

### Source of truth (v1 → v2)

| Priority | Source                                         | Notes                                                            |
| -------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| 1        | `project.templateId`                           | Set when user picks a session template (`sessionTemplates[].id`) |
| 2        | `opencode.jsonc` → `projections.workspaceType` | Manual override                                                  |
| 3        | Inferred                                       | Match CMS collection names / tags (best-effort)                  |
| 4        | Fallback                                       | `"app"`                                                          |

**Gap today:** templates exist in `packages/app/src/templates/session.ts` but
`templateId` is not persisted on `Project.Info`. **WU-4 prep:** add optional
`templateId` (or `kind`) on project create.

### Template IDs (canonical)

From `sessionTemplates` — these are the workspace types:

| ID             | Label        | User aliases                 |
| -------------- | ------------ | ---------------------------- |
| `website`      | Website      | marketing, landing           |
| `app`          | App          | product, saas, tool          |
| `game`         | Game         | gamedev                      |
| `slides`       | Slide Deck   | writing, presentation, deck  |
| `video`        | Video        | film, youtube, production    |
| `dashboard`    | Dashboard    | data, analytics, metrics     |
| `docs`         | Docs         | documentation, wiki, writing |
| `store`        | Storefront   | ecommerce, shop, commerce    |
| `audio`        | Audio/DAW    | daw, music, sound            |
| `productivity` | Productivity | tasks                        |

No separate `writing` or `data` template — map to `docs` and `dashboard`.
`audio` and `productivity` are config-addressable workspace types before they become
first-class session templates.

## Projection catalog

Built-in registry entries. `layout` drives UI component; `query` drives data source.

### Universal (every workspace)

| ID      | Label | Layout | Query / lens | Create     |
| ------- | ----- | ------ | ------------ | ---------- |
| `notes` | Notes | cards  | `type:note`  | + New note |
| `whiteboards` | Whiteboards | canvas | `.whiteboard` files (Excalidraw) | + New whiteboard |

**Always pinned by default** (slot 1). Keep-style capture — see projections-notes.md.

`whiteboards` is pinned by default for `app` and `productivity` workspace types.

### Shared (multi-type)

| ID         | Label    | Layout | Query                                    | Default for types           |
| ---------- | -------- | ------ | ---------------------------------------- | --------------------------- |
| `content`  | Content  | table  | CMS: primary page-like collections       | website, docs, app          |
| `posts`    | Posts    | table  | CMS: `posts`, `articles`, `blog`         | website, docs               |
| `media`    | Media    | cards  | Assets: image, video                     | website, video, game, store |
| `records`  | Records  | table  | CMS: all user collections (excl. system) | app, dashboard              |
| `catalog`  | Catalog  | table  | CMS: `products`, `collections`           | store                       |
| `products` | Products | table  | CMS: `products`                          | store                       |
| `metrics`  | Metrics  | table  | CMS: `metrics`, `kpis`, `datasets`       | dashboard                   |
| `levels`   | Levels   | cards  | CMS: `levels`, `stages`, `maps`          | game                        |
| `entities` | Entities | cards  | CMS: `characters`, `items`, `npcs`       | game                        |
| `decks`    | Decks    | cards  | CMS: `decks`, `presentations`            | slides                      |
| `slides`   | Slides   | cards  | CMS: `slides`                            | slides                      |
| `scenes`   | Scenes   | list   | CMS: `scenes`, `shots`                   | video                       |
| `scripts`  | Scripts  | list   | CMS: `scripts`, `captions`               | video, slides               |
| `articles` | Articles | table  | CMS: `docs`, `articles`, `pages`         | docs                        |
| `links`    | Links    | list   | Assets: `links` + CMS refs               | website, app                |
| `audio`    | Audio    | list   | Assets: audio                            | audio                       |

Entries marked CMS assume collections seeded by template prompt or agent — empty state
shows "Create collection" not a dead rail icon.

### Stub projections (v1 UI shell, v2 data)

Ship rail pin + empty state before full query wiring:

- `shotlist`, `orders`, `themes`, `audio`, `sprites` (game art → Assets filter)

## Default pins by workspace type

Max **5** pinned projections (including Notes). Order = left-to-right priority.
User can unpin/reorder via `+` picker (WU-6); persisted in
`localStorage` key `session.projections.pinned.<projectId>`.

| Type             | Default pins (in order)          | Rationale                         |
| ---------------- | -------------------------------- | --------------------------------- |
| **all**          | `notes`                          | Universal capture                 |
| `website`        | notes, content, posts, media     | Pages + blog + imagery            |
| `app`            | notes, records, content, links   | Structured app data + nav         |
| `game`           | notes, levels, entities, media   | Level design + sprites/assets     |
| `slides`         | notes, decks, slides, scripts    | Deck authoring + speaker notes    |
| `video`          | notes, scenes, scripts, media    | Production pipeline               |
| `dashboard`      | notes, metrics, records, content | KPIs + data entities              |
| `docs`           | notes, articles, content, posts  | Doc site + articles               |
| `store`          | notes, catalog, products, media  | Commerce catalog + product images |
| `audio`          | notes, audio, scripts, media     | DAW/audio production              |
| `productivity`   | notes, records, content, links   | Tasks + structured records        |
| `app` (fallback) | notes, records, content, media   | Generic when type unknown         |

### Pin matrix (compact)

```text
           notes  content  posts  media  records  catalog  products  metrics  levels  entities  decks  slides  scenes  scripts  articles  links  audio
website      ●      ●       ●      ●
app          ●      ●                      ●                                      ●
game         ●                              ●       ●       ●
slides       ●                                                      ●      ●            ●
video        ●                              ●                        ●            ●
dashboard    ●      ●                      ●       ●
docs         ●      ●       ●                                  ●
store        ●                              ●                ●       ●
audio        ●                              ●                                             ●                                    ●
productivity ●      ●                      ●                                      ●
(fallback)   ●      ●                      ●       ●
```

## Registry schema

```ts
type ProjectionLayout = "cards" | "list" | "table" | "kanban" | "canvas"

type ProjectionQuery =
  | { kind: "store"; type?: string; tags?: string[] }
  | { kind: "cms"; collections?: string[]; match?: "prefix" | "exact" }
  | { kind: "assets"; category?: string[] }

type Projection = {
  id: string
  label: string
  icon: string
  layout: ProjectionLayout
  query: ProjectionQuery
  create?: { label: string; entityType?: string; collection?: string }
  /** session template IDs that include this in defaults */
  defaultsFor?: string[]
  /** always offered in + picker */
  domain?: "general" | "web" | "app" | "game" | "media" | "commerce" | "data" | "writing" | "audio"
  component?: string // v1: inline; v2: lazy import
  stub?: boolean
}
```

Default pin resolution:

```ts
function defaultPins(templateId: string | undefined): string[] {
  const base = PROJECTION_DEFAULTS[templateId ?? "app"] ?? PROJECTION_DEFAULTS.app
  return ["notes", ...base.filter((id) => id !== "notes")].slice(0, 5)
}
```

Config override (`opencode.jsonc`):

```jsonc
{
  "projections": {
    "workspaceType": "game",
    "pinned": ["notes", "levels", "entities", "media"],
    "hidden": ["catalog"],
  },
}
```

## Implementation phases

### Phase A — Rail shell (WU-3)

- Divider + projection zone below core rail
- Hardcode `notes` pin → placeholder panel
- `?view=projection&lens=notes`
- Persist pins (default `["notes"]` only)
- Stub `[ + ]` button (toast: "Coming soon")

### Phase B — Registry + type defaults (WU-4)

- `packages/app/src/lib/projections/registry.ts`
- `packages/app/src/lib/projections/defaults.ts` — table above
- Resolve pins from `templateId` when available, else `app`
- Render projection panel shell per `layout` enum (empty states)

### Phase C — Notes projection (WU-1, WU-2)

- `note` entity + card grid — first real projection
- Validates registry end-to-end

### Phase D — CMS-filter projections (per type)

Priority by template usage:

1. `content`, `records` (website, app)
2. `catalog`, `products` (store)
3. `levels`, `entities` (game)
4. `scenes`, `scripts`, `media` (video)
5. `decks`, `slides` (slides)
6. `metrics` (dashboard)
7. `articles` (docs)

Each = filtered CMS panel or reuse `CmsPanel` with collection filter + layout swap.

### Phase E — Picker & overrides (WU-6)

- `+` popover grouped by domain
- Pin/unpin, reorder, respect cap 5
- Merge user pins with defaults (user wins)

### Phase F — Entity nav (WU-5)

- `[[note:…]]`, projection deep links

## Open questions

1. **Persist `templateId` on project** — required for automatic defaults; who writes it (composer on template pick)?
2. **Slides speaker notes** — separate projection or part of `slides` detail drawer?
3. **Game sprites** — Assets projection vs dedicated `sprites` with canvas preview?
4. **Writing type** — alias `docs` or add ninth template `writing` → notes-heavy defaults only?
5. **Core rail v2** — collapse Home/Browser/Review into Code/Explore before or after projections ship?
6. **Empty CMS collections** — hide projection pin or show empty state with seed action?

## Work unit mapping

| Phase | WUs            |
| ----- | -------------- |
| A     | WU-3           |
| B     | WU-4           |
| C     | WU-1, WU-2     |
| D     | WU-8 (partial) |
| E     | WU-6           |
| F     | WU-5           |

## References

- [materialized-paths-whiteboards.md](./materialized-paths-whiteboards.md) — **TRL-194** epic: `@canvases/` storage, sketch tier, store entities
- [affordance-layout-system.md](./affordance-layout-system.md) — **TRL-172** epic: AffordanceShell, layout recipes, custom affordances
- [agent-focus-context.md](./agent-focus-context.md) — ambient agent context from active projection lens / surface
- `.agent/plans/projections-notes.md` — Notes UX, cycle plan
- `specs/navigation-ia.md` — core rail consolidation
- `packages/app/src/templates/session.ts` — workspace type IDs
- `packages/app/src/pages/session/session-side-panel.tsx` — rail implementation

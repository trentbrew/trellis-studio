# Design Brand Kit & Project Design System

> Milestone: **TRL-138** (proposed) · extends [visual-authoring-roadmap.md](./visual-authoring-roadmap.md)  
> Tracking: create parent issue + child issues below before implementation

## Summary

Establish a **project design system** where reusable primitives (icons, fonts, palettes, tokens) live as Trellis entities, **Brand** composes them without duplicating their data, and **reference catalogs** remain immutable sources for search/add-from-catalog flows.

The agent reads the **resolved project brand** by default. Cross-project and org-level brands live in **trellis-cloud**; the sandbox-root graph **indexes and caches** shared entities for local agent context without owning canonical state.

**One-liner:** Catalogs supply everything possible; Trellis stores what the project enables; Brand ties it together; cloud owns shared templates.

---

## Goals

1. **Lucide-first icons** with consistent stroke weight; custom/brand icons in a separate library namespace.
2. **Semantic metadata** on catalog entries (tags, aliases, description) for agent search; embeddings later.
3. **Project-enabled inventory** — agent picks from Trellis entities unless explicitly asked to search the catalog.
4. **Brand as composition root** — one effective brand per project, derived from template + overrides + snapshot.
5. **Clear sidebar IA** — Design / Brand Kit vs Assets (media), not “Artifacts” for source material.
6. **Authority split** — cloud (shared), project (overrides), sandbox graph (local index/cache only).

## Non-goals (this milestone)

- Full trellis-cloud Brand Template CRUD UI (Phase 4+).
- Embedding generation pipeline (Phase 3 optional stretch).
- Replacing binary asset storage (files/Mux/etc.) — metadata stays in Trellis, bytes stay in files.
- Renaming “Assets” to “Artifacts” for media/files.
- Migrating all 1,704 Lucide icons into Trellis as entities on day one.

---

## Architecture

### Three layers of truth

```
┌──────────────────────────────────────────────────────────────────┐
│  Reference catalogs (immutable, repo-shipped)                    │
│  • lucide-icons.json + glyph map                                   │
│  • icons.json (custom/brand SVG library)                           │
│  • fonts.json (Google Fonts catalog)                               │
│  • palette-presets.json (starter palettes)                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ add-from-catalog / materialize
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Trellis project entities (curated, agent-facing)                │
│  • Icon, Font, ColorPalette, DesignTokenSet                      │
│  • Brand (composes IDs + semantics + token refs)                 │
│  • ProjectBrandConfig (active brand, overrides, snapshot)        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ sync / template apply
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  trellis-cloud (authoritative for org/user shared assets)        │
│  • BrandTemplate, shared palettes/fonts/icon policies              │
│  • Versioning, permissions, audit                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Sandbox-root federated graph (local runtime only)               │
│  • Cache of cloud templates                                      │
│  • Cross-project index, telemetry, agent memory                  │
│  • NOT canonical for brand data long-term                        │
└──────────────────────────────────────────────────────────────────┘
```

### Agent selection rule

| Context | Source |
|---------|--------|
| Default icon/font/color choice | Project-enabled Trellis entities referenced by resolved Brand |
| “Find an icon for…” / “Add Inter” | Catalog search → user confirms → materialize entity |
| “What should this project feel like?” | Resolved Brand (+ semantics) |

---

## Entity model

### Primitives (project-owned Trellis entities)

**Icon**

```ts
type IconEntity = {
  key: string
  library: "lucide" | "custom" | "brand"
  category?: string
  tags?: string[]
  aliases?: string[]
  description?: string
  catalogRef?: string // e.g. lucide:heart, custom:dropbox
}
```

**ColorPalette**

```ts
type ColorPaletteEntity = {
  name: string
  description?: string
  swatches: Record<string, string> // role → hex, e.g. primary, surface, danger
  tags?: string[]
}
```

**Font**

```ts
type FontEntity = {
  family: string
  category?: string // sans-serif, serif, mono, display
  variants: string[]
  files?: Record<string, string> // variant → URL
  tags?: string[]
  description?: string
  catalogRef?: string // google-fonts:Inter
}
```

**DesignTokenSet** (optional grouping; may fold into Brand.tokens initially)

```ts
type DesignTokenSet = {
  name: string
  radius?: Record<string, string>
  spacing?: Record<string, string>
  elevation?: Record<string, string>
  motion?: Record<string, string>
}
```

### Brand (composition, not duplication)

```ts
type Brand = {
  name: string
  description?: string

  paletteIds: string[]
  primaryPaletteId?: string

  fontIds: string[]
  headingFontId?: string
  bodyFontId?: string
  monoFontId?: string

  iconLibrary: "lucide" | "custom" | "brand"
  enabledIconIds?: string[]

  tokens?: {
    radius?: string
    spacing?: string
    elevation?: string
    motion?: string
  }

  semantics?: {
    values?: string[]
    tone?: string[]
    mood?: string[]
    audience?: string[]
    avoid?: string[]
  }
}
```

Brand stores **references** (`paletteIds`, `fontIds`, `enabledIconIds`), not embedded hex values or SVG paths.

### Project brand resolution

```ts
type BrandOverrides = Partial<{
  primaryPaletteId: string
  headingFontId: string
  bodyFontId: string
  enabledIconIds: string[]
  semantics: Brand["semantics"]
  tokens: Brand["tokens"]
}>

type ProjectBrandConfig = {
  activeBrandId?: string      // cloud BrandTemplate id
  localBrandId?: string       // project-owned Brand entity id
  overrides?: BrandOverrides
  resolvedSnapshot?: BrandSnapshot // frozen for reproducible builds
}

type BrandSnapshot = Brand & {
  resolvedAt: string
  palettes: ColorPaletteEntity[]
  fonts: FontEntity[]
  icons: IconEntity[]
}
```

**One effective brand per project.** Multiple brand *profiles* exist as templates; only one is active. Overrides layer on top; snapshot pins resolution for build/agent consistency if upstream template changes.

---

## Sidebar information architecture

Two top-level rails (URL `?view=assets` vs `?view=design`), shared `design-panel.tsx` implementation:

| Rail | Sections |
|------|----------|
| **Assets** (`AssetsPanel`) | Images, **Sprite sheets**, videos, documents, links, 3D models, audio |
| **Design** (`DesignPanel`) | Brand, Icons, Colors, Type, Tokens, Components |

**Removed from nav (for now):** patterns, CMS bindings.

**Sprite sheets** are asset files first (`.trellis/media/sprites/`); graph model (`SpriteRegion`, `Atlas`, `Anim`) is in [sprite-atlas-graph.md](./sprite-atlas-graph.md). Not Trellis **deploy** sprites (`sprite:` graph type).

Future: **Artifacts** only if we add generated deliverables / session outputs / build products — not for reusable source material.

Entity navigation: media sections → `?view=assets&section=…`; kit sections → `?view=design&section=…` (see `entity-navigate.ts`).

---

## Icon system (Phase 1 — ship first)

### Current state

- `entity-theme.tsx`: ~40 hand-curated Lucide `iconNode` paths + `GENERATED_ICONS` (~270 custom filled SVGs from `packages/app/src/assets/icons/icons.json`).
- Merged into one namespace → inconsistent visual weight in picker.
- `www/app/data/lucide-icons.json`: 1,704 Lucide icons with categories (not used in IDE picker).

### Target state

| Library | Key format | Rendering |
|---------|------------|-----------|
| `lucide` | `heart`, `circle-alert` | stroke, width 2, viewBox 24×24 |
| `custom` | `custom:menu_alt` | fill-based; legacy SVG set |
| `brand` | `brand:acme-mark` | org/project marks; separate from Lucide |

**IconPickerDialog**

- Default tab: **Lucide**, grouped by category, lazy-loaded batches.
- Secondary: **Custom / Brand** library, clearly labeled.
- Search: key, tags, aliases, description.
- Empty search: “No icons match …”

**EntityIcon**

- Resolve library from key prefix or entity metadata.
- Lucide: parent SVG `stroke-width="2"`, no fill on paths.
- Custom/brand: respect fill paths; do not double-apply stroke.

### Catalog entry shape

```ts
type IconCatalogEntry = {
  key: string
  library: "lucide" | "custom" | "brand"
  category: string
  tags: string[]
  aliases?: string[]
  description?: string
}
```

### Build artifacts (IDE package)

| Artifact | Source |
|----------|--------|
| `src/lib/catalog/lucide-icons.json` | Generated from `@iconify-json/lucide` |
| `src/lib/catalog/lucide-glyphs.ts` | Generated SVG innerHTML map |
| `src/lib/catalog/custom-icons.json` | From `icons.json` + tags |
| `src/lib/icon-catalog.ts` | Types, search, library split |

Script: extend `ide/script/generate-icons.ts` or add `generate-icon-catalog.ts`.

---

## Fonts (Phase 2)

- **Catalog:** `turtlecode/.references/fonts/fonts.json` (read-only).
- **Seed:** ~20–30 `Font` entities on project init (system stack + common choices).
- **UI:** “Add from catalog” materializes one family into Trellis.
- **Agent:** project fonts first; catalog search on explicit request.

---

## Palettes & tokens (Phase 2–3)

- **Catalog:** `palette-presets.json` (starter sets: neutral, brand, semantic).
- **Project:** `ColorPalette` entities; Brand references by id.
- **Tokens:** start inline on Brand; extract `DesignTokenSet` when reuse grows.

---

## Cloud & sandbox (Phase 4)

| Store | Role |
|-------|------|
| **trellis-cloud** | BrandTemplate CRUD, shared palettes/fonts, version pins, ACL |
| **Project `.trellis/`** | `ProjectBrandConfig`, local Brand, enabled primitives |
| **Sandbox root graph** | Federated index, cache of cloud entities, telemetry, cross-project agent context |

Apply template flow:

1. User selects org BrandTemplate in cloud.
2. Project stores `activeBrandId` + optional `overrides`.
3. Resolver produces `resolvedSnapshot` (materialize missing local entities or reference cloud ids per sync policy).
4. Agent reads snapshot; rebuilds when template version bumps or user requests refresh.

---

## Implementation phases

### Phase 1 — Icon catalog & picker (IDE only)

**Issues:** TRL-138a

- [ ] Generate Lucide catalog + glyph map into IDE package
- [ ] Split `custom` library; namespaced keys (`custom:*`)
- [ ] Refactor `IconPickerDialog`: Lucide by category + Custom section
- [ ] Library-aware `EntityIcon` rendering
- [ ] Catalog search over tags/aliases/description (structured only)
- [ ] Preserve existing entity `icon` field values (migration: bare keys → lucide)

**Acceptance**

- Picker shows consistent Lucide stroke weight.
- Custom icons visible in separate section with “Custom” badge.
- No regression in CMS table icon cells or collection settings.
- Typecheck + manual smoke on icon pick/save.

### Phase 2 — Design primitives as Trellis entities

**Issues:** TRL-138b

- [ ] Entity types: `Icon`, `Font`, `ColorPalette`
- [ ] Seed script for default project inventory
- [ ] “Add from catalog” for icons and fonts
- [ ] Design sidebar: Colors, Type, Icons sections (read project entities)
- [ ] Agent tool: `list_design_assets` / `search_project_icons` (project scope only)

### Phase 3 — Brand composition

**Issues:** TRL-138c

- [ ] `Brand` entity + `ProjectBrandConfig`
- [ ] Brand sidebar panel (semantics, links to primitives)
- [ ] Resolver: template + overrides → `BrandSnapshot`
- [ ] Agent reads resolved brand for “project feel” questions
- [ ] Optional: embedding index for icon/font semantic search

### Phase 4 — Cloud templates & sandbox federation

**Issues:** TRL-138d

- [x] trellis-cloud: BrandTemplate storage + API (minimal slice)
- [x] Apply template to project; version pinning on config (`activeBrandVersion`)
- [x] Cloud template picker in Design panel (broker auth via postMessage)
- [ ] Sandbox-root graph: cache/index shared entities
- [x] Sync refresh / snapshot rebuild UX (Refresh snapshot + apply template)

---

## Dependencies

- Existing CMS `icon` / `color` fields on themed collections (`database-panel-utils.ts` `themed()`).
- `design-panel.tsx` shell and asset scanning.
- `entity-theme.tsx` / D3 graph icon rendering (must resolve new key format).
- trellis-cloud workspace model (Phase 4).

## Open questions

1. **Icon value migration:** Store `lucide:heart` vs bare `heart` with library on entity? Recommend bare key + `library` fact on Icon entity; picker emits library-aware storage.
2. **Default project seed:** Which Lucide icons to pre-enable (20–40 semantic defaults vs empty + Brand policy)?
3. **Brand template ownership:** User vs org vs workspace in trellis-cloud — align with existing workspace permissions in `trellis-cloud/src/workspace.ts`.
4. **Snapshot invalidation:** Auto-rebuild on template bump vs manual “Refresh brand” — start manual.

---

## Success criteria (milestone complete)

- [ ] Phase 1 shipped: Lucide-first picker, custom library separated, consistent rendering.
- [ ] Phase 2 shipped: Icon/Font/Palette as Trellis entities; Design sidebar sections; project-scoped agent tools.
- [ ] Phase 3 shipped: Brand composes primitives; one active brand per project; agent uses resolved snapshot.
- [ ] Phase 4 scoped and tracked (cloud + federation); not required for milestone close if 1–3 are done and cloud issue is filed.

---

## Related docs

- [visual-authoring-roadmap.md](./visual-authoring-roadmap.md) — TRL-41, TRL-42 Design rail MVP
- [design-panel.tsx](../packages/app/src/pages/session/design-panel.tsx) — current Design UI
- [entity-theme.tsx](../packages/app/src/lib/entity-theme.tsx) — icon rendering today
- [generate-icons.ts](../script/generate-icons.ts) — custom icon codegen

# Sprite Atlas Graph Model

> Companion to [design-brand-kit.md](./design-brand-kit.md) · [projections-rail.md](./projections-rail.md)  
> Status: **draft** — graph schema + ops; UI starts as Assets “Sprite sheets” (files), graph model phased in.

## Summary

2D game sprites (pixel art, sprite sheets) use **projectional editing**: PNG bytes live in a **content-addressed blob store**; queryable structure lives in the **Trellis EAV graph**. A sprite is not a file — it is a **named rectangle projected onto an atlas blob** (`srcRect`, pivot, trim/pack metadata). Animation order is modeled as **reified sequence edges** with fractional order keys, not integer indices in JSON.

**Do not confuse** with Trellis **deploy sprites** (`createSprite`, graph type `sprite:`, issues labeled `sprite`) — those are runtime deployment targets. Asset ontology uses **`SpriteRegion`**, **`Atlas`**, **`Anim`**, **`AnimFrame`** (edge entity).

---

## Blob vs graph boundary

The line is **movable per asset type**:

| Store in graph (query, diff, reorder, project) | Store as blob (load wholesale) |
|-----------------------------------------------|------------------------------|
| Atlas ref, sprite rects, anim sequence edges | Atlas PNG/WebP bytes |
| Material → texture refs, UVs | Large baked animation curves |
| Skeleton bone tree (structure) | Vertex/index buffers |
| Small keyframe sets | |

**Rule:** Model in the graph anything you want to EQL, diff, merge, or project. Blob anything you only ever load as a whole.

Sprites are the clean 2D case of texture atlasing; skeletal animation is the dense 3D generalization (same pattern, more channels).

---

## Entity model (v1 target)

```text
Atlas
  blobRef     content hash → bytes in .trellis/media (or object store)
  width, height
  filter      nearest | linear (pixel art default: nearest)

SpriteRegion  (named view into atlas — stable entity ID)
  atlas       → Atlas
  srcRect     x, y, w, h (pixels)
  pivot       x, y (normalized or px)
  rotated, trimmed, sourceSize, trimOffset…  (TexturePacker-style)

Anim
  name, tags[]   e.g. idle, walk
  defaultFps?

AnimFrame       (edge entity — NOT integer index on Anim)
  anim ──order──► SpriteRegion
  durationMs
  events[]        optional footstep, sfx triggers
  order           lexical / fractional key (LexoRank-style)
```

Optional later: `Character` → uses → `Anim[]`; CMS `Level` / `Entity` links to regions.

### Why edge entities for frames

Integer `frameIndex` on a node implies **O(n) rewrites** on reorder and merge conflicts when two editors touch the same clip. Reified `AnimFrame` links with lexical `order`:

- Insert/move = **one op** on one edge
- Parallel edits on `walk` vs `idle` = **disjoint subgraphs**
- Matches append-only op log semantics

### Stable identity through repack

Atlas repack produces a **new blob hash** and new rects, but **SpriteRegion entity IDs stay stable**. One transaction:

1. Swap `Atlas.blobRef`
2. Patch N `SpriteRegion.srcRect` facts
3. All `Anim → SpriteRegion` links unchanged

Never fold rect into sprite identity (no `sprite:{hash}` IDs).

### Content addressing

Duplicate rects / shared blink frames → same `SpriteRegion` entity. EQL can find instancing and unused atlas texels.

---

## EQL-S examples (payoff)

Once in the graph:

```text
# All animations referencing a region
AnimFrame WHERE sprite = sprite:hero:blink_03

# Regions in atlas but unreferenced
Atlas atlas:ui → unused rects

# Atlases transitively used by character
Character char:player → … → Atlas

# All clips tagged idle
Anim WHERE tags CONTAINS "idle"

# Large regions (layout rules)
SpriteRegion WHERE srcRect.w > 64
```

---

## UI & rail mapping

| Surface | Role |
|---------|------|
| **Assets → Sprite sheets** | Upload atlas files; v1 = media list; v2 = rect editor + frame timeline |
| **Assets** (other sections) | Images, video, audio, 3D, documents, links |
| **Design** | Brand, icons, colors, type, tokens, components, motion (easings/transitions) |
| **Projection `sprites`** (game template) | Filtered lens → `?view=assets&section=sprites` or EQL-driven cards |

Motion **easings / transition presets** belong in **Design**, not Assets.

---

## Phasing

| Phase | Deliverable |
|-------|-------------|
| **0** (now) | Assets/Design rail split; Assets “Sprite sheets” section (files under `.trellis/media` or `category: spritesheet` when wired) |
| **1** | `Atlas` + `SpriteRegion` entities; blob `sha256`; projectional rect editor |
| **2** | `Anim` + `AnimFrame` edge entities with lexical order; agent `design` / `asset` tools emit ops |
| **3** | Repack transaction; atlas swap + bulk rect patch |
| **4** | EQL helpers + game `sprites` projection queries |
| **5** | Import: Aseprite JSON, TexturePacker; engine export hooks |

---

## Agent guidance (sketch)

- Upload atlas bytes → file/media API (blob).
- Define/update regions and anims → Trellis store ops or future `asset` tool actions (`define_atlas`, `set_sprite_region`, `insert_anim_frame`).
- After primitive changes → `design` tool `refresh_brand` only for brand kit; atlas changes refresh via store + UI `trellis-store-changed`.
- Prefer **stable region IDs** in prompts and CMS refs, not raw pixel coords.

---

## Related specs

- [design-brand-kit.md](./design-brand-kit.md) — Brand vs Assets sidebar
- [visual-authoring-roadmap.md](./visual-authoring-roadmap.md) — Components, preview bindings (deferred)
- [projections-rail.md](./projections-rail.md) — Game template, `sprites` projection stub
- [navigation-ia.md](./navigation-ia.md) — Five-icon rail; Assets + Design as distinct activities

---

## Open questions

- Single atlas entity per file vs one global atlas per project with many source files merged?
- Inline small `durationMs` / events on edge vs separate `AnimEvent` nodes?
- Bitmap fonts: Assets (sheet file) vs Font entity in Design?

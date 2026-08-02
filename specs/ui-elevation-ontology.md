# Studio UI elevation & ontology

> **Milestone:** **TRL-169** (epic) · **TRL-170** (tokens / former 149a) · follow-ups **TRL-171+** as needed  
> **Note:** TRL-149 is reserved for domain projection packs — elevation work uses TRL-169+.  
> **Related:** [design-brand-kit.md](./design-brand-kit.md) · [entity-dialog-hardening.md](./entity-dialog-hardening.md) · [navigation-ia.md](./navigation-ia.md) · [visual-authoring-roadmap.md](./visual-authoring-roadmap.md) · [whiteboard-ontology.md](./whiteboard-ontology.md) · [fractal-responsiveness.md](./fractal-responsiveness.md)

Agent-facing vocabulary and implementation plan for **Trellis Studio** (`studio/packages/app`, `@opencode-ai/ui`). Replaces ad-hoc background naming with a shared elevation ladder and a shell/component ontology.

Implementation targets: `packages/ui/src/theme/resolve.ts`, `packages/ui/src/styles/`, `packages/app/src/pages/layout.tsx`, `packages/app/src/components/route/`.

---

## Summary

Studio’s OC-2 token system mixes **emphasis naming** (`background-weak`, `background-strong`) with **topology naming** (`surface-inset`, `surface-raised`, `surface-float`) in one flat namespace. The IDE shell needs **6–8 discrete elevation planes**, not three ambiguous background steps. Components pick tokens by guesswork; depth is often faked with `color-mix(... var(--background-base) ...)`.

This spec introduces:

1. **Elevation ladder** — monotonic `--bg-*` tokens derived from the theme neutral scale.
2. **UI ontology** — shared vocabulary for shell regions, layout patterns, and component tiers so agents, docs, and lint rules speak the same language.
3. **Compatibility aliases** — old OC-2 tokens map to new ladder steps; no big-bang break.

---

## Sequencing recommendation

| Order | Pass | Why |
| ----- | ---- | --- |
| **1** | **Elevation tokens (149a–149c)** | Concrete, visual, testable. Unblocks consistent depth everywhere. Ontology *references* elevation — define the ladder before naming every pattern against it. |
| **2** | **Ontology scaffold (149d)** | Light pass now: shell taxonomy + pattern IDs + `data-ui-*` contract. Cheap to write; prevents rework when mapping components later. |
| **3** | **Shell migration (149e)** | Apply ladder + ontology to layout, route shell, CMS, session chrome. |
| **4** | **Ontology deep dive (149f)** | Full inventory of `@opencode-ai/ui` primitives, app composites, lint/docs/agent skill. Do **after** colors ship so mappings are stable. |

**Do not** block elevation on a full ontology audit. **Do** write the ontology *framework* in this spec so both passes use the same words (`chrome`, `well`, `elevated`, etc.).

---

## Problem (current state)

### Two vocabularies, one job

| Namespace | Examples | Reads as |
| --------- | -------- | -------- |
| `background-*` | `base`, `weak`, `strong`, `stronger` | Emphasis / contrast, not depth |
| `surface-*` | `base`, `raised-base`, `inset-strong`, `float-base`, … | Topology + state + semantics combined |

### Typical IDE stack vs available tokens

```text
Actual layers (Studio session)          Current token guesswork
──────────────────────────────          ─────────────────────────
0  Window / app root                    background-base
1  Activity rail (icon bar)             background-base | background-stronger
2  Secondary sidebar (collections)      background-weak | surface-raised-base
3  Panel chrome (headers, tabs)         transparent (!) | surface-base
4  Content well (editor, table)         background-base | background-panel (TUI leak)
5  Nested section (card, bento cell)   surface-raised-base
6  Sticky / elevated (popover, header) color-mix(… background-base 92% …)
7  Modal / scrim / toast                dialog.css hsl(from background-base …)
```

### Other pain

- **`bg-background-panel`** used in web app; token exists only in TUI theme JSON (`backgroundPanel`).
- **`base`, `base2`, `base3`** duplicate the same alpha surface.
- **Route shell** (`route-panel`, `route-sidebar`) defaults to `background: transparent` — depth only appears when a child picks a token.
- **`design-tokens.css`** defines a third, GitHub-style `--color-background-primary` ladder unused by OC-2 runtime.

---

## Part 1 — Elevation ladder

### Design principles

1. **One axis** — elevation only. Interaction (`hover`, `active`, `selected`) is a suffix, not a new token family.
2. **Monotonic** — higher level = visually closer to the user (lighter in dark mode, slightly lifted in light mode).
3. **Role-named** — tokens describe *where* in the shell, not *how strong* (`bg-panel` not `background-stronger`).
4. **Theme-derived** — `resolve.ts` computes all steps from neutral scale + optional `overrides`.
5. **Alias legacy** — `--background-base` etc. remain as deprecated aliases until migration completes.

### Token set

CSS custom properties (kebab-case). Tailwind: `bg-canvas`, `bg-chrome`, … via `@theme`.

| Token | Level | Shell role | Typical use |
| ----- | ----- | ---------- | ----------- |
| `--bg-canvas` | 0 | App root | `html`, `#root`, full-bleed backdrop |
| `--bg-chrome` | 1 | Primary chrome | Activity rail, titlebar strip |
| `--bg-sidebar` | 2 | Secondary nav | File tree, collections list, design nav |
| `--bg-panel` | 3 | Panel frame | Session area, route panel, editor chrome |
| `--bg-well` | 4 | Content well | Editor surface, table body, graph canvas |
| `--bg-subtle` | 5 | Grouped content | Cards, bento cells, table zebra, inset groups |
| `--bg-elevated` | 6 | Floating in flow | Sticky headers, dropdown surface, selected row |
| `--bg-overlay` | 7 | Modal layer | Dialog panel, drawer sheet, command palette |
| `--bg-scrim` | — | Backdrop | Semi-transparent veil behind overlay (not a solid step) |

**Optional stretch (149c+):** `--bg-float` for toasts/tooltips if `--bg-overlay` feels too heavy.

### Interaction suffixes (same level)

```css
--bg-well-hover
--bg-well-active
--bg-well-selected
```

Resolved as alpha overlays or neutral scale shifts on the base step — mirrors today’s `surface-base-hover` but scoped to a level.

### Derivation (resolve.ts)

Pseudo-algorithm:

```ts
const steps = pickNeutralSteps(neutral, isDark, count: 9) // canvas → overlay
tokens["bg-canvas"]   = steps[0]
tokens["bg-chrome"]   = steps[1]
tokens["bg-sidebar"]  = steps[2]
tokens["bg-panel"]    = steps[3]
tokens["bg-well"]     = steps[4]
tokens["bg-subtle"]   = steps[5]
tokens["bg-elevated"] = steps[6]
tokens["bg-overlay"]  = steps[7]
tokens["bg-scrim"]    = withAlpha(steps[0], isDark ? 0.55 : 0.35)
```

Compact themes (`palette` + `ink`) keep using `blend()` / `alphaTone()` like today. `overrides["bg-canvas"]` replaces `overrides["background-base"]`.

### Legacy aliases (deprecation map)

| Legacy | Maps to | Notes |
| ------ | ------- | ----- |
| `--background-base` | `--bg-canvas` | Primary alias |
| `--background-weak` | `--bg-sidebar` | Was “recessed” |
| `--background-strong` | `--bg-panel` | |
| `--background-stronger` | `--bg-elevated` | |
| `--surface-raised-base` | `--bg-subtle` | Approximate |
| `--surface-raised-stronger` | `--bg-elevated` | |
| `--surface-float-base` | `--bg-overlay` | |
| TUI `backgroundPanel` | `--bg-panel` | Web alias only |

Emit aliases in `themeToCss()` for at least one release. `token-validator` warns on legacy use.

### Lint / enforcement

- **Error:** raw hex/rgb background in `packages/app` and `packages/ui` (except Storybook fixtures).
- **Warning:** `color-mix(... var(--background-base) ...)` for depth — suggest a `--bg-*` step.
- **Warning:** `bg-background-panel` until removed.

### Acceptance (149a–149c)

- [x] Ladder tokens resolve for default **Cursor** theme light + dark.
- [x] `tailwind/colors.css` regenerated with `bg-canvas` … `bg-overlay`.
- [x] Storybook swatch page shows all 8 steps side-by-side per theme.
- [x] Legacy aliases present; existing screens unchanged (visual regression baseline).
- [x] `packages/ui/src/design-system/token-validator.ts` knows new tokens.

---

## Part 2 — Studio UI ontology

### Purpose

Same role as [whiteboard-ontology.md](./whiteboard-ontology.md): **agents and humans share one vocabulary** for “what is this UI thing?” Ontology drives:

- `data-ui-*` attributes for test selectors and agent inspection
- Design rail / TRL-42 pattern catalog
- Docs on trellis.computer
- Future affordance meta ([agent-testable-runtime.md](./agent-testable-runtime.md))

### Three tiers

```text
┌─────────────────────────────────────────────────────────────┐
│  Tier 1 — Shell regions (layout-owned, fixed IA)            │
│  canvas · chrome · sidebar · panel · companion · overlay      │
└────────────────────────────┬────────────────────────────────┘
                             │ contains
┌────────────────────────────▼────────────────────────────────┐
│  Tier 2 — Layout patterns (composable structures)           │
│  route · dock · split · rail · drawer · inspector · well      │
└────────────────────────────┬────────────────────────────────┘
                             │ composed of
┌────────────────────────────▼────────────────────────────────┐
│  Tier 3 — UI primitives (@opencode-ai/ui + app composites)  │
│  button · dialog · route-header · entries-table · …           │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1 — Shell regions

Aligned with [navigation-ia.md](./navigation-ia.md) five-icon rail + persistent agent companion.

| ID | Definition | Default elevation | DOM hint |
| -- | ---------- | ----------------- | -------- |
| `shell.canvas` | Root app backdrop | `bg-canvas` | `[data-ui-region="canvas"]` |
| `shell.chrome` | Titlebar + activity rail | `bg-chrome` | `[data-ui-region="chrome"]` |
| `shell.sidebar` | Secondary nav (files, collections, design nav) | `bg-sidebar` | `[data-ui-region="sidebar"]` |
| `shell.panel` | Main working area (code, CMS, graph) | `bg-panel` | `[data-ui-region="panel"]` |
| `shell.companion` | Agent chat dock (right pane) | `bg-panel` | `[data-ui-region="companion"]` |
| `shell.overlay` | Modal / command palette / fullscreen agent | `bg-overlay` + `bg-scrim` | `[data-ui-region="overlay"]` |

### Tier 2 — Layout patterns

Reusable structures in `packages/app`. Each pattern declares **default elevation** for its slots.

| Pattern ID | Description | Key slots | Reference impl |
| ---------- | ----------- | --------- | -------------- |
| `layout.route` | Sidebar + header + content + optional detail drawer | `sidebar`, `header`, `content`, `detail` | `components/route/route-shell.tsx` |
| `layout.dock` | Agent/input dock with trays | `shell`, `tray` | `@opencode-ai/ui/dock-surface` |
| `layout.split` | Resizable horizontal/vertical panes | `pane`, `handle` | session editor splits |
| `layout.rail` | Icon activity rail | `item`, `indicator` | `session-side-panel.tsx` |
| `layout.well` | Scrollable primary content | `body`, `sticky-footer` | CMS table, editor |
| `layout.inspector` | Contextual side detail | `summary`, `fields` | entity detail, entry editor |
| `layout.drawer` | Slide-over detail | `head`, `body` | `RouteDetailDrawer` |

**Route pattern slot → elevation (target mapping):**

| Slot | Elevation | Notes |
| ---- | --------- | ----- |
| `route.sidebar` | `bg-sidebar` | Replace `transparent` |
| `route.header` | `bg-panel` | Border only on bottom |
| `route.content` | `bg-well` | Primary scroll area |
| `route.nav-item--active` | `bg-subtle` | |
| `route.detail` | `bg-overlay` or `bg-elevated` | Depends on modal vs inline |

### Tier 3 — Component classes

Split **primitives** (published from `@opencode-ai/ui`) vs **composites** (app-only).

| Class | Prefix | Example | Ontology file |
| ----- | ------ | ------- | ------------- |
| Primitive | `ui.` | `ui.button`, `ui.dialog`, `ui.tabs` | `packages/ui/ONTOLOGY.md` (new) |
| Composite | `app.` | `app.cms.entries-table`, `app.session.file-tabs` | `packages/app/ONTOLOGY.md` (new) |
| Pattern | `layout.*` | `layout.route` | this spec |

Primitives expose `data-ui-component="ui.button"`. Composites use `data-ui-component="app.cms.entries-table"`. Existing `data-component="button"` stays as alias during migration.

### Semantic vs decorative backgrounds

| Kind | Token family | Example |
| ---- | ------------ | ------- |
| **Structural** | `--bg-*` | Panel frame, sidebar, well |
| **Semantic state** | `--surface-{intent}-*` (keep) | success, warning, critical, diff-* |
| **Brand** | `--surface-brand-*` | Primary CTAs |
| **Interactive fill** | `--bg-*-hover` / `--button-*` | Hovers on controls |

Do **not** fold semantic/diff colors into the elevation ladder. Reduce `surface-*` to non-structural uses only over time.

### Agent vocabulary (cheat sheet)

When describing or editing Studio UI, prefer:

- **Region** → `shell.panel`, not “main area”
- **Pattern** → `layout.route`, not “sidebar layout”
- **Elevation** → `bg-well`, not `background-weak`
- **Primitive** → `ui.dialog`, not “modal component”

Future: MCP / inspect tool returns `{ region, pattern, component, elevation }` from DOM `data-ui-*`.

---

## Part 3 — Migration plan

### Phase 149a — Tokens only (no visual change)

1. Add `--bg-*` to `resolve.ts` + legacy aliases.
2. Regenerate `tailwind/colors.css`.
3. Storybook elevation page.

### Phase 149b — Shell assignment

| File / area | Change |
| ----------- | ------ |
| `app.tsx` / `layout.tsx` | `data-ui-region`, explicit `bg-canvas` / `bg-chrome` |
| `session-side-panel.tsx` | `shell.chrome` + rail items |
| `route-motion.css` | Remove transparent defaults; assign slot elevations |
| CMS (`cms-panel`, `entries-table`) | `bg-well`, sticky footer → `bg-elevated` |
| Whiteboard / excalidraw hosts | `bg-background-panel` → `bg-panel` |

### Phase 149d — Ontology scaffold

- [x] Add `packages/ui/ONTOLOGY.md` + `packages/app/ONTOLOGY.md` (index tables, not full inventory).
- [x] Document Tier 1–2 in this spec as canonical.
- [x] Add `data-ui-region` / `data-ui-slot` on layout shell + route pattern.

### Phase 149c — Deprecation

- [x] Custom script: `packages/ui/script/lint-elevation-tokens.ts` (`bun --cwd packages/ui lint:elevation-tokens`).
- [x] `token-validator` warns on `--background-panel`, `bg-background-panel`, `color-mix(... --background-base ...)`.
- [x] One release with dual aliases, then remove from docs. _(aliases active; full removal is a later release.)_

### Phase 149e — Ontology deep dive

- [x] Full primitive inventory with Storybook links (`packages/ui/ONTOLOGY.md` + `gen-ontology-inventory.ts`).
- [x] App composite inventory (`packages/app/ONTOLOGY.md`).
- [x] Agent skill: `.opencode/skill/studio-ui/SKILL.md`.
- [ ] Design rail (TRL-42) patterns register as `layout.*` entities.
- [ ] Affordance meta shape from [agent-testable-runtime.md](./agent-testable-runtime.md) uses ontology IDs.

---

## Milestone breakdown

| ID | Title | Scope |
| -- | ----- | ----- |
| **TRL-169** | Epic: Studio UI elevation & ontology | Coordination |
| **TRL-170** | Elevation ladder in `resolve.ts` + aliases | **Closed** — tokens + aliases |
| **TRL-171** | Tailwind shortcuts + Storybook elevation matrix | **Closed** — `elevation.stories.tsx` |
| **TRL-181** | Shell migration: layout + route + session chrome | **Closed** |
| **TRL-182** | Ontology scaffold (`ONTOLOGY.md`, `data-ui-*`) | **Closed** |
| **TRL-183** | Elevation token lint (149c) | **Closed** |
| **TRL-184** | Ontology inventory + studio-ui skill (149e) | **Closed** (core); TRL-42 affordance meta open |

Suggested order: **149a → 149b → 149d (parallel with 149b) → 149c → 149e → 149f**.

---

## Open questions

1. **Nine steps vs eight** — Is `--bg-float` (toasts) distinct from `--bg-overlay` (dialogs), or one token with shadow differentiation?
2. **Sidebar vs panel** — Some views (CMS) use two sidebars; is `bg-sidebar` shared or do we need `bg-sidebar-primary` / `bg-sidebar-secondary`?
3. **Editor embeds** — Monaco, Excalidraw, calendar use custom CSS. Force `bg-well` on host only, or allow embed-specific overrides?
4. **Theme overrides** — Brand kit `elevation` map: per-step hex overrides or only `bg-canvas` seed + auto derive?
5. **Ontology storage** — Markdown in repo (like whiteboard) vs Trellis entities in Design rail (TRL-42)? Start markdown; promote hot patterns to graph.
6. **Navigation v2** — [navigation-ia.md](./navigation-ia.md) changes rail count; ontology uses `shell.chrome` regardless of icon count — confirm.

---

## References

- `packages/ui/src/theme/resolve.ts` — token resolution
- `packages/ui/src/styles/theme.css` — OC-2 fallbacks
- `packages/ui/script/colors.txt` — Tailwind token source
- `packages/app/src/components/route/route-motion.css` — route pattern CSS
- `packages/ui/src/components/dock-surface.tsx` — dock pattern (`data-dock-surface`)
- [whiteboard-ontology.md](./whiteboard-ontology.md) — template for agent vocabulary specs
- [packages/ui/ONTOLOGY.md](../packages/ui/ONTOLOGY.md) — primitive index
- [packages/app/ONTOLOGY.md](../packages/app/ONTOLOGY.md) — shell + composite index

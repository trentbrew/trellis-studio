# Affordance layout system & custom affordances

> **Milestone:** **TRL-172** (epic) · **TRL-173**–**TRL-180** (children)  
> **Related:** [projections-rail.md](./projections-rail.md) · [ui-elevation-ontology.md](./ui-elevation-ontology.md) · [agent-focus-context.md](./agent-focus-context.md) · [agent-testable-runtime.md](./agent-testable-runtime.md) · `.agent/plans/projections-notes.md`

Agent-facing plan for a **shared layout shell** every pinned affordance uses, a **layout-first router** over `ProjectionDefinition.layout`, and a **declarative path** for workspace- and agent-created custom affordances.

Implementation targets: `packages/app/src/components/affordance/`, `packages/app/src/components/route/`, `packages/app/src/pages/session/projection-panel.tsx`, `packages/app/src/lib/projections/`.

---

## Summary

The icon rail’s **Affordances** (pinned projections) share a registry and route (`?view=projection&lens=…`) but assemble UI ad hoc today:

| Affordance | Pattern today | Drift |
| ---------- | ------------- | ----- |
| CMS projections | `RouteView` → sidebar + header + table + drawer | Canonical master-detail |
| Notes | Custom `.notes-projection` split + nested `RouteView` | Same idea, different chrome |
| Clock | `RouteHeader` tabs in `meta` + centered hero | Utility pattern, no shared wrapper |
| Coming soon | `RouteEmptyState` only | OK as fallback |

**Goal:** one compositor (`AffordanceShell`), layout recipes keyed by `ProjectionLayout`, and dynamic registry entries so agents can create filtered graph views without new TSX per request.

**Non-goals (v1):**

- Arbitrary SolidJS codegen for affordances (Clock-class utilities use fixed templates only)
- Replacing core rail modes (Graph, Plan, Code, CMS, Assets)
- Full TRL-150 projection plugin API — v1 is declarative config; plugins remain v2

---

## Problem

1. **Inconsistent chrome** — tab placement, padding, compact panel class, empty states, and elevation differ per affordance.
2. **Layout router by lens id** — `ProjectionPanel` switches on `props.lens === "notes"` instead of `def.layout` / `def.query.kind`.
3. **No dynamic affordances** — registry is static in `registry.ts`; agent cannot pin a user-defined “Sprint tasks” view.
4. **Ontology gap** — `layout.route` exists in spec (TRL-169) but affordances don’t emit `data-ui-affordance` / `data-ui-pattern`.

---

## Architecture

### AffordanceShell (layout.route enforcement)

Single compositor all affordances render inside:

```text
AffordanceShell (data-ui-pattern="layout.route", data-ui-affordance={id})
├── header slot     — title, optional RouteNav tabs, actions
├── sidebar slot?   — collections, filters (bg-sidebar)
├── content slot    — scrollable well (bg-well)
└── detail slot?    — RouteDetailDrawer
```

Maps to [ui-elevation-ontology.md](./ui-elevation-ontology.md) route slots. Uses existing `RouteView` / `RoutePanel` / `RouteHeader` / `RouteContent` primitives — not a parallel component tree.

**File:** `packages/app/src/components/affordance/affordance-shell.tsx`

### Layout recipes (ProjectionLayout → renderer)

| Layout | Recipe component | Behavior | Reference |
| ------ | ---------------- | -------- | --------- |
| `table` / `list` | `MasterDetailAffordance` | Optional sidebar, header, table/list, detail drawer | `cms-projection.tsx` |
| `cards` | `GridCardsAffordance` | Header, card grid, optional split detail | Extract from `notes-projection.tsx` |
| `canvas` | `CanvasWellAffordance` | Minimal chrome, full-bleed well | `whiteboards-projection.tsx` |
| `calendar` | `CalendarWellAffordance` | Header + calendar body | `calendar-projection.tsx` |
| **`utility`** *(new)* | `UtilityTabsAffordance` | Tabbed single-pane tools | `clock-projection.tsx` |
| `kanban` | `KanbanAffordance` | v1: stub / coming soon | future |

**Router target** (`projection-panel.tsx`):

```tsx
// layout-first, lens-second for bespoke overrides only
<Switch>
  <Match when={def()?.layout === "utility" || props.lens === "clock"}>...</Match>
  <Match when={def()?.query.kind === "cms"}>...</Match>
  <Match when={def()?.query.kind === "assets"}>...</Match>
  ...
</Switch>
```

### Extend ProjectionLayout

Add to `packages/app/src/lib/projections/types.ts`:

```ts
export type ProjectionLayout =
  | "cards" | "list" | "table" | "kanban" | "canvas" | "calendar"
  | "utility"  // tabbed tools: Clock, future Music shell, etc.
```

Clock registry entry: `layout: "utility"`.

---

## Custom affordances (declarative v1)

### Extended definition shape

```ts
type CustomAffordance = ProjectionDefinition & {
  source: "builtin" | "workspace" | "agent"
  createdBy?: string   // agent id or user
  createdAt?: string
}
```

**Storage (v1):** merge order in `listProjections()`:

1. Builtins — `registry.ts`
2. Workspace — `opencode.jsonc` → `projections.custom[]`
3. *(stretch v1.1)* Graph entities `type: affordance` in Trellis store

**Agent tool surface (v1.1):**

```ts
affordance.create({ label, icon, layout, query, create? })
affordance.pin(id)
affordance.unpin(id)
```

Renderer uses layout recipes only — no new TSX per custom affordance.

### Affordance composer UI

Wizard in the rail **+ Browse affordances** picker:

- Name, icon picker, layout (table / cards / list)
- Data source: CMS collection(s), asset category, store type
- Optional create action label + collection
- Preview (empty state via AffordanceShell)
- **Pin to rail**

Agent fills the same schema via tools; user sees live preview.

**Relationship to TRL-150:** TRL-150 (Projection plugin API) remains the v2 path for lazy-loaded components and third-party packs. This milestone delivers **declarative custom affordances** only.

---

## Sequencing

| Order | Issue | Why |
| ----- | ----- | --- |
| **1** | TRL-173 AffordanceShell | Enforces slot contract; unblocks all migrations |
| **2** | TRL-174 Layout-first router | Stops lens-id switch growth |
| **3** | TRL-175 `utility` + UtilityTabs | Clock as first utility recipe |
| **4** | TRL-176 Migrate Notes + CMS through shell | Visual consistency |
| **5** | TRL-177 Ontology attributes | Agent inspect + e2e selectors |
| **6** | TRL-178 Dynamic registry | Agent/user-defined views without UI |
| **7** | TRL-179 Composer UI | Human-friendly face of same schema |
| **8** | TRL-180 Agent tools | `affordance.create` / pin |

**Parallelism:** TRL-173 and TRL-174 can land in one PR. TRL-176 can split Notes vs CMS. TRL-178–180 depend on shell + router.

**Elevation:** Do not block on TRL-170/171 token migration — use current route tokens; map to `--bg-*` when TRL-172 shell migration lands.

---

## Work units (Trellis issues)

| ID | Title | Priority | Depends |
| -- | ----- | -------- | ------- |
| **TRL-172** | Epic: Affordance layout system & custom affordances | high | — |
| **TRL-173** | AffordanceShell compositor + layout.route slots | high | TRL-172 |
| **TRL-174** | Layout-first ProjectionPanel router | high | TRL-173 |
| **TRL-175** | `utility` layout + UtilityTabs recipe (Clock) | high | TRL-173, TRL-174 |
| **TRL-176** | Migrate Notes and CMS projections through AffordanceShell | high | TRL-173 |
| **TRL-177** | Affordance ontology: `data-ui-affordance` + pattern attrs | medium | TRL-173 |
| **TRL-178** | Workspace custom affordance registry merge | high | TRL-174 |
| **TRL-179** | Affordance composer UI in + picker | medium | TRL-178 |
| **TRL-180** | Agent affordance.create / pin tools | medium | TRL-178 |

### Acceptance (TRL-172 epic)

- [ ] Spec linked from `projections-rail.md` and AGENTS graph briefing
- [ ] Clock, Notes, and one CMS projection render through AffordanceShell
- [ ] Custom affordance defined in `opencode.jsonc` appears in picker and renders via layout recipe
- [ ] `data-ui-affordance` present on active projection panel root

---

## Acceptance criteria (children)

### TRL-173 — AffordanceShell

- `AffordanceShell` exports header / sidebar / content / detail slots
- All slots use `route-panel--compact` + consistent padding by default
- Root has `data-ui-pattern="layout.route"` and `data-ui-affordance={id}`

### TRL-174 — Layout-first router

- `ProjectionPanel` routes primary path by `def.layout` and `def.query.kind`
- Lens-id `Match` only for affordances without a generic recipe (notes, whiteboards, calendar until migrated)
- Unknown lens still shows RouteEmptyState

### TRL-175 — UtilityTabs

- `ProjectionLayout` includes `utility`
- Clock uses `UtilityTabsAffordance`; tabs in standard header slot (not ad hoc `meta` placement)
- Registry `clock` entry uses `layout: "utility"`

### TRL-176 — Migration

- Notes split/grid uses `GridCardsAffordance` or AffordanceShell wrapper; `.notes-projection` split logic preserved
- CMS projection uses AffordanceShell slots (sidebar/header/content/detail)
- No visual regression on picker pin/unpin

### TRL-177 — Ontology

- Document slot → elevation mapping in this spec (or cross-link TRL-169)
- e2e can select `[data-ui-affordance="clock"]`

### TRL-178 — Dynamic registry

- `projections.custom[]` in opencode.jsonc merged into `listProjections()` / picker
- Custom entries respect `MAX_PROJECTION_PINS` and pin persistence
- `source: "workspace"` shown in picker group “Custom”

### TRL-179 — Composer UI

- “Create affordance” entry in + picker opens wizard
- Preview + pin writes to workspace config (or local persist v1)
- Validates required fields before pin

### TRL-180 — Agent tools

- Tool schema matches `ProjectionDefinition` subset
- Agent can create + pin without composer UI
- Focus context includes custom affordance id in payload

---

## Open questions

1. **Persist custom affordances in graph vs config?** Start `opencode.jsonc`; promote hot entries to Trellis store entities when CMS for affordances exists.
2. **Kanban recipe timing?** Stub in router; implement when TRL-168 kanban board ships or issue board projection added.
3. **Overlap with TRL-58 route unification?** AffordanceShell *is* the affordance-specific slice of TRL-60; link issues, don’t duplicate.
4. **Composer in graph vs modal?** Modal wizard v1; graph entity editor v2.

---

## References

- `packages/app/src/components/route/route-shell.tsx` — layout.route primitives
- `packages/app/src/pages/session/projection-panel.tsx` — current router
- `packages/app/src/lib/projections/registry.ts` — builtins
- `specs/projections-rail.md` — rail IA, WU-9 plugin API
- TRL-145 (registry, closed) · TRL-147 (picker, backlog) · TRL-150 (plugin API, backlog) · TRL-169 (elevation epic)

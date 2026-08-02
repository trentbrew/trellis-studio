# Studio app UI ontology

Agent-facing vocabulary for **`@opencode-ai/app`** (`packages/app/`). Tier-1 shell regions, Tier-2 layout patterns, and **composite index** — not a full component inventory.

Primitives: [packages/ui/ONTOLOGY.md](../ui/ONTOLOGY.md). Full spec: [ui-elevation-ontology.md](../../specs/ui-elevation-ontology.md).

## DOM contract

| Attribute | Purpose | Example |
| --------- | ------- | ------- |
| `data-ui-region` | Tier-1 shell slot | `data-ui-region="sidebar"` |
| `data-ui-pattern` | Tier-2 layout pattern | `data-ui-pattern="layout.route"` |
| `data-ui-slot` | Slot within a pattern | `data-ui-slot="header"` |
| `data-ui-component` | Tier-3 composite (target) | `data-ui-component="app.cms.entries-table"` |

Inspect priority: **region → pattern → slot → component**.

## Tier 1 — Shell regions

| ID | Elevation | Where |
| -- | --------- | ----- |
| `shell.canvas` | `bg-canvas` | `pages/layout.tsx` — main workspace |
| `shell.chrome` | `bg-chrome` | Activity rail, session affordance rail |
| `shell.sidebar` | `bg-sidebar` | File tree, route sidebars, thread list, design nav |
| `shell.panel` | `bg-panel` | Session working area, route panel frame |
| `shell.companion` | `bg-panel` | Agent chat dock (`session.tsx`) |
| `shell.overlay` | `bg-overlay` + scrim | Dialogs, command palette (primitives) |

## Tier 2 — Layout patterns

| Pattern ID | Reference | Slots (`data-ui-slot`) |
| ---------- | --------- | ------------------------ |
| `layout.route` | `components/route/route-shell.tsx` | `sidebar`, `header`, `content`, `detail` |
| `layout.rail` | `pages/session/session-side-panel.tsx` | Affordance icon rail |
| `layout.split` | Session editor + file tree resize | `pane`, `handle` |
| `layout.well` | CMS table, editors | Scroll body + sticky footer |
| `layout.dock` | `@opencode-ai/ui/dock-surface` | `shell`, `tray` |
| `layout.inspector` | CMS entry editor, entity detail | Summary + fields |
| `layout.drawer` | `RouteDetailDrawer` | `head`, `body` |

### `layout.route` slot → elevation

| Slot | Elevation | CSS / component |
| ---- | --------- | --------------- |
| `sidebar` | `bg-sidebar` | `.route-sidebar` |
| `header` | `bg-sidebar` | `.route-header` (matches sidebar band) |
| `content` | `bg-well` | `.route-content` |
| `detail` | `bg-elevated` | `.route-detail` |

## Composite inventory (Tier 3 — app)

Visual QA: `http://localhost:4848` (`jr` from studio). Route projections use `layout.route`.

| ID | Path | Pattern / region |
| -- | ---- | ---------------- |
| `app.layout.shell` | `pages/layout.tsx` | `shell.canvas`, `shell.chrome`, `shell.sidebar` |
| `app.session.shell` | `pages/session.tsx` | `shell.panel`, `shell.companion` |
| `app.session.side-panel` | `pages/session/session-side-panel.tsx` | `layout.rail`, `shell.panel` |
| `app.session.file-tree` | `#file-tree-panel` | `shell.sidebar`, `layout.split` |
| `app.session.file-tabs` | `pages/session/file-tabs.tsx` | Editor tabs + well |
| `app.session.design-panel` | `pages/session/design-panel.tsx` | `layout.route` |
| `app.session.terminal-panel` | `pages/session/terminal-panel.tsx` | `shell.panel` |
| `app.session.browser-panel` | `pages/session/browser-panel.tsx` | Embedded browser well |
| `app.route.shell` | `components/route/route-shell.tsx` | `layout.route` |
| `app.cms.panel` | `pages/session/cms-panel.tsx` | `layout.route` |
| `app.cms.projection` | `pages/session/cms-projection.tsx` | `layout.route` |
| `app.cms.entries-table` | `components/cms/entries-table.tsx` | `layout.well` |
| `app.cms.entry-editor` | `components/cms/entry-editor.tsx` | `layout.inspector` |
| `app.cms.collections-sidebar` | `components/cms/collections-sidebar.tsx` | `shell.sidebar` |
| `app.database.panel` | `pages/session/database-panel.tsx` | `layout.route` |
| `app.database.entity-sidebar` | `components/database/entity-sidebar.tsx` | `shell.sidebar` |
| `app.calendar.projection` | `pages/session/calendar-view.tsx` | `layout.route` |
| `app.clock.projection` | `pages/session/clock-projection.tsx` | `layout.route` |
| `app.whiteboards.projection` | `pages/session/whiteboards-projection.tsx` | `layout.route` |
| `app.notes.projection` | `pages/session/notes-projection.tsx` | `layout.route` |
| `app.trellis.graph` | `pages/trellis.tsx` | Graph canvas + minimap |
| `app.projection.router` | `pages/session/projection-panel.tsx` | Affordance lens host |
| `app.affordance.shell` | `components/affordance/affordance-shell.tsx` | `layout.route` compositor for pinned lenses |

Agent skill: [.opencode/skill/studio-ui/SKILL.md](../../.opencode/skill/studio-ui/SKILL.md)

## Agent vocabulary

- **Region** → `shell.panel`, not “main area”
- **Pattern** → `layout.route`, not “sidebar layout”
- **Composite** → `app.cms.entries-table`, not “the table component”

## Related

- [ui-elevation-ontology.md](../../specs/ui-elevation-ontology.md)
- [affordance-layout-system.md](../../specs/affordance-layout-system.md) — AffordanceShell + custom affordances (TRL-172, partial)
- [navigation-ia.md](../../specs/navigation-ia.md) — five-icon rail IA

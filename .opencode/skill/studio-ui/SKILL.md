---
name: studio-ui
description: >-
  Studio UI elevation ladder, shell regions, layout patterns, and component
  ontology. Use when editing Trellis Studio UI in packages/app or packages/ui,
  assigning bg-* tokens, adding data-ui-region attributes, migrating shell
  chrome, or referencing ui.* / app.* component IDs.
---

# Studio UI ontology & elevation

Trellis Studio (`studio/packages/app`, `@opencode-ai/ui`) uses a shared vocabulary for shell depth and component IDs. Read ontology files before editing layout or backgrounds.

## Required reading (in order)

1. [specs/ui-elevation-ontology.md](../../specs/ui-elevation-ontology.md) — elevation ladder, Tier 1–2 patterns
2. [packages/app/ONTOLOGY.md](../../packages/app/ONTOLOGY.md) — shell regions, composites
3. [packages/ui/ONTOLOGY.md](../../packages/ui/ONTOLOGY.md) — primitives + Storybook index

## Vocabulary (use in issues and code review)

| Prefer                                            | Avoid                                                  |
| ------------------------------------------------- | ------------------------------------------------------ |
| `shell.panel`, `shell.sidebar`, `shell.companion` | “main area”, “left panel”                              |
| `layout.route`, `layout.rail`, `layout.well`      | “sidebar layout”, “CMS layout”                         |
| `bg-canvas` … `bg-overlay` (`--bg-*`)             | `background-weak`, `background-stronger` for structure |
| `ui.dialog`, `app.cms.entries-table`              | “modal”, “the table”                                   |

## DOM contract

```html
<div data-ui-region="panel" data-ui-pattern="layout.route" data-ui-slot="content"></div>
```

Inspect order: **region → pattern → slot → component** (`data-ui-component` when present).

### Shell regions (Tier 1)

| Region      | Token                | Typical host                              |
| ----------- | -------------------- | ----------------------------------------- |
| `canvas`    | `bg-canvas`          | `layout.tsx` workspace                    |
| `chrome`    | `bg-chrome`          | Activity rail, affordance rail            |
| `sidebar`   | `bg-sidebar`         | File tree, route sidebar, CMS collections |
| `panel`     | `bg-panel`           | Session shell, route panel frame          |
| `companion` | `bg-panel`           | Agent chat dock                           |
| `overlay`   | `bg-overlay` + scrim | Dialogs, command palette                  |

Route pattern slots: sidebar/header → `bg-sidebar`; content → `bg-well`; detail → `bg-elevated`.

## Elevation rules

1. **Structural depth** uses `--bg-*` only (monotonic ladder in `packages/ui/src/theme/resolve.ts`).
2. **Semantic state** keeps `--surface-*` (success, diff, brand) — do not fold into the ladder.
3. **No depth fakes** — avoid `color-mix(... var(--background-base) ...)`; use a ladder step.
4. **Legacy aliases** (`--background-base`, etc.) still resolve but are deprecated.

## Commands

```bash
# Storybook (primitives + Theme/Elevation)
bun --cwd packages/storybook storybook   # http://localhost:6006

# Regenerate primitive inventory table in ONTOLOGY.md
bun packages/ui/script/gen-ontology-inventory.ts

# Lint legacy elevation usage (warnings only)
bun --cwd packages/ui lint:elevation-tokens
```

## Key implementation paths

| Concern          | Path                                                    |
| ---------------- | ------------------------------------------------------- |
| Token resolution | `packages/ui/src/theme/resolve.ts`                      |
| Route shell CSS  | `packages/app/src/components/route/route-motion.css`    |
| Route components | `packages/app/src/components/route/route-shell.tsx`     |
| Session chrome   | `packages/app/src/pages/session/session-side-panel.tsx` |
| App layout       | `packages/app/src/pages/layout.tsx`                     |

## Sidebars: route vs session

Two sidebar systems coexist; pick by **what owns the surface**, not by appearance.

| Use                                                                          | When                                                                         | Behavior                                                                                                                                                                                                                                                                        | Path                                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ResizableRouteSidebar` (`ResizableSidebarLayout` + `ResizableSidebarPanel`) | Inside a route/affordance projection (CMS, calendar, database, trellis logs) | User-resizable + collapsible; width/collapse persisted per id under `trellis:route-sidebar:*`; drag handle; collapse animates slot width → 0 without inner-content reflow; toggled by `ResizableSidebarToggle` in the route header (wire via `AffordanceShell` `sidebarToggle`) | `packages/app/src/components/route/resizable-sidebar.tsx`, `resizable-sidebar-context.tsx` |
| `SessionThreadSidebar`                                                       | Fullscreen-session chrome (thread list) — **not** a projection affordance    | Fixed 280px; collapse-only (no resize); persists `collapsed` under `session-thread-sidebar`; floating absolute toggle; `data-ui-pattern="layout.split"`                                                                                                                         | `packages/app/src/components/session/session-thread-sidebar.tsx`                           |

Rule of thumb: if it lives in a route/affordance panel, use the resizable route sidebar so width/collapse persist per id and the header toggle works. Session chrome stays on `SessionThreadSidebar` — do not force it into the resizable-route pattern.

## When changing UI

1. Identify **region** and **pattern** from ontology — don't invent new names.
2. Pick **elevation** from the ladder table; match adjacent chrome (sidebar + header band use `bg-sidebar`).
3. Add or preserve `data-ui-region` / `data-ui-pattern` / `data-ui-slot` on shell edits.
4. Run `lint:elevation-tokens` if touching backgrounds in app or ui packages.
5. Visual QA at `http://localhost:4848` (`jr` / `just run` from studio).

## Related specs

- [affordance-layout-system.md](../../specs/affordance-layout-system.md) — AffordanceShell (future)
- [navigation-ia.md](../../specs/navigation-ia.md) — five-icon rail
- [whiteboard-ontology.md](../../specs/whiteboard-ontology.md) — `.whiteboard` vocabulary (separate domain)

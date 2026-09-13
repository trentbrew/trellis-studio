---
version: alpha
name: graph-spawn-populate
description: Design artifact for TRL-74 — seamless GraphView populate, 2D default, Obsidian-like node spawn
source:
  tool: greenfield
  mock: docs/artifacts/graph_spawn_populate_mockup.html
colors:
  background: "#0c0c0e"
  surface: "#141418"
  well: "#101014"
  text: "#e8e8ec"
  text-muted: "#888894"
  primary: "#14b8a6"
  spawn: "#10b981"
  destructive: "#ef4444"
  border: "#2a2a32"
typography:
  body:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: 500
    letterSpacing: 0.04em
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
components:
  graph-canvas:
    backgroundColor: "{colors.well}"
    borderColor: "{colors.border}"
  spawn-node:
    duration: 300ms
    easing: cubic-bezier(0.22, 1, 0.36, 1)
    scaleFrom: 0.18
  fresh-halo:
    duration: 6000ms
    color: "{colors.spawn}"
---

# Design: Graph spawn populate

**Status:** Design complete (handoff to Architect)  
**Parent:** TRL-74  
**Mock:** [graph_spawn_populate_mockup.html](./graph_spawn_populate_mockup.html)

---

## Overview

Graph view is a living constellation, not a slideshow. Opening the Database graph tab should feel like arriving in a room that is already lit: the canvas is present immediately, nodes appear where physics puts them, and later arrivals **spawn** instead of reloading the sky.

Emotional tone: quiet, local-first, Craftpunk — same density as Studio chrome, no overlay theater. Audience: Trent in session, agents mutating the store; the graph is a companion surface in `app.database.panel`, not a splash screen.

Signature: **node-local birth** (scale + opacity at layout x/y). The mistake today is **scene-local** motion (blank canvas, spinner overlay, 550ms full-group fade, renderer remount). Spawn duration **300ms** matches `.route-motion-pop` / `route-pop-enter` ease — not that CSS class on SVG. Fresh halo **6s** matches `freshHighlight`.

## Colors

| Role | Token | Use |
| ---- | ----- | --- |
| Canvas | `{colors.well}` | Graph surface (`bg-well` / `--bg-well`) |
| Chrome | `{colors.surface}` | Filter rail, Graph options panel (`bg-elevated`) |
| Spawn | `{colors.spawn}` | **Halo only** — emerald `#10b981`, sibling of `.fresh-overlay` / `freshHighlight` |
| Type | entity theme | Node **body** fill stays `entityColor` — spawn never recolors the glyph |

Do not use overlay scrim (`bg-overlay`) for graph fetch. Error retry stays an in-canvas caption, not a modal.

## Typography

Labels on nodes stay 10–11px (`typography.label`). Graph options stay uppercase 10px tracking as today. No new display face — this is motion on an existing surface.

## Layout

Unchanged regions:

| Region | Pattern | Notes |
| ------ | ------- | ----- |
| Filter rail | `shell.sidebar` | May collapse when detail drawer open |
| Graph surface | `shell.panel` / `bg-well` | Always painted; never replaced by spinner |
| Graph options | bottom-left chrome | Visible during background refresh |
| Detail drawer | `bg-elevated` | Independent of spawn |

Default view mode remains **2D**. 3D is a user toggle in Graph options (persisted). Spawn rules apply to SVG and Canvas2D first; WebGL may reuse the same enter contract if cheap.

## Elevation & Depth

Graph lives in the Database panel well. Do not promote fetch state to `overlay`. Spinner, if any, is a **corner whisper** (optional 11px caption bottom-center), never an `absolute inset-0` veil.

## Shapes

Nodes keep current radii (`nodeRadius`). Spawn scale origin is the node center. Halo is concentric, not a second layout.

## Components

| Component | Anatomy | States | Maps to codebase |
| --------- | ------- | ------ | ---------------- |
| Graph surface | SVG and/or Canvas2D host | idle, hydrating (no veil), error | `GraphView` in `trellis.tsx` |
| Renderer handle | live sim + zoom | patch, remount-only-on-mode-change | `graph-shared.ts` `RenderHandle` — add `patch()`; `renderSvg` / `graph-canvas.ts` |
| Entering node | body + optional halo | spawning, settled, fresh | Enter set vs `SimNode.fresh` / `highlightIds` |
| Graph options | 2D / 3D, physics | 2D default | `FloatingPhysicsPanel` |
| Loading caption | optional text | hydrating | replace `Show when={isLoading()}` overlay |

## Interaction matrix

| Input | States | Output |
| ----- | ------ | ------ |
| Open Graph tab (cold, empty cache) | hydrating | Canvas + chrome visible; no overlay; nodes enter as they arrive |
| Open Graph tab (preload / warm layout) | idle | Instant paint at persisted x/y; no intro fade |
| Store/revision patch (new ids) | idle → patch | Diff enter/update/exit; **no** `stop()`+remount; new ids spawn 300ms |
| Store/revision patch (same ids, attr change) | idle | Update in place; no spawn |
| Type filter toggle | idle | Exit fade 180ms or instant if reduced-motion; enter spawn for newly visible |
| 2D ↔ 3D toggle | mode change | Remount allowed **once**; 2D remains default on first visit |
| Agent creates entity (`store.fresh`) | spawning + fresh | Enter spawn 300ms **plus** 6s emerald halo (`transform`+opacity, not `r` tween; color `{colors.spawn}`) |
| First physics settle (cold, no layout) | hydrating | Seed positions; run sim; nodes already visible (opacity/scale from enter), not hidden until settle |
| `prefers-reduced-motion: reduce` | any | No scale; opacity 0→1 in 80ms or instant; no scene fade; no halo animation |
| Graph fetch error | error | In-canvas message + Retry; canvas stays |
| Empty graph (0 nodes) | empty | Existing empty copy; not a spinner |

## Accessibility

- Focus order: filter rail → Graph options (2D/3D, toggles) → canvas (tabindex as today) → detail drawer
- Labels / live regions: optional `aria-busy="true"` on the graph surface while hydrating **without** hiding content; do not `aria-hidden` the canvas
- Motion: honor `prefers-reduced-motion` via `@media` (same kill-switch as `route-motion.css`). No scale, no scene fade, **no halo animation** (static ~10% emerald tint if `fresh`). Opacity 0→1 in ≤80ms or instant. Gate `edgeFlow` the same way.

## Do's and Don'ts

**Do**

- Keep 2D as default (`trellis:graph-view-mode` unset → `2d`)
- Diff graph data into a live renderer (preserve zoom, sim, DOM/canvas layers)
- Spawn **node-local** (scale 0.18→1, 300ms, `cubic-bezier(0.22, 1, 0.36, 1)`)
- Separate **enter** (every new id) from **fresh** (agent highlight, 6s emerald halo only)

**Don't**

- Cover the canvas with a loading overlay
- Fade or clear the entire `<g>` / scene on each data tick (`introMs` scene fade)
- Remount `renderForceGraph` when only nodes/edges/filters patch
- Use 5.5s `nodeBirth` (`#22c55e`, scale 3.4) as bulk populate — that is a strobe, not enter

## Open for Architect

- Add `RenderHandle.patch(nodes, links)` (or equivalent) so `GraphView` does not `stop()` on data/filter change; remount only when `viewMode` or renderer override changes
- Split `fresh` vs `entering`: all new ids enter; only `highlightIds` / `store.fresh` get long halo
- Remove `introMs` full-scene opacity; Canvas path already seeds positions — SVG should match
- Drop `Show when={isLoading()}` inset overlay; optional caption only
- Gate graph keyframes with `prefers-reduced-motion` (today graph ignores it)
- 3D WebGL: out of scope unless patch is cheap; mode switch remount is OK
- AC to encode: matrix rows above; no backend API change

## Handoff checklist

- [x] `docs/artifacts/graph_spawn_populate_design.md` (this file)
- [x] `docs/artifacts/graph_spawn_populate_mockup.html`
- [x] Paths in design issue `describe` SUMMARY (TRL-75)

# Spec: Graph spawn populate (TRL-75)

**Parent design:** TRL-75  
**Proposal:** TRL-74  
**Design:** `docs/artifacts/graph_spawn_populate_design.md`  
**Mock:** `docs/artifacts/graph_spawn_populate_mockup.html`

No backend API change. Scope is Studio GraphView 2D (SVG + Canvas2D). WebGL/3D spawn is out of scope; 2D↔3D toggle may remount.

## Problem

`GraphView` remounts the force renderer whenever `graph()` / filters / `viewMode` change (`stop()` then `renderForceGraph`). SVG applies a 550ms full-scene `introMs` fade. Fetch paints an `absolute inset-0` spinner. Fresh highlight uses 5.5s `nodeBirth` (`#22c55e`, scale 3.4) for any `fresh` flag. Graph keyframes ignore `prefers-reduced-motion`.

## Contract

### `RenderHandle.patch`

Extend `packages/app/src/pages/graph-shared.ts`:

```ts
patch: (nodes: SimNode[], links: SimLink[]) => void
```

- Merge by `id`: keep existing sim x/y/vx/vy for ids that remain.
- Enter set = ids in `nodes` not in the previous handle set. Those nodes spawn (see Motion).
- Update set = same ids, attr/theme/fresh change — mutate in place, no enter spawn.
- Exit set = ids missing from `nodes` — remove after ≤180ms fade (instant if reduced motion).
- Preserve zoom transform and running simulation; reheat (`alphaTarget` / `restart`) as needed.
- SVG (`renderSvg`) and Canvas2D (`graph-canvas.ts`) **must** implement `patch`.
- WebGL: `patch` may be a no-op that callers must not rely on; GraphView remounts when `viewMode === "3d"` or `?renderer=webgl|3d`.

### GraphView wiring (`trellis.tsx`)

Split the current single `createEffect` that always `stop()`s:

| Trigger | Action |
| ------- | ------ |
| First mount, `viewMode` change, `?renderer=` change | `stop()` + `renderForceGraph` once |
| `graph()` / type filters / theme / `highlightIds` | `graphApi.patch(filteredNodes, filteredLinks)` only |

Do not `stop()` on data or filter patch.

Default `loadViewMode()` remains `"2d"` when `localStorage` `trellis:graph-view-mode` is unset.

### Overlay / a11y

- Remove the `Show when={isLoading()}` `absolute inset-0` spinner veil.
- Canvas (`svg` host) stays painted. Optional bottom-center caption (11px, `text-text-weak`) while hydrating.
- Set `aria-busy="true"` on the graph surface while hydrating; do **not** `aria-hidden` the canvas.
- Fetch error stays in-canvas + Retry (may keep a centered message). Empty graph stays existing copy — not a spinner.

Add `data-component="graph-surface"` on the graph host for e2e.

### Motion

Shared CSS (or SVG attrs) — do **not** apply `.route-motion-pop` to SVG nodes.

| Kind | Who | Motion |
| ---- | --- | ------ |
| Enter | every new id | 300ms, scale 0.18→1 + opacity 0→1, ease `cubic-bezier(0.22, 1, 0.36, 1)`, origin node center |
| Fresh halo | `highlightIds` / `store.fresh` only | 6000ms, stroke `#10b981`, **transform + opacity** (not `r` tween). Body fill stays `entityColor`. |
| Scene | never | No `introMs` full `<g>` fade. Delete or stop using `introMs = 550`. |
| Bulk populate | never | Do not use `@keyframes nodeBirth` (5.5s, `#22c55e`, scale 3.4) as enter. |

Canvas2D: `birthIds` today keys off `n.fresh`. Split: enter ids vs fresh ids. Enter uses 300ms scale; halo only for fresh.

### Reduced motion

If `prefers-reduced-motion: reduce` (match `route-motion.css`):

- No scale spawn; opacity 0→1 in ≤80ms or instant.
- No scene fade.
- No halo **animation**; static ~10% emerald stroke if fresh.
- Gate `edgeFlow` the same way.

### Files (Executor)

| File | Change |
| ---- | ------ |
| `packages/app/src/pages/graph-shared.ts` | `patch` on `RenderHandle`; optional `enterIds(prev, next)` helper for unit tests |
| `packages/app/src/pages/trellis.tsx` | GraphView effect split; overlay; SVG enter/fresh CSS; kill `introMs`; gate `edgeFlow`/`nodeBirth` |
| `packages/app/src/pages/graph-canvas.ts` | `patch` + enter vs birth |
| `packages/app/src/pages/graph-webgl-bridge.ts` | Remount on 3D only; stub `patch` if required by type |
| `packages/app/src/pages/graph-enter.test.ts` (new) | Pure diff: enter/update/exit |
| `packages/app/e2e/graph/graph-spawn.spec.ts` (new) | Surface visible, no veil, 2D default |

New primitives: none. Reuse `entityColor`, `freshHighlight` duration sibling, route ease numbers only.

## Acceptance criteria

```
test:cd packages/app && bun typecheck
test:cd packages/app && bun test --preload ./happydom.ts src/pages/graph-enter.test.ts
test:cd packages/app && bun test:e2e -- e2e/graph/graph-spawn.spec.ts
```

Behavioral (human / e2e):

1. Opening Graph (`?view=graph`) shows the svg/canvas immediately; no full-surface spinner overlay; optional caption only.
2. Unset `trellis:graph-view-mode` → Graph options 2D is pressed.
3. New nodes after a live store patch spawn in place (no blank flash / remount of the whole scene).
4. `prefers-reduced-motion: reduce` → no scale spawn and no animated halo.
5. 2D↔3D toggle remounts once; data patches in 2D do not remount.

## Out of scope

- WebGL node spawn animation
- Backend `/trellis/graph` shape
- Changing entity body colors for spawn

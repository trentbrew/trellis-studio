# Fractal Responsiveness

> **Status:** Concept brief v2 — **platform track** (TurtleOS / sprite-client). Studio implements **precursors only**; do not build the full fractal engine inside SolidJS.  
> **Related:** [projections-rail.md](./projections-rail.md) · [ui-elevation-ontology.md](./ui-elevation-ontology.md) · [entity-dialog-hardening.md](./entity-dialog-hardening.md) · [navigation-ia.md](./navigation-ia.md) · [whiteboard-ontology.md](./whiteboard-ontology.md) · [`.agent/plans/projections-notes.md`](../.agent/plans/projections-notes.md)

Agent-facing rendering model for **Trellis graph entities** (Things). Framework-agnostic; TQL Kernel is the data substrate. Implementation examples use Vue 3 syntax but concepts apply to Studio (`packages/app`, SolidJS) and `@opencode-ai/ui`.

**TRELLIS / TURTLESTACK — Working Notes**  
Trenton Brew · Turtle Labs LLC · 2025

---

## Scope & deferral

Fractal Responsiveness is a **rendering philosophy with platform consequences** — not a Studio sprint. Pigeonholing the full model into the existing SolidJS app (`packages/app`) would fight today’s working surfaces (CMS table, graph drawer, entity dialog stack, calendar) and duplicate work destined for TurtleOS.

| Track | Owner | Scope |
| ----- | ----- | ----- |
| **Platform** | TurtleOS · sprite-client (Vue/Nuxt reference) | Canvas `scale → vantage`, dual-shell crossfade, ghost proxy, shell registry, constellation layout (§5–10) |
| **Studio precursors** | `packages/app` | Projection `ambientVantage` + ceiling; natural-vantage type config; shared vocabulary; optional thin `<Thing vantage={n}>` later; [agent focus context](./agent-focus-context.md) for agents (parallel track) |
| **Studio incremental UX** | `packages/app` | [Entity dialog hardening](./entity-dialog-hardening.md) — vantage ~11 dialog territory without the fractal engine |
| **Not in Studio v1** | — | Universe/cosmos vantages, force-directed affinity canvas, continuous crossfade hot path, wholesale `<Thing>` registry replacing all entity UIs |

**Ship order:** [UI elevation TRL-149](./ui-elevation-ontology.md) → entity dialog shell (TRL-150) → projection ambient vantage → **then** platform fractal package consumed by Studio (do not reimplement in Solid).

---

## Summary

A **Thing** — any entity in the Trellis graph — is not bound to a single visual representation. It exists on a continuous spectrum of fidelity, from a single dot to a full navigable workspace. The same kernel of data expresses itself differently depending on how close the observer is and what they need from it.

This is not a UI pattern. It is a **rendering philosophy** with architectural consequences.

The name is precise: *fractal* because the system is self-similar at every scale (a workspace is a dot from far enough away), *responsive* because the representation responds to **relational context**, not screen size.

### Orthogonal to shell elevation

[UI elevation & ontology](./ui-elevation-ontology.md) (TRL-149) governs **IDE chrome depth** (`bg-canvas` → `bg-overlay`). Fractal Responsiveness governs **entity fidelity** inside that chrome (`vantage` 0–20). They compose:

```text
Shell elevation  →  where UI lives (sidebar, panel, well, overlay)
Vantage          →  how much of a Thing you see (dot → card → dialog → workspace)
```

---

## 1. The Central Claim

A Thing's **Kernel** (TQL data) is immutable from the Shell's perspective. Only its **Shell** (visual representation) changes with vantage.

---

## 2. Core Vocabulary

### Thing
Any entity in the TQL graph. Has a type, a set of properties, and affinities to other Things. The Thing itself never changes — only its representation does.

### Kernel
The data layer. Resolved via TQL. Type-safe, graph-aware, observer-independent. The Kernel is what a Thing *is*.

### Shell
The UI layer. A visual representation of the Kernel at a specific vantage. The Shell is what a Thing *looks like* from a given position.

### Vantage
A scalar value (0–20+) representing the observer's focal depth relative to a Thing. Not a named state — a continuous number. Low vantage = far away = minimal representation. High vantage = close up = full fidelity.

### Projection
A view type applied to a collection of Things. Table, kanban, gantt, constellation, calendar. Projections set the *ambient vantage* for all Things within them. Observer-independent — a table is a table for everyone.

See also: [projections-rail.md](./projections-rail.md) for Studio's current projection registry (query + layout — **ambient vantage not wired yet**).

### Affinity
The relationship between two Things. Has type (structural, semantic, temporal, co-occurrence) and magnitude (0–100). Affinities are graph edges with texture. They determine spatial positioning in the constellation projection and visible connections in the dialog shell.

---

## 3. Vantage vs. Projection — The Critical Distinction

These two concepts are easy to conflate and important to keep separate.

| | Projection | Vantage |
|---|---|---|
| **What it is** | The view type | The focal depth |
| **Who determines it** | The parent layout | The observer's zoom |
| **Observer-dependent?** | No | Yes |
| **Example** | Kanban board | Card (8) |
| **Scope** | Collection of Things | Single Thing |

You can be at vantage 8 (card fidelity) inside a kanban projection, or vantage 5 (row fidelity) inside a table projection. Vantage and projection compose independently.

The projection sets a *ceiling* on vantage — a table row won't spontaneously render at dialog fidelity. But within that ceiling, zoom drives the continuous vantage value.

---

## 4. The Vantage Scale

Seven territories, 21 named positions. The numbers are a convenience — the territory boundaries matter more than exact values.

```text
TERRITORY        VANTAGE    NAME               NOTES
─────────────────────────────────────────────────────────────────
sub-dot          0          signal             Pulse, no identity

dot              1          node               Dot, no label
                 2          labeled node       Dot + name

inline           3          mention            @thing in prose
                 4          token              Chip in a field

list             5          row                Table / list item
                 5.5        calendar item      Temporal grid geometry
                 6          gantt item         Row + time dimension
                 7          feed item          Row + activity dimension

card             8          kanban card        Title + key props
                 9          preview card       Hover / sidebar
                 10         profile card       Type-specific summary

panel            11         dialog             Full props, editable
                 12         inspector          Persistent side pane
                 13         drawer             Full height, partial width

screen           14         detail view        Owns the viewport
                 15         workspace          Thing is the environment

map              16         cluster            Collapsed group
                 17         constellation      Spatial graph layout
                 18         map                Full graph, nodes in space

cosmos           19         screen             Navigable canvas
                 20         universe           Network of workspaces
```

### The Dot Floor
The node (vantage 1) is the hard floor. You cannot zoom in further. It is indivisible — the atom.

But the dot is simultaneously a star: at vantage 20 (universe), a workspace appears as a dot on the network map. The system is self-similar. Infinite zoom out, hard limit zoom in. Turtles all the way up.

### Natural Vantage
Every Thing type has a natural vantage — the fidelity level it gravitates toward when no projection or observer context overrides it. This is defined on the type, not the instance.

```text
note      → 8   (card)
task      → 8   (card)
user      → 3   (mention)
project   → 15  (workspace)
tag       → 4   (token)
event     → 5.5 (calendar item)
```

Natural vantage makes the UI feel *weighted* — some Things are heavy and take up space by default, others are light and stay inline.

---

## 5. The Rendering Model

### The Continuous Vantage Problem

Vantage is a continuous scalar, not a discrete state. This is what separates Fractal Responsiveness from conventional responsive design patterns.

On a canvas, zoom is an analog input. As the observer zooms in on a node, the vantage value rises continuously from 1 toward 8. There is no moment where a component "swaps" — there is only a number flowing through the system.

This requires a different rendering primitive than `v-if` chains or switch statements.

### The Dual-Shell Crossfade

At any zoom level near a territory boundary, two adjacent shells are mounted simultaneously. The crossfade position — a value 0.0 → 1.0 — drives their relative opacity:

```text
vantage = 8.6  →  lowerShell = VantageCard (opacity: 0.4)
                   upperShell = VantageDialog (opacity: 0.6)
```

```text
lowerShell = resolveShell(floor(vantage))
upperShell = resolveShell(ceil(vantage))
crossfade  = vantage % 1
```

Both shells are in the DOM. Neither swaps. The transition is a pure CSS opacity blend driven by a single scalar. No FLIP, no clone, no component remount in the hot path.

### The Shell Registry

Shell boundaries are centrally registered. Adding a new shell is one entry — no changes to `Thing` logic:

```text
SHELLS = [
  { min: 0,  max: 2,  shell: ShellNode },
  { min: 3,  max: 4,  shell: ShellMention },
  { min: 5,  max: 7,  shell: ShellRow },
  { min: 8,  max: 10, shell: ShellCard },
  { min: 11, max: 13, shell: ShellDialog },
  { min: 14, max: 20, shell: ShellScreen },
]

resolveShell(v) → SHELLS.find(s => v >= s.min && v <= s.max)
```

The registry can be themed. A "Streamlined" registry might collapse card and dialog into a single shell. A "Dense" registry might add a dedicated gantt shell. The resolution logic doesn't change.

### Intra-Shell Property Morphing

Within a single shell territory (e.g., vantage 8.0 → 8.9), individual properties scale continuously. Properties know their own visibility curve and apply it via CSS:

```css
.thing-card {
  /* description fades in across the card territory */
  .card-description {
    opacity: clamp(0, (var(--vantage) - 8) * 5, 1);
  }
  /* tags are invariant — always visible */
  .card-tags {
    opacity: 1;
  }
}
```

`--vantage` is a CSS custom property set on the Thing wrapper. Properties animate themselves in CSS. No per-property JS.

---

## 6. Property Rendering Contract

### Invariant Properties
Render identically at all vantages. They are at or near the dot floor — no further compression is possible.

- status pip
- type indicator
- avatar / user token
- tags / badges

### Vantage-Sensitive Properties
Each has a visibility range — a minimum vantage at which it appears, and optionally a fidelity curve within its range.

| property | appears at | full fidelity at | notes |
|---|---|---|---|
| name | 2 | 2 | always label, never truncated |
| type label | 4 | 4 | invariant once visible |
| status text | 5 | 5 | pip before 5, text after |
| description | 8 | 11 | truncated at card, full at dialog |
| date | 5 | 11 | icon at row, full timestamp at dialog |
| affinities | 1 | 11 | edge weight visually at node, bar chart at dialog |
| connections | 1 | 11 | edge count at node, chip list at dialog |
| body / notes | 11 | 14 | dialog and above only |
| activity feed | 12 | 15 | inspector and above |

### The Generic Shell Principle
Entity types should not fork the shell structure. A user profile card and a task card share the same shell. The difference is which properties populate it and optionally a type-specific color accent.

If a type seems to require a structurally different card, the question is whether it needs a different *vantage* rather than a different *card*. The shell is the shape. The kernel is the content.

---

## 7. The Canvas Architecture

### Zoom is the source of truth

The canvas maintains a single `scale` value driven by wheel/pinch/trackpad input. Everything else derives from it.

```text
scale (raw)
  → vantage scalar    (mapRange: scale → 0..20)
    → CSS --vantage   (set on each Thing wrapper)
      → shell crossfade opacity
      → property visibility curves
    → spatial layout  (affinity-weighted positions at low scale)
```

The scale → vantage mapping is a curve, not a linear function. The card territory (8–10) should have more dwell time than the node territory (1–2). The observer spends most of their time at card fidelity — the curve should reflect that.

### Pan/zoom lives above the component tree

Canvas transforms (scale, translate) are applied as a single CSS transform on the canvas wrapper. The component tree never sees raw pixel positions. Only the derived vantage scalar flows into Vue/React/Solid land.

This keeps the component tree clean and the canvas fast — CSS transforms are GPU-accelerated and don't trigger layout.

### Discrete zoom jumps (click to focus)

When a user clicks a node to expand it, or double-clicks to focus, this is a discrete zoom event — not a continuous scroll. The canvas animates `scale` to the threshold that corresponds to the target vantage. The continuous crossfade system handles the visual transition automatically as scale moves through the range.

```text
user clicks node at vantage 1
  → animate scale to card threshold (vantage 8)
  → canvas pans to center the node
  → crossfade runs automatically as scale moves
  → Thing arrives at card fidelity, spatially centered
```

No special casing. The continuous system handles it.

---

## 8. The Ghost Proxy — Spatial Memory

### Why it matters

When a user opens a dialog from a card, and the dialog appears as a centered overlay with no connection to its origin, the fractal illusion breaks. The observer loses their position in the graph. The Thing appears to teleport.

Spatial memory is the principle that Things should always appear to *travel* between vantages, not *swap*. The observer should always know where a Thing lives.

### When the ghost proxy is needed

The continuous crossfade handles in-canvas transitions. The ghost proxy is only needed when a Thing moves *outside* the canvas — specifically when a dialog/sheet portals to the document body (Radix, shadcn, Headless UI all do this).

### The Ghost Proxy Flow

```text
1.  User clicks VantageCard
2.  Snapshot card bounding rect (position + size in viewport)
3.  Open Dialog (opacity: 0, pointer-events: none)
    — Dialog portals to body, outside canvas transform
4.  Snapshot dialog bounding rect (final centered position)
5.  Create ghost div: position fixed, card rect, card content clone
6.  Animate ghost: card rect → dialog rect
    — translate, scale, border-radius
7.  onComplete: ghost.remove(), Dialog opacity → 1
8.  Dialog is now visible at full fidelity

Collapse (reverse):
1.  User closes Dialog
2.  Snapshot dialog bounding rect
3.  Create ghost div: position fixed, dialog rect, dialog content
4.  Dialog unmounts (or opacity → 0)
5.  Animate ghost: dialog rect → card rect (stored from open)
6.  onComplete: ghost.remove()
7.  Card is visible at card fidelity, spatially returned
```

Expand and collapse use the same bounding rect store. Spatial memory is symmetric — the Thing always returns to where it came from.

### The Bounding Rect Store

A module-level singleton. Not application state. Ephemeral positional data that lives for the duration of a single transition.

```text
boundingRectStore: Map<thingId, DOMRect>
  → written: onBeforeUnmount of any shell
  → read:    onMounted of any shell
  → cleared: after transition completes
```

---

## 9. The Resolution Priority Chain

When `Thing` resolves its vantage, it follows a strict priority order:

```text
1. Explicit prop       → vantage passed directly to <Thing vantage={11} />
2. Projection context  → ambient vantage injected by parent layout
3. Type default        → naturalVantage from the Thing type definition
4. Global fallback     → 8 (card)
```

The projection sets ambient vantage via a context/provide mechanism — no prop drilling. All Things within a `<ProjectionTable>` inherit vantage 5 unless overridden higher in the chain.

---

## 10. Affinities in the Spatial Layout

At low vantage (constellation, map), the positions of Things are not arbitrary. Affinity magnitude drives spatial clustering — Things that belong together drift together.

### Affinity types

| type | source | visual weight |
|---|---|---|
| structural | explicit TQL edge | strong |
| semantic | content similarity (embeddings) | medium |
| temporal | co-occurrence in time | medium |
| ownership | shared owner/creator | light |
| co-occurrence | appear together frequently | light |

### Positioning model

A force-directed layout seeded by affinity weights. High-affinity pairs have stronger attraction. The simulation runs once on load and on graph changes, not continuously — the result is a stable spatial arrangement that the observer learns over time.

The observer's spatial memory of the constellation is itself a form of knowledge about the graph. Where a node lives *is* information.

---

## 11. Invariants of the System

These rules hold regardless of framework, theme, or implementation:

1. **The Thing never changes.** Only its representation changes. Kernel is immutable from the Shell's perspective.
2. **Vantage is continuous.** No discrete component swaps in the hot path. Crossfade at boundaries.
3. **Projections set ceilings, not floors.** A table row won't become a dialog. A dialog won't spontaneously collapse to a row.
4. **Shells are generic.** Entity types accent shells, they do not fork them.
5. **Spatial memory is symmetric.** Things travel between vantages, they do not teleport. Collapse always returns to origin.
6. **Invariant properties are truly invariant.** Tags, pips, and avatars render the same everywhere.
7. **CSS does the work.** Property visibility curves live in CSS, not JS. `--vantage` is the only data crossing the boundary.
8. **The dot is the floor.** Vantage 1 is indivisible. No UI below it.
9. **The system is self-similar.** A workspace at vantage 15 appears as a dot at vantage 20. Turtles all the way up.

---

## 12. Open Questions

- **Affinity computation** — manual declaration, inferred from co-occurrence, embedding similarity, or a composable mix of all three? TQL probably handles the query but the signal sources need defining.
- **Natural vantage overrides** — can an instance override its type's natural vantage? A project marked "archived" might want to default to row (5) not workspace (15).
- **Vantage permissions** — can a projection cap the maximum vantage a given observer can reach? Access control as a vantage ceiling.
- **Signal (vantage 0)** — what does a pulse with no resolved identity look like? An optimistic placeholder while TQL resolves?
- **XR** — in 3D space, vantage becomes literal depth. The dot-to-workspace spectrum maps naturally onto a z-axis. The crossfade model still holds but the shell geometry changes completely.
- **Multi-vantage** — can a Thing be rendered at two vantages simultaneously in different parts of the UI? A task visible as a row in a table and as a card in a sidebar at the same time. The kernel is shared, the shells are independent instances.

---

## 13. Relationship to the Broader Stack

| | |
|---|---|
| **TQL Kernel** | The data substrate. All Thing resolution goes through TQL. The Kernel is the single source of truth — the Shell reads from it, never writes. |
| **TrelliOS** | Fractal Responsiveness is TrelliOS's core interaction model. The trellis layer over the substrate *is* the vantage system. |
| **Filegraph** | The graph model that makes multiple simultaneous vantages coherent. Things have many affinities and no canonical parent — the tree is just one projection. |
| **sprite-client** | Reference implementation (Vue 3 / Nuxt / shadcn-vue). Canvas architecture, dual-shell crossfade, and ghost proxy ship here first. |
| **Trellis Studio** | Target consumer — SolidJS app (`packages/app`). Projections rail and entity dialog are partial precursors; full fractal engine not yet wired. |
| **BSIDE** | Affinity-as-resonance — the same edge-quality model that powers BSIDE's compatibility logic applies directly to Thing-to-Thing affinities in the constellation. |

---

## 14. Studio today (gap analysis)

Studio has **projection lenses** and **entity navigation**, but not the unified fractal rendering engine.

| Fractal concept | Studio today | Path |
|---|---|---|
| **Projection** | Rail projections (`notes`, `calendar`, `cms`, …) — query + layout via `getProjection()` | Extend registry with `ambientVantage` + ceiling |
| **Row / card / dialog shells** | Separate components (`entries-table`, notes cards, `entity-dialog.tsx`) | Introduce `<Thing>` + shell registry |
| **Canvas zoom → vantage** | Graph/calendar own zoom; no shared `scale → vantage` | Unified canvas wrapper for graph + constellation |
| **Property morph contract** | Per-component truncation logic | `--vantage` CSS curves on generic shells |
| **Ghost proxy** | `entity-dialog.tsx` stack transforms — related spirit, not bounding-rect travel | Port ghost proxy for portaled dialogs |
| **Natural vantage per type** | Implicit (issues → detail, tags → chips) | Type registry in TQL or app config |
| **Resolution priority chain** | `entity-route.ts` routes by type/facts — navigation, not rendering fidelity | Separate vantage resolution context |

### Implementation targets (when scheduled)

| Area | Files |
| ---- | ----- |
| Thing wrapper + vantage context | `packages/app/src/components/thing/` (new) |
| Shell registry | `packages/app/src/lib/shell-registry.ts` (new) |
| Projection ambient vantage | `packages/app/src/lib/projections.ts`, `projection-panel.tsx` |
| Ghost proxy | `packages/app/src/lib/bounding-rect-store.ts` (new) |
| Entity dialog migration | `packages/app/src/components/entity-dialog.tsx` |
| Graph canvas | graph session views, constellation (future) |

### Suggested sequencing

**Studio (precursors only):**

1. **Natural vantage config** — defaults per entity type (doc + JSON; no renderer yet)
2. **Projection ambient vantage** — `ambientVantage` + ceiling on projection registry ([projections-rail.md](./projections-rail.md))
3. **Entity dialog shell** — [entity-dialog-hardening.md](./entity-dialog-hardening.md) (dialog + inset variants; not full fractal)

**Platform (TurtleOS / sprite-client — deferred):**

4. **`<Thing>` + shell registry** — generic shells, resolution priority chain
5. **Dual-shell crossfade** — continuous vantage at territory boundaries
6. **Ghost proxy** — portaled dialog spatial travel ([entity-dialog-hardening.md](./entity-dialog-hardening.md) may adopt later)
7. **Canvas unification** — graph zoom drives shared `scale → vantage` scalar

Do **not** block [UI elevation (TRL-149)](./ui-elevation-ontology.md) on fractal work — they are independent. Elevation should land first so shells (`bg-well`, `bg-overlay`) are stable when dialog/card shells migrate.

---

## References

- `packages/app/src/lib/projections.ts` — projection registry
- `packages/app/src/pages/session/projection-panel.tsx` — projection routing
- `packages/app/src/components/entity-dialog.tsx` — entity stack dialog (precursor)
- `packages/app/src/lib/entity-route.ts` — entity navigation by facts
- `specs/projections-rail.md` — rail projection zone
- `specs/ui-elevation-ontology.md` — shell chrome depth (orthogonal)

---

*v2 — continuous vantage model, canvas architecture, ghost proxy, CSS property morphing, Studio gap analysis.*  
*v1 — initial concept from whiteboard sketch, 9 vantages, discrete shells.*

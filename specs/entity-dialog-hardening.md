# Entity dialog hardening

> **Proposed milestone:** **TRL-150** (parent) · children **TRL-150a**–**TRL-150d**  
> **Status:** Plan — Studio SolidJS; incremental port of trellis-client (Nodebook) polish, not a rewrite  
> **Related:** [fractal-responsiveness.md](./fractal-responsiveness.md) · [ui-elevation-ontology.md](./ui-elevation-ontology.md) · [navigation-ia.md](./navigation-ia.md)

Cross-surface entity drill-down in **Trellis Studio** (`packages/app`). Covers modal stack + graph inset drawer — **not** the full fractal engine (deferred to TurtleOS / sprite-client).

Reference: trellis-client (Nodebook, Nuxt/Vue) `EntityDialogShell`, `useEntityDialog`, two-tier stack. Studio already has the core stack mechanism.

---

## Summary

Studio is **~40% of the way** to trellis-client’s entity UX. The stacking visual language and navigation API exist; the gap is **shell chrome** and **surface unification** (graph drawer ↔ modal stack).

**Do:** incremental hardening in SolidJS.  
**Don’t:** wholesale Nuxt → Solid port, two-tier stack split, or schema-driven dynamic dialogs until ontology investment justifies it.

---

## What Studio already has

| Capability | Location | Notes |
| ---------- | -------- | ----- |
| Stack provider | `EntityDialogProvider` / `useEntityDialog()` | `push` / `pop` / `clear` |
| Visual stacking | `getTransform()` in `entity-dialog.tsx` | scale, offsetY, brightness, pointer-events — same spirit as trellis-client |
| Multi-card host | `EntityDialogHost` inside one `useDialog()` | Entire stack in single modal — **simpler than trellis-client two-tier**; keep this |
| Shared dimensions API | `setSize(w, h)` on context | **Not wired to UI** — no resize handles on `EntityCard` yet |
| Type views | `IssueContent`, `WorkUnitContent`, `GenericContent` | Per-type JSX + `EntityDetailPanel` fallback |
| Navigation | `entity-navigate.ts`, `useEntityNavigate()` | Graph overrides via `EntityNavProvider`; default → `dialog.push()` |
| Wiring | `directory-layout.tsx` provider; trellis board, DB tabs, message timeline, mentions | Partial — calendar / whiteboard / notes projections not fully wired |

Key files:

- `packages/app/src/components/entity-dialog.tsx`
- `packages/app/src/lib/entity-navigate.ts`
- `packages/app/src/components/entity-detail/nav.tsx`
- `packages/app/src/pages/trellis.tsx` — `GraphDetailDrawer` (parallel surface)

---

## Gap vs trellis-client

| Layer | trellis-client | Studio today |
| ----- | -------------- | ------------ |
| **Stack orchestration** | Two-tier: page “originating” dialog + `DialogStackHost`; URL hash sync | Single host; one `useDialog()` — **adequate; don’t port two-tier unless a concrete page needs it** |
| **Shell chrome** | `EntityDialogShell`: resize, prev/next, editable title/desc, properties row, footer slots, `dialog` / `inset` / `inline` variants | Minimal header (back, type badge, close); fixed card sizing |
| **Entity logic** | `useEntityDialog` composable: hydration, auto-save, comments, refs | Per-type stores in JSX; no shared edit/hydration guard composable |
| **Graph surface** | Inset variant on same shell family | Separate `GraphDetailDrawer` with own header/body (~560 lines in `trellis.tsx`) |

---

## Relationship to other specs

| Spec | Relationship |
| ---- | -------------- |
| **TRL-149 elevation** | Dialog = `bg-overlay`; inset drawer = `bg-panel` / `bg-elevated`. Shell extraction should use elevation tokens, not ad-hoc `bg-surface-base`. |
| **Fractal responsiveness** | Entity dialog ≈ **vantage 11 (dialog)**. Hardening is Studio-appropriate; ghost proxy + crossfade defer to platform track. |
| **Navigation IA** | Graph per-entity tabs (Overview / History / …) already live in `GraphDetailDrawer`; unify body with shared shell, keep graph-specific chrome (recenter, hover sync) in graph page. |

---

## Phased plan

### TRL-150a — EntityDialogShell (~2–3 days)

Extract shell from `EntityCard`:

- Slots: `header`, `properties`, `body`, `footer`
- `variant`: `"dialog"` | `"inset"` (inline optional later)
- **Resize:** wire `setSize` + reuse `ResizeHandle` from graph drawer
- Bottom card reports dimensions → shared size for stacked cards behind
- Map to [UI ontology](./ui-elevation-ontology.md): `layout.inspector` pattern, `data-ui-component="app.entity-dialog-shell"`

Solid: per-card index context already exists via props; no Vue inject equivalent needed.

### TRL-150b — Stack polish (~1–2 days, optional)

Only if product needs originating page dialog + pushed refs simultaneously:

- Module-level `originOpen` + stack store split

**Default: skip.** Current single-dialog stack is simpler and matches Studio’s one-active-modal model.

### TRL-150c — Entity edit composable (~3–5 days)

Port trellis-client patterns as `useEntityEditor()` (Solid):

- `createStore` for editable fields
- `createEffect` keyed on entity id — guard against subscription echo clobbering edits
- Debounced auto-save → Trellis SDK mutations
- Shared by issue/workunit/generic paths

Skip Instant-specific auth/comments unless required.

### TRL-150d — Unify graph drawer (~2–3 days)

Replace `GraphDetailDrawer` body with `<EntityDialogShell variant="inset">` + shared content components.

**Keep in graph page only:** canvas recenter, hover sync, slide transition, width persistence.

**Delegate to shell:** header chrome, entity body, ref drill-down, resize semantics.

### Deferred (low ROI now)

| Item | When |
| ---- | ---- |
| URL hash sync for shareable entity deep links | After shell stable |
| Schema-driven `DynamicEntityDialog` | After stable entity schema API + ontology investment |
| Two-tier stack orchestration | Only if a page proves single-host insufficient |
| Fractal ghost proxy | Platform track; optional adoption after TRL-150a |

---

## Reference drill-down audit

Ensure all surfaces call `useEntityNavigate()` / `entityDialog.push()` (or `openEntityRef`):

| Surface | Status |
| ------- | ------ |
| Message timeline | ✅ wired |
| Trellis board / kanban | ✅ wired |
| Database tabs (records, facts, links) | ✅ wired |
| Entity detail preview / relationships | ✅ via `EntityNavProvider` or default |
| Mentions / wikilinks | ✅ `use-mention-callbacks.ts` |
| Graph drawer | ✅ custom navigate; shares content after 150d |
| Calendar projection | ⚠️ audit |
| Whiteboard bindings | ⚠️ audit |
| Notes projection | ⚠️ audit |
| CMS entry refs | ⚠️ partial via `entity-navigate` CMS route |

---

## Acceptance (TRL-150)

- [ ] `EntityDialogShell` with `dialog` + `inset` variants and resize
- [ ] Stacked cards use shared dimensions from front card
- [ ] Graph drawer body uses shared shell (graph-only chrome remains in `trellis.tsx`)
- [ ] Elevation tokens applied (`bg-overlay`, `bg-panel`) per TRL-149
- [ ] Calendar / notes / whiteboard ref clicks open entity stack (audit complete)

---

## Open questions

1. **Auto-save scope** — all editable entity types or issue/workunit only for v1?
2. **Inset width** — graph drawer persistence vs modal shared size: one store or two?
3. **Issue route** — `/trellis?issue=` vs dialog stack: when to use which?
4. **Comments / activity** — footer slot in shell or keep sidebar `EntityDetailPanel`?

---

## References

- `packages/app/src/components/entity-dialog.tsx`
- `packages/app/src/pages/trellis.tsx` — `GraphDetailDrawer`
- trellis-client (Nodebook) — reference implementation for shell chrome
- [fractal-responsiveness.md](./fractal-responsiveness.md) — vantage 11; platform engine deferred

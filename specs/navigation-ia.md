## navigation IA — five-icon rail

The left icon rail today is nine items: Home, Graph, Plan, Browser, Code, Review, Explore, CMS, Design. That count puts the IDE in the same shape as a feature-listing menu rather than an activity-mode app. This proposal collapses the rail to five activity-mode icons and routes the remaining views as tabs or sub-panes inside them.≤

### core idea

Group the rail by what the user *wants to do* (explore the project, plan work, write code, manage content, design), not by which data shape backs each view. Agent stays docked on the right as a persistent companion.

```text
Old (9 icons)                New (5 icons)
─────────────                ─────────────
Home                         Explore     ← Home · Graph · History · Decisions · Branches  (tabs)
Graph                        Plan        ← unchanged
Plan                         Code        ← Files · Editor · Review · Preview              (panes)
Browser                      CMS         ← unchanged (sidebar)
Code                         Design      ← unchanged (sidebar)
Review
Explore                      Agent stays on the right pane, always present.
CMS                          ⌘J expands the right pane to fullscreen.
Design
```

### tab vs. secondary sidebar policy

- **Tabs** — shallow (≤5 items), presentationally similar. Used by Explore and Plan.
- **Secondary sidebar** — hierarchical or variable depth. Used by Code, CMS, Design.

### why five, not nine

- Reduces top-level cognitive load. Five is the comfortable limit for at-a-glance scanning.
- Naming is activity-shaped (verbs/contexts), not data-shaped. "Code" is honest about what you do there; "Database" or "Graph" describe what's stored.
- Collapses related views into one place. History, Decisions, and Branches all answer "what is the state of this project?" — they belong inside Explore, not as siblings of it.
- Removes the metaphor conflict around Agent (companion AND destination). Companion only; ⌘J handles the "I want it big" case.

### rail items

```ts
[
  { id: "explore", label: "Explore", icon: Compass }, // tabs: home, graph, history, decisions, branches
  { id: "plan",    label: "Plan",    icon: Kanban  }, // tabs: backlog, in-progress, done
  { id: "code",    label: "Code",    icon: Folder  }, // panes: files | editor | review | preview
  { id: "cms",     label: "CMS",     icon: Layers  }, // secondary sidebar: collections → records → fields
  { id: "design",  label: "Design",  icon: Palette }, // secondary sidebar
]
```

Right pane: `<AgentChat />` always rendered. Keyboard shortcut `⌘J` toggles fullscreen mode.

### feature flag for safe rollout

Implementation lands behind a localStorage flag so the rollback is one DevTools command. Default off.

```js
// Enable
localStorage.setItem("trellis_nav_v2", "true")
// Rollback
localStorage.removeItem("trellis_nav_v2")
// Either way: refresh the page
```

The persisted rail-order key is namespaced by flag state (`session.rail.order` for v1, `session.rail.order.v2` for v2) so user-customized orderings are preserved per-version and don't cross-contaminate when toggling.

### implementation scope — mockup phase

- Add `RAIL_ITEMS_V2` constant alongside `RAIL_ITEMS` in [`pages/session/session-side-panel.tsx`](../packages/app/src/pages/session/session-side-panel.tsx).
- Compute the active rail list from the localStorage flag at component creation.
- Reuse existing tab routes (`?view=explore`, `?view=plan`, `?view=code`, `?view=cms`, `?view=design`) — no new routes yet.
- Don't restructure sub-pages yet. Clicking "Explore" in v2 takes you to the existing Explore view; the History/Decisions/Branches consolidation under Explore is a separate, later slice.
- Don't change the right pane in this slice. Agent stays where it is.

### implementation scope — follow-up slices

After the rail mockup ships and feels right:

1. **Explore as a tab parent**: surface Home/Graph/History/Decisions/Branches as a tab strip inside the Explore view (some of this already exists). Make Graph the default tab when no entity is selected.
2. **Per-entity tabs**: when an entity is selected, replace the tab strip with **Overview · History · Decisions · Relationships** scoped to that entity.
3. **Branches as first-class entities**: query branches as a Trellis entity type, list them in the Explore Branches tab and use `?branch=` query param for the active branch context.
4. **Code unification**: fold the current Browser, Code, and Review icons into a single Code view with the file tree as a secondary sidebar and a tabbed pane area (editor / diff / preview).
5. **⌘J fullscreen agent**: keyboard shortcut to toggle the right pane to fullscreen mode.

### rollback path

If the v2 rail is wrong:

1. `localStorage.removeItem("trellis_nav_v2")` and refresh → instant rollback for any user.
2. To remove the mockup code entirely, revert the single commit that adds `RAIL_ITEMS_V2` and the flag check. The change is isolated to one file; no other code references the v2 rail.

### open questions

- Where does **running an app / preview** live in Code? Inline panel toggled with a button, or its own tab?
- Does the agent's read scope (which project, which branch) change with the active rail icon, or stay sticky to the project root?
- For per-entity tabs, is **Overview** a tab or a persistent header above the tabs? Header is more anchoring; tab is more discoverable.
- Branch switching: when you change the active branch via the Branches tab, does the agent thread also scope to that branch (only sees ops/decisions on this branch), or stay global?

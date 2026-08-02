# WorkUnit & Hierarchy Schema

## Phase 1: WorkUnit Entity

### WorkUnit Schema

```typescript
WorkUnit {
  id: string                    // e.g., "WU-123"
  title: string                 // human-readable title
  cycle: string?                // link to Cycle (null = unassigned)
  specPath: string              // ".agent/plans/<id>.md"
  status: "backlog" | "in_progress" | "done"
  priority: "low" | "medium" | "high" | "critical"
  tags: string[]                // ["infra", "agent-facing", "breaking-change"]
  assignee: string?             // agent reference
  unassigned: boolean           // true if not yet organized

  // Criteria (testable)
  criteria: TestableCriterion[]

  // Timestamps
  createdAt: datetime
  updatedAt: datetime
  closedAt: datetime?           // set when status = done

  // Links
  links to: FileNode             // files touched
  links to: Decision            // decisions made
  links to: Branch               // context branch
  links to: WorkUnit             // sub-items
}

TestableCriterion {
  id: string
  description: string           // what must be true
  command?: string               // optional test command
  status: "pending" | "passed" | "failed"
  lastRunAt?: datetime
  lastOutput?: string
  verifiedBy?: string            // agent or human
}

PurposeCriterion {
  id: string
  intent: string                 // "Users can navigate history..."
  metric?: string                // "p95 load time < 200ms"
  verifiable: boolean            // true = measurable, false = directional
}
```

---

## Phase 2: Cycle + Hierarchy

### Telos (Config, not entity)

```
.trellis/telos.md

---
mission: "Build the last IDE you'll ever need"
vision: "An IDE that understands your codebase as a graph"
---

The mission is the telos. Everything we do serves it.
```

### Roadmap Entity

```typescript
Roadmap {
  id: string                     // e.g., "roadmap-2026"
  title: string
  telos: string                  // reference to .trellis/telos.md
  horizon: "now" | "next" | "later"
  status: "active" | "completed"

  links to: Milestone
}
```

### Milestone Entity

```typescript
Milestone {
  id: string                     // e.g., "MS-001"
  title: string
  roadmap: string                // link to Roadmap
  targetDate?: datetime          // optional, mostly for "now"/"next" horizons
  status: "active" | "completed"
  unassigned: boolean            // default true for migration

  links to: Cycle
}
```

### Cycle Entity

```typescript
Cycle {
  id: string                     // e.g., "CYCLE-001"
  title: string
  milestone: string?             // link to Milestone (null = _unorganized)
  purpose: string                // "how this serves the telos"
  criteria: PurposeCriterion[]   // impact-focused, not deterministic
  status: "backlog" | "in_progress" | "done"
  horizon: "now" | "next" | "later"

  links to: WorkUnit
}
```

---

## Migration

### Synthetic Containers

- **`_inbox` Milestone** — default home for migrated Issues
- **`_unorganized` Cycle** — children of `_inbox`

### Issue → WorkUnit Coercion

```
For each existing Issue:
  1. Map to WorkUnit schema (id, title, status, criteria, tags)
  2. Set cycle = "_unorganized"
  3. Set unassigned = true
  4. Generate specPath = ".agent/plans/<issue-id>.md"
  5. Link to existing Branch (if any)
```

---

## Decision Alignment (Transitive)

```
Decision → (links to) → WorkUnit → (links to) → Cycle → (links to) → Milestone → (links to) → Roadmap → (references) → Telos

Query: "all decisions in Cycle X" → derive alignment via hierarchy traversal
```

No direct `Decision.alignment` field — derive it transitively.

---

## Reserved Identifiers

- `_inbox` — reserved Milestone ID for unorganized WorkUnits
- `_unorganized` — reserved Cycle ID for unassigned WorkUnits
- `roadmap:default` — default Roadmap ID

---

## File Paths

| Entity        | Path                   |
| ------------- | ---------------------- |
| Telos         | `.trellis/telos.md`    |
| WorkUnit spec | `.agent/plans/<id>.md` |
| Roadmap       | TBD (graph entity)     |
| Milestone     | TBD (graph entity)     |
| Cycle         | TBD (graph entity)     |

---

## Notes

- WorkUnit.specPath lives alongside skill templates in `.agent/plans/`
- Cycle.criteria.verifiable flag distinguishes measurable vs directional outcomes
- Branch linkage: store `workunit_id` on Branch entity for simple query
- Tags are the escape hatch for cross-cutting concerns not captured in hierarchy

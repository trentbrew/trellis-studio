#!/usr/bin/env bun
/**
 * One-shot: record session-branches work in Trellis.
 * Run: bun packages/opencode/script/create-session-branch-issues.ts
 */
import { TrellisVcsEngine } from "trellis"

const dir = process.argv[2] ?? process.cwd()

if (!TrellisVcsEngine.isRepo(dir)) {
  console.error("Not a Trellis repo:", dir)
  process.exit(1)
}

const eng = new TrellisVcsEngine({ rootPath: dir })
eng.open()

const existing = eng.listIssues({ label: "session-branches" })
if (existing.some((i) => i.title.includes("Session-backed agent lanes"))) {
  console.log("Already tracked:", existing.map((i) => `${i.id} ${i.title}`).join("\n"))
  process.exit(0)
}

type Spec = {
  title: string
  priority: "critical" | "high" | "medium" | "low"
  labels: string[]
  description: string
  ac?: string[]
  parentId?: string
}

const epicSpec: Spec = {
  title: "Session-backed agent lanes for concurrent agents",
  priority: "high",
  labels: ["agent", "sessions", "vcs", "session-branches", "milestone"],
  description:
    "Work-oriented OpenCode sessions own Trellis branches so multiple agents can mutate code without trampling each other. Spec: specs/session-branches.md",
  ac: [
    "Manual review: specs/session-branches.md covers interim worktrees and product phases",
    "Milestone recorded when child issues exist",
  ],
}

const epicOp = await eng.createIssue(epicSpec.title, {
  priority: epicSpec.priority,
  labels: epicSpec.labels,
  description: epicSpec.description,
  criteria: epicSpec.ac?.map((description) => ({ description })),
})
const epicId = epicOp.vcs?.issueId as string
console.log("epic", epicId)

const children: Spec[] = [
  {
    title: "Interim: git worktree lanes per active issue",
    priority: "high",
    labels: ["agent", "worktree", "ops", "session-branches"],
    description:
      "Stopgap before automation: one git worktree + trellis issue start per writing agent; lane 0 on dev merges and runs dev server. See specs/session-branches.md § concurrent agent lanes (interim).",
    ac: [
      "Lane manifest documented (.agent/plans/ or issue bodies)",
      "Worktrees live under Packages/turtlecode/.worktrees/",
    ],
    parentId: epicId,
  },
  {
    title: "Session branch metadata on work sessions (phase 1)",
    priority: "high",
    labels: ["agent", "sessions", "opencode", "session-branches"],
    description:
      "Record branchName, branchStatus, baseBranch, baseRevision, mergeTarget, linkedIssueID on sessions without changing write behavior.",
    parentId: epicId,
  },
  {
    title: "Create Trellis branch on first write in work session (phase 2)",
    priority: "high",
    labels: ["agent", "sessions", "trellis", "session-branches"],
    description: "Non-main work session spawns issue/<id> or session/<id> when first mutating files.",
    parentId: epicId,
  },
  {
    title: "Inline session finish prompt — review / merge / archive (phase 3)",
    priority: "medium",
    labels: ["agent", "sessions", "ui", "session-branches"],
    description: "When agent idles after changes, prompt Continue / Review / Merge / Archive.",
    parentId: epicId,
  },
  {
    title: "Happy-path merge work session branch into main (phase 4)",
    priority: "medium",
    labels: ["agent", "sessions", "trellis", "merge", "session-branches"],
    description: "No-conflict merge into dev, mark session merged, archive branch metadata.",
    parentId: epicId,
  },
  {
    title: "Session merge conflict and stale-branch UX (phase 5)",
    priority: "medium",
    labels: ["agent", "sessions", "merge", "session-branches"],
    description: "Stale detection, text conflicts, acceptance reruns, semantic conflict summaries.",
    parentId: epicId,
  },
  {
    title: "Federated parent Trellis graphs (deferred)",
    priority: "low",
    labels: ["trellis", "federation", "deferred", "session-branches"],
    description:
      "Optional read-only parent graph overlay. Deferred until cross-repo issue backlog exists. Spec § federated parent graphs.",
    ac: ["Manual review: federation remains deferred in spec"],
    parentId: epicId,
  },
]

for (const child of children) {
  const op = await eng.createIssue(child.title, {
    priority: child.priority,
    labels: child.labels,
    description: child.description,
    parentId: child.parentId,
    criteria: child.ac?.map((description) => ({ description })),
  })
  console.log("child", op.vcs?.issueId, child.title)
}

// Remove mistaken test issue if present
const test = eng.listIssues().find((i) => i.title === "TEST delete me")
if (test) {
  console.log("(leftover test issue", test.id, "— close manually if unwanted)")
}

const milestone = eng.createMilestone(
  "Session-branches spec tracked in Trellis: epic TRL-* with interim worktree ops and implementation phases 1–5; federation deferred.",
)
console.log("milestone", milestone.vcs?.milestoneId ?? milestone.hash)

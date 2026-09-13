export type EntityShellClass = "actor" | "container" | "temporal" | "document"

const ACTOR = new Set([
  "person",
  "organization",
  "role",
  "developer",
  "agent",
  "contact",
  "vendor",
  "user",
])

const CONTAINER = new Set([
  "project",
  "epic",
  "roadmap",
  "cycle",
  "folder",
  "collection",
  "goal",
  "org",
  "brand",
])

const TEMPORAL = new Set([
  "issue",
  "workunit",
  "task",
  "event",
  "milestone",
  "decision",
  "phase",
  "checkpoint",
])

export function entityShellClass(type: string | undefined): EntityShellClass {
  const key = (type ?? "entity").toLowerCase()
  if (ACTOR.has(key)) return "actor"
  if (CONTAINER.has(key)) return "container"
  if (TEMPORAL.has(key)) return "temporal"
  return "document"
}

export const SHELL_SIZE: Record<EntityShellClass, { w: number; h: number }> = {
  actor: { w: 700, h: 580 },
  container: { w: 960, h: 760 },
  temporal: { w: 800, h: 680 },
  document: { w: 880, h: 720 },
}

export const SHELL_ACCENT: Record<EntityShellClass, string> = {
  actor: "#38bdf8",
  container: "#a78bfa",
  temporal: "#60a5fa",
  document: "#34d399",
}

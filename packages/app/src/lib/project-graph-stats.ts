export type ProjectStat = { label: string; value: number }

const ORDER = [
  "file",
  "directory",
  "issue",
  "agent",
  "workunit",
  "cycle",
  "epic",
  "roadmap",
  "memory",
  "sprite",
  "suggestion",
  "mcp",
] as const

export function projectGraphStats(
  nodes: ReadonlyArray<{ type: string }>,
  hiddenNodes = 0,
): ProjectStat[] {
  const counts: Record<string, number> = {}
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1
  }
  const out = ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => ({
    label: key === "directory" ? "dirs" : key === "workunit" ? "tasks" : `${key}s`,
    value: counts[key] ?? 0,
  }))
  if (hiddenNodes > 0) out.push({ label: "hidden", value: hiddenNodes })
  return out
}

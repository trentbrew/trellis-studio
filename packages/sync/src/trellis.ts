import { $ } from "bun"
import type { TrellisIssue } from "./types"

export async function loadIssues(statuses: string[], path?: string): Promise<TrellisIssue[]> {
  const args = ["issue", "list", "--json", ...statuses.flatMap((s) => ["--status", s])]
  if (path) args.push("--path", path)
  const { stdout } = await $`trellis ${args}`.quiet()
  const data = JSON.parse(stdout.toString()) as { issues: TrellisIssue[] }
  return data.issues
}

export async function issueDescription(id: string, path?: string): Promise<string> {
  const args = ["issue", "show", id]
  if (path) args.push("--path", path)
  const { stdout } = await $`trellis ${args}`.quiet()
  const lines = stdout.toString().split("\n").slice(1)
  const end = lines.findIndex((l) => l.includes("Status:"))
  return lines
    .slice(0, end < 0 ? lines.length : end)
    .join("\n")
    .trim()
}

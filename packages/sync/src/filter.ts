import type { TrellisIssue } from "./types"

export type Filter = {
  includeLabels: string[]
  excludeLabels: string[]
  excludeIds: Set<string>
}

export const JUNK: RegExp[] = [/^just a test/i, /^\s*$/]

export type FilterResult = {
  keep: TrellisIssue[]
  drop: { issue: TrellisIssue; why: string }[]
}

export function applyFilter(issues: TrellisIssue[], filter: Filter): FilterResult {
  const keep: TrellisIssue[] = []
  const drop: { issue: TrellisIssue; why: string }[] = []
  for (const issue of issues) {
    if (filter.excludeIds.has(issue.id)) {
      drop.push({ issue, why: "excluded by id" })
      continue
    }
    if (JUNK.some((re) => re.test(issue.title))) {
      drop.push({ issue, why: "junk title" })
      continue
    }
    const hit = issue.labels.find((l) => filter.excludeLabels.includes(l))
    if (hit) {
      drop.push({ issue, why: `label ${hit}` })
      continue
    }
    if (filter.includeLabels.length > 0 && !issue.labels.some((l) => filter.includeLabels.includes(l))) {
      drop.push({ issue, why: "label not in allowlist" })
      continue
    }
    keep.push(issue)
  }
  return { keep, drop }
}

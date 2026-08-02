import { loadIssues, issueDescription } from "./trellis"
import { applyFilter, type Filter } from "./filter"
import { loadMap, saveMap, type IssueMap } from "./map"
import type { TrackerAdapter } from "./types"

export type ExportOpts = {
  adapter: TrackerAdapter
  statuses: string[]
  filter: Filter
  path?: string
  mapDir?: string
  project?: string
  force?: boolean
  load?: typeof loadIssues
  describe?: typeof issueDescription
}

export type ExportResult = {
  created: string[]
  existing: string[]
  dropped: { id: string; why: string }[]
  total: number
}

export async function exportTo(opts: ExportOpts): Promise<ExportResult> {
  const load = opts.load ?? loadIssues
  const describe = opts.describe ?? issueDescription
  const issues = await load(opts.statuses, opts.path)
  const { keep, drop } = applyFilter(issues, opts.filter)
  const map = loadMap(opts.adapter.name, opts.mapDir, opts.project)
  const created: string[] = []
  const existing: string[] = []

  for (const issue of keep) {
    if (map[issue.id] && !opts.force) {
      existing.push(`${issue.id} -> ${map[issue.id].url}`)
      continue
    }
    const desc = await describe(issue.id, opts.path)
    const ref = await opts.adapter.create(issue, desc)
    map[issue.id] = ref
    created.push(`${issue.id} -> ${ref.url}`)
  }

  saveMap(opts.adapter.name, map, opts.mapDir, opts.project)
  return { created, existing, dropped: drop.map((d) => ({ id: d.issue.id, why: d.why })), total: issues.length }
}

import { basename, resolve } from "path"
import { exportTo } from "./engine"
import { loadIssues } from "./trellis"
import { applyFilter, type Filter } from "./filter"
import { loadMap } from "./map"
import { loadConfig, projectConfig, type AdapterConfig } from "./config"
import { GitHubAdapter } from "./adapters/github"

const argv = process.argv.slice(2)

function flag(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`)
  return idx >= 0 ? argv[idx + 1] : undefined
}

function has(name: string): boolean {
  return argv.includes(`--${name}`)
}

function split(value: string | undefined): string[] {
  return (value ?? "").split(",").filter(Boolean)
}

const adapterName = flag("adapter") ?? "github"
const config = loadConfig()
const path = flag("path") ?? process.cwd()
const project = flag("project") ?? projectConfig(config, adapterName).project ?? basename(resolve(path))
const cfg: AdapterConfig = projectConfig(config, adapterName, project)

const repo = flag("repo") ?? cfg.repo ?? "trentbrew/trellis-studio"
const statuses = split(flag("status") ?? cfg.statuses?.join(",") ?? "backlog")
const includeLabels = split(flag("include-labels") ?? cfg.includeLabels?.join(","))
const excludeLabels = split(flag("exclude-labels") ?? cfg.excludeLabels?.join(","))
const excludeIds = new Set(split(flag("exclude") ?? cfg.exclude?.join(",")))
const attachLabels = has("labels") || cfg.labels === true
const apply = has("apply")
const force = has("force")

const filter: Filter = { includeLabels, excludeLabels, excludeIds }

function adapter() {
  if (adapterName !== "github") {
    console.error(`unknown adapter: ${adapterName} (available: github)`)
    process.exit(1)
  }
  return new GitHubAdapter(repo, attachLabels)
}

async function dryRun() {
  const issues = await loadIssues(statuses, path)
  const { keep, drop } = applyFilter(issues, filter)
  const map = loadMap(adapterName, undefined, project)
  const existing = keep.filter((i) => map[i.id])
  console.log(
    `Trellis issues: ${issues.length} | keep: ${keep.length} | drop: ${drop.length} | already exported: ${existing.length}`,
  )
  console.log()
  for (const { issue, why } of drop) console.log(`  drop  ${issue.id} [${issue.priority}] ${issue.title}  (${why})`)
  console.log()
  for (const issue of keep) {
    const done = map[issue.id] ? ` #${map[issue.id].id}` : ""
    console.log(
      `  keep  ${issue.id} [${issue.priority}] ${issue.labels.join(",") || "-"} ${issue.title} (${issue.criteria.length} AC)${done}`,
    )
  }
  console.log()
  console.log(`Project: ${project} | Repo: ${repo} | Run with --apply to create GitHub issues.`)
}

if (!apply) {
  await dryRun()
} else {
  const result = await exportTo({ adapter: adapter(), statuses, filter, path, project, force })
  for (const line of result.created) console.log(`create ${line}`)
  for (const line of result.existing) console.log(`skip  ${line}`)
  for (const { id, why } of result.dropped) console.log(`drop  ${id}  (${why})`)
  console.log(`\nCreated ${result.created.length}; skipped ${result.existing.length}; dropped ${result.dropped.length}.`)
}

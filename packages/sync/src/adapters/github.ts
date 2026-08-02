import { $ } from "bun"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { ExternalRef, TrackerAdapter, TrellisIssue } from "../types"

export function renderBody(issue: TrellisIssue, description?: string): string {
  const parts: string[] = []
  if (description) parts.push(description)
  const checks = issue.criteria.map((c) => `- [${c.status === "passed" ? "x" : " "}] ${c.description}`)
  if (checks.length) parts.push(`## Acceptance criteria\n\n${checks.join("\n")}`)
  parts.push(`<!-- trellis-id: ${issue.id} -->`)
  return parts.join("\n\n")
}

function bodyFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "trellis-sync-"))
  const p = join(dir, "body.md")
  writeFileSync(p, text)
  return p
}

export class GitHubAdapter implements TrackerAdapter {
  name = "github"

  constructor(
    private repo: string,
    private labels = false,
  ) {}

  private async ensureLabels(labels: string[]) {
    for (const label of labels) {
      await $`gh label create --repo ${this.repo} ${label}`.quiet().nothrow()
    }
  }

  async create(issue: TrellisIssue, description?: string): Promise<ExternalRef> {
    const p = bodyFile(renderBody(issue, description))
    try {
      if (this.labels && issue.labels.length) await this.ensureLabels(issue.labels)
      const args = ["issue", "create", "--repo", this.repo, "--title", issue.title, "--body-file", p]
      if (this.labels) for (const label of issue.labels) args.push("--label", label)
      const out = await $`gh ${args}`.quiet()
      const url = out.stdout.toString().trim()
      return { id: url.split("/").pop()!, url }
    } finally {
      rmSync(p, { force: true })
    }
  }

  async update(id: string, issue: TrellisIssue, description?: string) {
    const p = bodyFile(renderBody(issue, description))
    try {
      await $`gh issue edit --repo ${this.repo} ${id} --title ${issue.title} --body-file ${p}`.quiet()
    } finally {
      rmSync(p, { force: true })
    }
  }

  async close(id: string) {
    await $`gh issue close --repo ${this.repo} ${id}`.quiet()
  }

  async comment(id: string, text: string) {
    const p = bodyFile(text)
    try {
      await $`gh issue comment --repo ${this.repo} ${id} --body-file ${p}`.quiet()
    } finally {
      rmSync(p, { force: true })
    }
  }
}

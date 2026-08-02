import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { exportTo } from "../src/engine"
import type { Filter } from "../src/filter"
import type { ExternalRef, TrackerAdapter, TrellisIssue } from "../src/types"

const empty: Filter = { includeLabels: [], excludeLabels: [], excludeIds: new Set() }

const issue = (id: string): TrellisIssue => ({
  id,
  title: id,
  status: "backlog",
  priority: "medium",
  labels: [],
  criteria: [],
})

function adapter(created: string[]): TrackerAdapter {
  return {
    name: "github",
    async create(i: TrellisIssue): Promise<ExternalRef> {
      created.push(i.id)
      return { id: i.id, url: `https://example.com/${i.id}` }
    },
    async update() {},
    async close() {},
    async comment() {},
  }
}

test("creates unmapped issues and skips already-exported ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-engine-"))
  try {
    const created: string[] = []
    const opts = {
      adapter: adapter(created),
      statuses: ["backlog"],
      filter: empty,
      mapDir: dir,
      load: async () => [issue("TRL-1"), issue("TRL-2")],
      describe: async () => "desc",
    }

    const first = await exportTo(opts)
    expect(created).toEqual(["TRL-1", "TRL-2"])
    expect(first.created.length).toBe(2)

    const second = await exportTo(opts)
    expect(second.created.length).toBe(0)
    expect(second.existing.length).toBe(2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("reports dropped issues from the filter", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-engine-"))
  try {
    const result = await exportTo({
      adapter: adapter([]),
      statuses: ["backlog"],
      filter: { includeLabels: [], excludeLabels: ["agent"], excludeIds: new Set<string>() },
      mapDir: dir,
      load: async () => [issue("TRL-1"), { ...issue("TRL-2"), labels: ["agent"] }],
      describe: async () => "",
    })
    expect(result.dropped.map((d) => d.id)).toEqual(["TRL-2"])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

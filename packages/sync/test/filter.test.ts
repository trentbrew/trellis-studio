import { describe, expect, test } from "bun:test"
import { applyFilter, type Filter } from "../src/filter"
import type { TrellisIssue } from "../src/types"

const issue = (id: string, over: Partial<TrellisIssue> = {}): TrellisIssue => ({
  id,
  title: id,
  status: "backlog",
  priority: "medium",
  labels: [],
  criteria: [],
  ...over,
})

const empty: Filter = { includeLabels: [], excludeLabels: [], excludeIds: new Set() }

test("keeps everything with an empty filter", () => {
  const { keep, drop } = applyFilter([issue("TRL-1"), issue("TRL-2")], empty)
  expect(keep.length).toBe(2)
  expect(drop.length).toBe(0)
})

test("drops junk titles", () => {
  const { keep } = applyFilter([issue("TRL-12", { title: "Just a test" })], empty)
  expect(keep.length).toBe(0)
})

test("drops excluded ids and labels", () => {
  const f: Filter = { includeLabels: [], excludeLabels: ["agent"], excludeIds: new Set(["TRL-9"]) }
  const { keep, drop } = applyFilter(
    [issue("TRL-9"), issue("TRL-10", { labels: ["agent"] }), issue("TRL-11")],
    f,
  )
  expect(keep.map((i) => i.id)).toEqual(["TRL-11"])
  expect(drop.map((d) => d.why)).toContain("excluded by id")
  expect(drop.map((d) => d.why)).toContain("label agent")
})

test("include-labels acts as an allowlist", () => {
  const f: Filter = { includeLabels: ["ui"], excludeLabels: [], excludeIds: new Set() }
  const { keep } = applyFilter([issue("TRL-1", { labels: ["ui"] }), issue("TRL-2")], f)
  expect(keep.map((i) => i.id)).toEqual(["TRL-1"])
})

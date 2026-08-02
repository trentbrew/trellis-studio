import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import path from "path"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

// ---------------------------------------------------------------------------
// No-engine guard tests (no tmpdir needed)
// ---------------------------------------------------------------------------

describe("Trellis namespace — no engine", () => {
  test("status returns undefined", () => {
    expect(Trellis.status("/nonexistent")).toBeUndefined()
  })

  test("stats returns undefined", () => {
    expect(Trellis.stats("/nonexistent")).toBeUndefined()
  })

  test("issues returns empty array", () => {
    expect(Trellis.issues("/nonexistent")).toEqual([])
  })

  test("getIssue returns undefined", async () => {
    expect(await Trellis.getIssue("TRL-1", "/nonexistent")).toBeUndefined()
  })

  test("files returns empty array", () => {
    expect(Trellis.files("/nonexistent")).toEqual([])
  })

  test("ops returns empty array", () => {
    expect(Trellis.ops("/nonexistent")).toEqual([])
  })

  test("decisions returns empty array", () => {
    expect(Trellis.decisions("/nonexistent")).toEqual([])
  })

  test("chain returns empty array", () => {
    expect(Trellis.chain("entity", "/nonexistent")).toEqual([])
  })

  test("branches returns empty array", () => {
    expect(Trellis.branches("/nonexistent")).toEqual([])
  })

  test("currentBranch returns undefined", () => {
    expect(Trellis.currentBranch("/nonexistent")).toBeUndefined()
  })

  test("milestones returns empty array", () => {
    expect(Trellis.milestones("/nonexistent")).toEqual([])
  })

  test("gardenList returns empty array", () => {
    expect(Trellis.gardenList("/nonexistent")).toEqual([])
  })

  test("gardenStats returns undefined", () => {
    expect(Trellis.gardenStats("/nonexistent")).toBeUndefined()
  })

  test("gardenRevive returns undefined", () => {
    expect(Trellis.gardenRevive("id", "/nonexistent")).toBeUndefined()
  })

  test("createBranch returns undefined", async () => {
    expect(await Trellis.createBranch("test", "/nonexistent")).toBeUndefined()
  })

  test("switchBranch returns undefined", () => {
    expect(Trellis.switchBranch("test", "/nonexistent")).toBeUndefined()
  })

  test("deleteBranch returns undefined", async () => {
    expect(await Trellis.deleteBranch("test", "/nonexistent")).toBeUndefined()
  })

  test("milestone returns undefined", async () => {
    expect(await Trellis.milestone("msg", undefined, "/nonexistent")).toBeUndefined()
  })

  test("createIssue returns undefined", async () => {
    expect(await Trellis.createIssue("title", undefined, "/nonexistent")).toBeUndefined()
  })

  test("updateIssue returns undefined", async () => {
    expect(await Trellis.updateIssue("id", { status: "closed" }, "/nonexistent")).toBeUndefined()
  })

  test("startIssue returns undefined", async () => {
    expect(await Trellis.startIssue("id", "/nonexistent")).toBeUndefined()
  })

  test("pauseIssue returns undefined", async () => {
    expect(await Trellis.pauseIssue("id", undefined, "/nonexistent")).toBeUndefined()
  })

  test("resumeIssue returns undefined", async () => {
    expect(await Trellis.resumeIssue("id", "/nonexistent")).toBeUndefined()
  })

  test("triageIssue returns undefined", async () => {
    expect(await Trellis.triageIssue("id", "/nonexistent")).toBeUndefined()
  })

  test("closeIssue returns undefined", async () => {
    expect(await Trellis.closeIssue("id", undefined, "/nonexistent")).toBeUndefined()
  })

  test("reopenIssue returns undefined", async () => {
    expect(await Trellis.reopenIssue("id", "/nonexistent")).toBeUndefined()
  })

  test("assignIssue returns undefined", async () => {
    expect(await Trellis.assignIssue("id", "agent", "/nonexistent")).toBeUndefined()
  })

  test("blockIssue returns undefined", async () => {
    expect(await Trellis.blockIssue("id", "other", "/nonexistent")).toBeUndefined()
  })

  test("unblockIssue returns undefined", async () => {
    expect(await Trellis.unblockIssue("id", "other", "/nonexistent")).toBeUndefined()
  })

  test("addCriterion returns undefined", async () => {
    expect(await Trellis.addCriterion("id", "desc", undefined, "/nonexistent")).toBeUndefined()
  })

  test("checkIssue returns undefined on bad dir", async () => {
    expect(await Trellis.checkIssue("id", "/nonexistent")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// With engine — init + basic queries
// ---------------------------------------------------------------------------

describe("Trellis namespace — with engine", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }

  beforeAll(async () => {
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({
      directory: dir,
      fn: () => Trellis.init(dir),
    })
  })

  afterAll(async () => {
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("status returns branch info", () => {
    const s = Trellis.status(dir)
    expect(s).toBeDefined()
    expect(s!.branch).toBeString()
    expect(s!.totalOps).toBeNumber()
    expect(s!.trackedFiles).toBeNumber()
  })

  test("stats returns graph stats", () => {
    const s = Trellis.stats(dir)
    expect(s).toBeDefined()
    expect(s!.issueCount).toBeNumber()
    expect(s!.activeIssues).toBeNumber()
  })

  test("issues returns array", () => {
    const list = Trellis.issues(dir)
    expect(Array.isArray(list)).toBe(true)
  })

  test("branches returns at least one branch", () => {
    const list = Trellis.branches(dir)
    expect(list.length).toBeGreaterThanOrEqual(1)
    const current = list.find((b) => b.isCurrent)
    expect(current).toBeDefined()
    expect(current!.name).toBeString()
  })

  test("currentBranch returns a string", () => {
    const b = Trellis.currentBranch(dir)
    expect(b).toBeString()
  })

  test("milestones returns array", () => {
    const list = Trellis.milestones(dir)
    expect(Array.isArray(list)).toBe(true)
  })

  test("ops returns array", () => {
    const list = Trellis.ops(dir)
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].kind).toBeString()
    expect(list[0].hash).toBeString()
  })

  test("files returns tracked files", () => {
    const list = Trellis.files(dir)
    expect(Array.isArray(list)).toBe(true)
  })

  test("decisions returns array", () => {
    const list = Trellis.decisions(dir)
    expect(Array.isArray(list)).toBe(true)
  })

  test("gardenList returns array", () => {
    const list = Trellis.gardenList(dir)
    expect(Array.isArray(list)).toBe(true)
  })

  test("gardenStats returns stats object", () => {
    const s = Trellis.gardenStats(dir)
    expect(s).toBeDefined()
    expect(s!.total).toBeNumber()
    expect(s!.abandoned).toBeNumber()
    expect(s!.draft).toBeNumber()
    expect(s!.revived).toBeNumber()
  })

  test("createIssue + getIssue round-trip", async () => {
    const op = await Instance.provide({
      directory: dir,
      fn: () => Trellis.createIssue("Test issue", { priority: "medium" }, dir),
    })
    expect(op).toBeDefined()

    const list = Trellis.issues(dir)
    const found = list.find((i: { title: string }) => i.title === "Test issue")
    expect(found).toBeDefined()
    expect(found!.status).toBe("backlog")
    expect(found!.priority).toBe("medium")
  })

  test("milestone creation works", async () => {
    const op = await Trellis.milestone("test checkpoint", undefined, dir)
    expect(op).toBeDefined()
    const list = Trellis.milestones(dir)
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  test("createBranch + branches round-trip", async () => {
    const op = await Trellis.createBranch("test-branch", dir)
    expect(op).toBeDefined()
    const list = Trellis.branches(dir)
    const found = list.find((b: { name: string }) => b.name === "test-branch")
    expect(found).toBeDefined()
  })

  test("switchBranch works", () => {
    const result = Trellis.switchBranch("test-branch", dir)
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)
    expect(Trellis.currentBranch(dir)).toBe("test-branch")

    // Switch back
    Trellis.switchBranch("main", dir)
  })
})

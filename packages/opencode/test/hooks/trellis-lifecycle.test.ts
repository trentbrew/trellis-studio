import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import { planFirstNudge, endCheckpoint } from "../../src/hooks/trellis-lifecycle"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("trellis-lifecycle", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }
  const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
  const watch = proto.watch

  beforeAll(async () => {
    proto.watch = () => undefined
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir, { create: true }) })
  })

  afterAll(async () => {
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("plan-first nudge fires when the session has no issue-bound lane", async () => {
    const r = await Instance.provide({
      directory: dir,
      fn: () =>
        planFirstNudge({ sessionID: "sess_noissue", directory: dir }),
    })
    expect(r.continue).toBe(true)
    expect(r.nudge).toBeTruthy()
  })

  test("plan-first nudge is silent when the lane carries an issue", async () => {
    const r = await Instance.provide({
      directory: dir,
      fn: async () => {
        const eng = Trellis.engine(dir)!
        const issue = await eng.createIssue({ title: "lifecycle test", priority: "low" })
        const lane = await eng.createLane({
          issueId: issue.vcs.issueId,
          sessionId: "sess_hasissue",
        })
        await eng.enterLane(lane.id)
        return planFirstNudge({ sessionID: "sess_hasissue", directory: dir })
      },
    })
    expect(r.continue).toBe(true)
    expect(r.nudge).toBeUndefined()
  })

  test("whereami banner surfaces a re-entry checkpoint before the plan-first nudge", async () => {
    const r = await Instance.provide({
      directory: dir,
      fn: async () => {
        const eng = Trellis.engine(dir)!
        if (eng.getActiveLaneId()) await eng.leaveLane()
        const issue = await eng.createIssue({ title: "whereami", priority: "low" })
        const lane = await eng.createLane({ issueId: issue.vcs.issueId, sessionId: "sess_resume" })
        await eng.enterLane(lane.id)
        eng.writeReentryCheckpoint()
        return planFirstNudge({ sessionID: "sess_resume", directory: dir })
      },
    })
    expect(r.continue).toBe(true)
    expect(r.nudge).toContain("Resumed from checkpoint")
    expect(r.nudge).toContain("Run /lane-status")
  })

  test("session end writes a re-entry checkpoint with the lane issue", async () => {
    const r = await Instance.provide({
      directory: dir,
      fn: async () => {
        const eng = Trellis.engine(dir)!
        if (eng.getActiveLaneId()) await eng.leaveLane()
        const issue = await eng.createIssue({ title: "checkpoint", priority: "low" })
        const lane = await eng.createLane({ issueId: issue.vcs.issueId, sessionId: "sess_end" })
        await eng.enterLane(lane.id)
        return endCheckpoint({ sessionID: "sess_end", directory: dir })
      },
    })
    expect(r.continue).toBe(true)
    const cpPath = join(dir, ".trellis", "reentry-checkpoint.json")
    expect(existsSync(cpPath)).toBe(true)
    const cp = JSON.parse(readFileSync(cpPath, "utf-8")) as { issueIds: string[] }
    expect(cp.issueIds.length).toBeGreaterThanOrEqual(1)
  })
})

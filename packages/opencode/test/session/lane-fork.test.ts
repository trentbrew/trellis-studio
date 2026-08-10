import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { SessionLane } from "../../src/session/lane"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("session lane binding (W5)", () => {
  let dir: string | undefined

  afterEach(() => {
    if (!dir) return
    Trellis.dispose(dir)
    dir = undefined
  })

  test("create session binds a trellis lane", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => {
        const session = await Session.create({})
        expect(session.laneID).toMatch(/^lane-/)
        const eng = Trellis.engine(dir!)!
        expect(eng.getActiveLaneId()).toBe(session.laneID)
        await Session.remove(session.id)
      },
    })
  })

  test("fork session creates child lane from parent head", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => {
        const parent = await Session.create({})
        expect(parent.laneID).toBeTruthy()

        const eng = Trellis.engine(dir!)!
        await eng.recordDecision({ toolName: "test.session", context: "parent lane op" })

        const child = await Session.fork({ sessionID: parent.id })
        expect(child.parentID).toBe(parent.id)
        expect(child.laneID).toBeTruthy()
        expect(child.laneID).not.toBe(parent.laneID)
        expect(child.laneForkKind).toBe("child")
        expect(child.parentLaneID).toBe(parent.laneID)
        expect(eng.getActiveLaneId()).toBe(child.laneID)

        const meta = eng
          .listLanes()
          .find((lane: { id: string; forkKind?: string; virtualBaseOpHash?: string }) => lane.id === child.laneID)
        expect(meta?.forkKind).toBe("child")
        expect(meta?.virtualBaseOpHash).toBeTruthy()

        await Session.remove(child.id)
        await Session.remove(parent.id)
      },
    })
  })

  test("shell env includes TRELLIS_LANE_ID when session has lane", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => {
        const session = await Session.create({})
        expect(session.laneID).toBeDefined()
        const laneID = session.laneID!
        const env = SessionLane.shellEnv({ directory: dir!, laneID })
        expect(env.TRELLIS_LANE_ID).toBe(laneID)
        expect(env.TRELLIS_REPO_ROOT).toBe(dir!)
        await Session.remove(session.id)
      },
    })
  })

  test("activateLane switches trellis engine between session tabs", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => {
        const parent = await Session.create({})
        const child = await Session.fork({ sessionID: parent.id })
        const eng = Trellis.engine(dir!)!

        expect(eng.getActiveLaneId()).toBe(child.laneID)

        await Session.activateLane(parent.id)
        expect(eng.getActiveLaneId()).toBe(parent.laneID)

        await Session.activateLane(child.id)
        expect(eng.getActiveLaneId()).toBe(child.laneID)

        await Session.deactivateLane()
        expect(eng.getActiveLaneId()).toBeUndefined()

        await Session.remove(child.id)
        await Session.remove(parent.id)
      },
    })
  })

  test("concurrent activateLane calls do not throw", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => {
        await Trellis.init(dir, { create: true })
        const session = await Session.create({})
        const eng = Trellis.engine(dir!)!

        const results = await Promise.all([
          Session.activateLane(session.id),
          Session.activateLane(session.id),
          Session.activateLane(session.id),
        ])

        const laneID = results[0]?.laneID
        expect(laneID).toBeTruthy()
        expect(eng.getActiveLaneId()).toBe(laneID)
        await Session.remove(session.id)
      },
    })
  })
})

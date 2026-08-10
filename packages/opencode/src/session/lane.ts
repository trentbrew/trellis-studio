import { TrellisVcsEngine } from "trellis"
import { listLaneMetas } from "trellis/vcs"
import { join } from "path"
import { Instance } from "../project/instance"
import { Trellis } from "../trellis"
import type { SessionID } from "./schema"

export namespace SessionLane {
  export type ForkKind = "sibling" | "child"

  export type SessionRef = {
    id: SessionID
    directory: string
    laneID?: string
  }

  export type Binding = {
    laneID: string
    parentLaneID?: string
    forkKind?: ForkKind
    unpromotedParent?: boolean
  }

  function engine(dir: string): TrellisVcsEngine | undefined {
    return Trellis.engine(dir)
  }

  function lanes(dir: string) {
    return listLaneMetas(join(dir, ".trellis"))
  }

  const tails = new Map<string, Promise<unknown>>()

  function serial<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prev = tails.get(dir) ?? Promise.resolve()
    const run = prev.catch(() => { }).then(fn)
    tails.set(dir, run)
    return run.finally(() => {
      if (tails.get(dir) === run) tails.delete(dir)
    })
  }

  export async function resolve(input: { id: SessionID; directory: string; laneID?: string }) {
    if (input.laneID) return input.laneID
    const match = lanes(input.directory).find((lane) => lane.sessionId === input.id && lane.status === "active")
    return match?.id
  }

  async function enter(eng: NonNullable<ReturnType<typeof engine>>, laneID: string) {
    if (eng.getActiveLaneId() === laneID) return
    if (eng.getActiveLaneId()) await eng.leaveLane()
    try {
      await eng.enterLane(laneID)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes(`Already in lane '${laneID}'`)) return
      throw err
    }
  }

  export async function ensure(input: { sessionID: SessionID; directory: string }): Promise<Binding | undefined> {
    await Trellis.init(input.directory)
    const eng = engine(input.directory)
    if (!eng) return undefined

    const existing = lanes(input.directory).find(
      (lane) => lane.sessionId === input.sessionID && lane.status === "active",
    )
    if (existing) {
      await enter(eng, existing.id)
      return { laneID: existing.id }
    }

    if (eng.getActiveLaneId()) await eng.leaveLane()

    const meta = await eng.createLane({ sessionId: input.sessionID })
    await enter(eng, meta.id)
    return { laneID: meta.id }
  }

  /**
   * Bind a session to its existing lane (re-attach on resume). Never creates or
   * enters a lane — new lanes require explicit activation (`Session.activateLane`
   * / desk affordance / issue start). Prevents ghost lanes for every chat session.
   */
  export async function bind(input: { sessionID: SessionID; directory: string }): Promise<Binding | undefined> {
    await Trellis.init(input.directory)
    const existing = lanes(input.directory).find(
      (lane) => lane.sessionId === input.sessionID && lane.status === "active",
    )
    return existing ? { laneID: existing.id } : undefined
  }

  export async function fork(input: {
    parent: SessionRef
    childSessionID: SessionID
    kind?: ForkKind
  }): Promise<Binding | undefined> {
    await Trellis.init(input.parent.directory)
    const eng = engine(input.parent.directory)
    if (!eng) return undefined

    let parentLaneID = input.parent.laneID ?? (await resolve(input.parent))
    if (!parentLaneID) {
      const created = await ensure({ sessionID: input.parent.id, directory: input.parent.directory })
      if (!created) return undefined
      parentLaneID = created.laneID
      await eng.leaveLane()
    }

    if (eng.getActiveLaneId()) await eng.leaveLane()

    const kind = input.kind ?? "child"
    const meta = await eng.forkLane(parentLaneID, {
      forkKind: kind,
      sessionId: input.childSessionID,
    })
    await eng.enterLane(meta.id)

    return {
      laneID: meta.id,
      parentLaneID,
      forkKind: kind,
      unpromotedParent: eng.getLaneOpCount(parentLaneID) > 0,
    }
  }

  export async function activate(session: { directory: string; laneID?: string }) {
    if (!session.laneID) return
    await Trellis.init(session.directory)
    const eng = engine(session.directory)
    if (!eng) return
    await enter(eng, session.laneID)
  }

  export async function activateForSession(input: {
    sessionID: SessionID
    directory: string
    laneID?: string
  }): Promise<Binding | undefined> {
    return serial(input.directory, async () => {
      await Trellis.init(input.directory)
      let laneID = input.laneID ?? (await resolve({ id: input.sessionID, directory: input.directory }))
      if (!laneID) {
        const binding = await ensure({ sessionID: input.sessionID, directory: input.directory })
        return binding
      }
      try {
        await activate({ directory: input.directory, laneID })
      } catch (err) {
        // Lane may have been deleted - create a new one
        console.warn(
          `[SessionLane] Failed to activate lane ${laneID}, creating new lane for session ${input.sessionID}`,
        )
        const binding = await ensure({ sessionID: input.sessionID, directory: input.directory })
        laneID = binding?.laneID
        if (!laneID) return undefined
        await activate({ directory: input.directory, laneID })
      }
      return { laneID }
    })
  }

  export async function deactivate(dir?: string) {
    const eng = engine(dir ?? Instance.directory)
    if (!eng?.getActiveLaneId()) return
    await eng.leaveLane()
  }

  export function shellEnv(input: { directory: string; laneID?: string }) {
    const env: Record<string, string> = {
      TRELLIS_REPO_ROOT: input.directory,
    }
    if (input.laneID) env.TRELLIS_LANE_ID = input.laneID
    return env
  }
}

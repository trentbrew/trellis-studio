import type { Plugin } from "@opencode-ai/plugin"
import { Session } from "../session"
import { SessionLane } from "../session/lane"
import { SessionID } from "../session/schema"

export const TrellisLanePlugin: Plugin = async () => {
  return {
    "shell.env": async (input, output) => {
      if (!input.sessionID) return
      const session = await Session.get(SessionID.make(input.sessionID)).catch(() => undefined)
      if (!session?.laneID) return
      Object.assign(output.env, SessionLane.shellEnv({ directory: session.directory, laneID: session.laneID }))
    },
  }
}

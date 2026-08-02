import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { TrellisEnforcement, TRELLIS_HOOK_METADATA_KEY } from "../hooks/trellis-enforcement"

type ActiveTurn = {
  userMessageID: string
  agent?: string
}

/** Tracks the active user turn per session for Trellis enforcement hooks. */
const activeTurn = new Map<string, ActiveTurn>()

export async function TrellisEnforcementPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.message": async (input, output) => {
      if (!input.messageID) return
      const synthetic = output.parts.some((part) => part.type === "text" && part.synthetic)
      if (synthetic && activeTurn.has(input.sessionID)) return
      activeTurn.set(input.sessionID, {
        userMessageID: input.messageID,
        agent: input.agent,
      })
    },

    "tool.execute.after": async (input, output) => {
      const turn = activeTurn.get(input.sessionID)
      if (!turn) return

      const result = TrellisEnforcement.onToolAfter(
        {
          sessionID: input.sessionID,
          agent: turn.agent,
          tool: input.tool,
          args: (input.args ?? {}) as Record<string, unknown>,
          userMessageID: turn.userMessageID,
        },
        {
          output: output.output,
          title: output.title,
          metadata: output.metadata,
        },
      )

      output.output = result.output
      if (result.hook) {
        output.metadata = {
          ...(output.metadata ?? {}),
          [TRELLIS_HOOK_METADATA_KEY]: result.hook,
        }
      }
    },
  }
}

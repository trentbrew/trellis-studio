import type { AgentRuntime, AgentPromptInput, AgentSessionRef } from "./runtime"
import { runClaudeAcpSpike } from "./acp-client"
import { sessionUpdateToParts } from "./acp-event-adapter"
import type { NormalizedPart } from "./types"

/**
 * Claude Code via ACP bridge (CC2 will replace spike-style one-shot prompt with persistent connection).
 */
export function createClaudeAcpRuntime(): AgentRuntime {
  const sessions = new Map<string, AgentSessionRef>()

  return {
    backend: "claude-acp",

    async createSession(input) {
      const id = crypto.randomUUID()
      const ref: AgentSessionRef = { id, backend: "claude-acp", cwd: input.cwd, title: input.title }
      sessions.set(id, ref)
      return ref
    },

    async prompt(input: AgentPromptInput) {
      const session = sessions.get(input.sessionId)
      if (!session) throw new Error(`Unknown Claude ACP session: ${input.sessionId}`)

      const result = await runClaudeAcpSpike({
        cwd: input.cwd,
        autoAcceptPermissions: true,
      })

      if (result.authRequired) {
        throw new Error(result.error ?? "Claude Code authentication required")
      }
      if (!result.ok) {
        throw new Error(result.error ?? "Claude ACP prompt failed")
      }

      // CC2: persistent ClientSideConnection + streaming subscribe()
      void input.text
    },

    async abort() {
      // CC2: conn.cancel()
    },

    subscribe() {
      return () => {}
    },

    async listSessions(input) {
      return [...sessions.values()].filter((s) => s.cwd === input.cwd)
    },
  }
}

/** One-shot prompt helper until CC2 persistent client exists. */
export async function claudeAcpPromptOnce(input: {
  cwd: string
  text: string
  onPart?: (part: NormalizedPart) => void
}) {
  const result = await runClaudeAcpSpike({ cwd: input.cwd, autoAcceptPermissions: true })
  if (result.authRequired) throw new Error(result.error ?? "auth required")
  if (!result.ok) throw new Error(result.error ?? "prompt failed")

  for (const raw of result.updates) {
    for (const part of sessionUpdateToParts(raw as Parameters<typeof sessionUpdateToParts>[0])) {
      input.onPart?.(part)
    }
  }
  return result
}

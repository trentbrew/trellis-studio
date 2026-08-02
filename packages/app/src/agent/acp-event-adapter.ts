import type { NormalizedPart } from "./types"

type SessionUpdateEnvelope = {
  sessionId?: string
  update?: {
    sessionUpdate?: string
    content?: { type?: string; text?: string }
    toolCallId?: string
    status?: string
    title?: string
    rawInput?: unknown
    [key: string]: unknown
  }
}

export function sessionUpdateToParts(envelope: SessionUpdateEnvelope): NormalizedPart[] {
  const update = envelope.update
  if (!update?.sessionUpdate) return []

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const text = update.content?.type === "text" ? update.content.text : undefined
      if (!text) return []
      return [{ kind: "text", role: "assistant", text, delta: true }]
    }
    case "agent_thought_chunk": {
      const text = update.content?.type === "text" ? update.content.text : undefined
      if (!text) return []
      return [{ kind: "thought", text, delta: true }]
    }
    case "tool_call_update": {
      const toolCallId = typeof update.toolCallId === "string" ? update.toolCallId : "unknown"
      const title = typeof update.title === "string" ? update.title : "tool"
      const status = normalizeToolStatus(update.status)
      return [
        {
          kind: "tool",
          toolCallId,
          status,
          title,
          rawInput: update.rawInput,
        },
      ]
    }
    case "plan":
      return [{ kind: "plan", payload: update }]
    default:
      return []
  }
}

function normalizeToolStatus(status: unknown): "pending" | "in_progress" | "completed" | "failed" {
  if (status === "pending") return "pending"
  if (status === "in_progress") return "in_progress"
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  return "in_progress"
}

/** Merge streaming text deltas into a single assistant string (for spike assertions). */
export function collectAssistantText(updates: ReadonlyArray<SessionUpdateEnvelope>): string {
  let out = ""
  for (const u of updates) {
    for (const part of sessionUpdateToParts(u)) {
      if (part.kind === "text" && part.role === "assistant") out += part.text
    }
  }
  return out
}

import type { AssistantMessage, Message, SessionStatus } from "@opencode-ai/sdk/v2/client"

const idle: SessionStatus = { type: "idle" }

const isPendingAssistant = (message: Message) => {
  if (message.role !== "assistant") return false
  const assistant = message as AssistantMessage
  if (assistant.error) return false
  return typeof assistant.time.completed !== "number"
}

/** True when the session is actively generating or waiting for a response. */
export function isSessionWorking(status: SessionStatus | undefined, messages: Message[] | undefined): boolean {
  const list = messages ?? []
  const pendingAssistant = list.findLast((message) => isPendingAssistant(message))
  if (pendingAssistant) return true

  const resolved = status ?? idle
  if (resolved.type === "idle") return false
  if (resolved.type === "retry") return true

  // status.type === "busy" — may be stale when SSE drops the idle event (common in cloud iframes)
  const lastUser = list.findLast((message) => message.role === "user")
  if (!lastUser) return true

  const lastAssistant = list.findLast((message) => message.role === "assistant")
  if (!lastAssistant) return true

  const assistantCreated = lastAssistant.time.created
  const userCreated = lastUser.time.created
  if (typeof assistantCreated !== "number" || typeof userCreated !== "number") return true

  // Latest assistant turn finished — trust message completion over stale busy status.
  return assistantCreated < userCreated
}

/** True when session_status is stale busy and should be reconciled from the server. */
export function isSessionStatusStale(status: SessionStatus | undefined, messages: Message[] | undefined): boolean {
  if ((status?.type ?? "idle") !== "busy") return false
  return !isSessionWorking(status, messages)
}

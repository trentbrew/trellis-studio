import type { AssistantMessage, Message, Part, SessionStatus, ToolPart } from "@opencode-ai/sdk/v2/client"
import { getFilename } from "@opencode-ai/util/path"

export type ActivityStep = {
  id: string
  label: string
  status: "done" | "active" | "error"
}

export type SessionActivitySnapshot = {
  primary: string
  secondary?: string
  detail?: string
  tone: "neutral" | "retry" | "error"
  elapsedMs?: number
  steps: ActivityStep[]
}

const idle: SessionStatus = { type: "idle" }

function isPendingAssistant(message: Message): message is AssistantMessage {
  if (message.role !== "assistant") return false
  if (message.error) return false
  return typeof message.time.completed !== "number"
}

function toolSubtitle(part: ToolPart): string | undefined {
  const input = part.state.input ?? {}
  const filePath = typeof input.filePath === "string" ? input.filePath : undefined
  const path = typeof input.path === "string" ? input.path : undefined
  const command = typeof input.command === "string" ? input.command : undefined
  const description = typeof input.description === "string" ? input.description : undefined
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined
  const query = typeof input.query === "string" ? input.query : undefined
  const url = typeof input.url === "string" ? input.url : undefined

  if (filePath) {
    const name = getFilename(filePath)
    if (filePath.endsWith(".whiteboard")) return `whiteboard · ${name.replace(/\.whiteboard$/, "")}`
    return name
  }
  if (path) return getFilename(path)
  if (command) return command.length > 72 ? `${command.slice(0, 72)}…` : command
  if (description) return description.length > 72 ? `${description.slice(0, 72)}…` : description
  if (pattern) return pattern
  if (query) return query.length > 72 ? `${query.slice(0, 72)}…` : query
  if (url) return url.length > 72 ? `${url.slice(0, 72)}…` : url
  return undefined
}

function toolLabel(part: ToolPart): string {
  if (part.state.status === "running" || part.state.status === "completed") {
    const title = part.state.title?.trim()
    if (title) return title
  }

  switch (part.tool) {
    case "read":
      return "Reading file"
    case "write":
      return "Writing file"
    case "edit":
      return "Editing file"
    case "apply_patch":
      return "Applying patch"
    case "bash":
      return "Running command"
    case "grep":
      return "Searching files"
    case "glob":
      return "Finding files"
    case "list":
      return "Listing directory"
    case "webfetch":
      return "Fetching URL"
    case "websearch":
      return "Searching web"
    case "codesearch":
      return "Searching code"
    case "whiteboard":
      return "Whiteboard"
    case "task":
      return "Running agent task"
    case "question":
      return "Waiting for your answer"
    case "skill":
      return "Running skill"
    default:
      return part.tool
  }
}

function stepLabel(part: ToolPart): string {
  const subtitle = toolSubtitle(part)
  const label = toolLabel(part)
  return subtitle ? `${label} · ${subtitle}` : label
}

function toolStart(part: ToolPart | undefined): number | undefined {
  if (!part) return undefined
  if (part.state.status === "pending") return undefined
  return part.state.time.start
}

function toolError(part: ToolPart | undefined): string | undefined {
  if (!part) return undefined
  if (part.state.status !== "error") return undefined
  return part.state.error
}

function reasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, "\n")
  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = atx[1].replace(/[*_~`]+/g, "").trim()
    if (value) return value
  }
  const trimmed = markdown.trim()
  if (trimmed.length > 0 && trimmed.length <= 80) return trimmed
  return undefined
}

function collectTurnParts(messages: Message[], partsByMessage: Record<string, Part[] | undefined>, userID: string) {
  const index = messages.findIndex((m) => m.id === userID)
  if (index < 0) return [] as Part[]

  const out: Part[] = []
  for (let i = index + 1; i < messages.length; i++) {
    const message = messages[i]
    if (!message) continue
    if (message.role === "user") break
    if (message.role !== "assistant") continue
    const parts = partsByMessage[message.id]
    if (parts) out.push(...parts)
  }
  return out
}

function retryDetail(status: Extract<SessionStatus, { type: "retry" }>, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((status.next - now) / 1000))
  const delay = seconds > 0 ? `Retry in ${seconds}s` : "Retrying now"
  const attempt = `Attempt ${status.attempt}`
  const message = status.message.length > 96 ? `${status.message.slice(0, 96)}…` : status.message
  return `${attempt} · ${delay} · ${message}`
}

function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, "").trim()
  try {
    const json = JSON.parse(text) as { message?: string; error?: { message?: string } }
    return json.error?.message ?? json.message ?? text
  } catch {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }
}

/** Derive a human-readable snapshot of what the agent is doing right now. */
export function deriveSessionActivitySnapshot(input: {
  status?: SessionStatus
  messages?: Message[]
  partsByMessage?: Record<string, Part[] | undefined>
  now?: number
}): SessionActivitySnapshot | undefined {
  const messages = input.messages ?? []
  const partsByMessage = input.partsByMessage ?? {}
  const status = input.status ?? idle
  const now = input.now ?? Date.now()

  const pending = messages.findLast(isPendingAssistant)
  const pendingUserID = pending?.parentID
  const turnParts = pendingUserID ? collectTurnParts(messages, partsByMessage, pendingUserID) : []

  const toolParts = turnParts.filter((part): part is ToolPart => part.type === "tool")
  const activeTools = toolParts.filter((part) => part.state.status === "pending" || part.state.status === "running")
  const erroredTools = toolParts.filter((part) => part.state.status === "error")
  const completedTools = toolParts.filter((part) => part.state.status === "completed")

  const steps: ActivityStep[] = [
    ...completedTools.slice(-4).map((part) => ({ id: part.id, label: stepLabel(part), status: "done" as const })),
    ...activeTools.map((part) => ({ id: part.id, label: stepLabel(part), status: "active" as const })),
    ...erroredTools.slice(-2).map((part) => ({
      id: part.id,
      label: `${stepLabel(part)} failed`,
      status: "error" as const,
    })),
  ]

  const startedAt = pending?.time.created ?? toolStart(activeTools[0])
  const elapsedMs = typeof startedAt === "number" ? Math.max(0, now - startedAt) : undefined

  if (status.type === "retry") {
    return {
      primary: "Backing off before retry",
      secondary: activeTools[0] ? stepLabel(activeTools[0]) : undefined,
      detail: retryDetail(status, now),
      tone: "retry",
      elapsedMs,
      steps,
    }
  }

  const assistantError = messages.findLast(
    (message): message is AssistantMessage =>
      message.role === "assistant" &&
      !!message.error &&
      message.error.name !== "MessageAbortedError" &&
      typeof message.time.completed !== "number",
  )?.error

  if (assistantError) {
    const msg =
      typeof assistantError.data?.message === "string"
        ? unwrapError(assistantError.data.message)
        : assistantError.name
    return {
      primary: "Agent hit an error",
      secondary: activeTools[0] ? stepLabel(activeTools[0]) : undefined,
      detail: msg,
      tone: "error",
      elapsedMs,
      steps,
    }
  }

  if (activeTools.length > 0) {
    const current = activeTools[activeTools.length - 1]!
    const runningTitle =
      current.state.status === "running" && current.state.title?.trim() ? current.state.title.trim() : undefined
    return {
      primary: runningTitle ?? toolLabel(current),
      secondary: toolSubtitle(current),
      detail: toolError(erroredTools.at(-1)),
      tone: erroredTools.length > 0 ? "error" : "neutral",
      elapsedMs,
      steps,
    }
  }

  const reasoning = turnParts.findLast((part) => part.type === "reasoning" && part.text?.trim())
  if (reasoning?.type === "reasoning") {
    return {
      primary: "Reasoning",
      secondary: reasoningHeading(reasoning.text) ?? "Planning next steps",
      tone: "neutral",
      elapsedMs,
      steps,
    }
  }

  const streamingText = turnParts.findLast((part) => part.type === "text" && part.text?.trim())
  if (streamingText?.type === "text") {
    return {
      primary: "Writing response",
      secondary: completedTools.length > 0 ? `Finished ${completedTools.length} tool step${completedTools.length === 1 ? "" : "s"}` : undefined,
      tone: "neutral",
      elapsedMs,
      steps,
    }
  }

  if (pending || status.type === "busy") {
    return {
      primary: completedTools.length > 0 || erroredTools.length > 0 ? "Waiting for model" : "Starting agent turn",
      secondary:
        completedTools.length > 0
          ? `Completed ${completedTools.length} tool step${completedTools.length === 1 ? "" : "s"}`
          : erroredTools.length > 0
            ? "Recovering from tool error"
            : "Connecting to model",
      detail: toolError(erroredTools.at(-1)),
      tone: erroredTools.length > 0 ? "error" : "neutral",
      elapsedMs,
      steps,
    }
  }

  if (erroredTools.length > 0) {
    const failed = erroredTools[erroredTools.length - 1]!
    return {
      primary: "Tool failed",
      secondary: stepLabel(failed),
      detail: toolError(failed),
      tone: "error",
      elapsedMs,
      steps,
    }
  }

  return undefined
}

export function formatElapsed(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
}

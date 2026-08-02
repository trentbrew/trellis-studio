/** Agent backend for shell.companion (see specs/claude-code-acp-companion.md). */
export type AgentBackend = "opencode" | "claude-acp"

export type AgentBackendConfig = {
  backend: AgentBackend
  bridge?: {
    command: string
    args: string[]
    env?: Record<string, string>
  }
}

export const DEFAULT_CLAUDE_ACP_BRIDGE = {
  command: process.execPath,
  args: [] as string[],
} as const

/** Normalized streaming part for MessageTimeline (CC1+). */
export type NormalizedPart =
  | { kind: "text"; role: "assistant" | "user"; text: string; delta?: boolean }
  | { kind: "thought"; text: string; delta?: boolean }
  | {
      kind: "tool"
      toolCallId: string
      status: "pending" | "in_progress" | "completed" | "failed"
      title: string
      rawInput?: unknown
      content?: string
    }
  | { kind: "plan"; payload: unknown }

export type AcpSpikeResult = {
  ok: boolean
  sessionId?: string
  assistantText: string
  updates: unknown[]
  error?: string
  authRequired?: boolean
}

import type { AgentBackend, NormalizedPart } from "./types"

export type AgentSessionRef = {
  id: string
  backend: AgentBackend
  cwd: string
  title?: string
}

export type AgentPromptInput = {
  sessionId: string
  text: string
  cwd: string
}

export type AgentRuntime = {
  readonly backend: AgentBackend

  createSession(input: { cwd: string; title?: string }): Promise<AgentSessionRef>

  prompt(input: AgentPromptInput): Promise<void>

  abort(input: { sessionId: string; cwd: string }): Promise<void>

  /** Subscribe to normalized parts for a session (CC2+ claude-acp; opencode uses global SDK stream today). */
  subscribe(
    input: { sessionId: string; cwd: string },
    onPart: (part: NormalizedPart) => void,
  ): () => void

  listSessions(input: { cwd: string }): Promise<AgentSessionRef[]>
}

export function isClaudeAcpBackend(backend: AgentBackend): backend is "claude-acp" {
  return backend === "claude-acp"
}

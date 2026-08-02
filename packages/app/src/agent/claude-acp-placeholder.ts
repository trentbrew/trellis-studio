import type { AgentRuntime } from "./runtime"

const MSG =
  "Claude Code (ACP) in the companion is not available in the browser bundle yet (CC2). " +
  "Use backend `opencode` or run `bun run acp:spike` from packages/app."

function blocked(): never {
  throw new Error(MSG)
}

/** Browser-safe stand-in until CC2 proxies ACP through the OpenCode host. */
export function createClaudeAcpPlaceholderRuntime(): AgentRuntime {
  return {
    backend: "claude-acp",

    async createSession() {
      blocked()
    },

    async prompt() {
      blocked()
    },

    async abort() {},

    subscribe() {
      return () => {}
    },

    async listSessions() {
      return []
    },
  }
}

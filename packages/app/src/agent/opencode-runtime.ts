import type { AgentRuntime, AgentSessionRef } from "./runtime"

/**
 * OpenCode sessions remain on the existing SDK + global event stream (session.tsx).
 * This runtime is a typed marker for CC1; CC3 wires companion UI to AgentRuntime when backend is opencode.
 */
export function createOpenCodeRuntime(): AgentRuntime {
  return {
    backend: "opencode",

    async createSession(input) {
      throw new Error("OpenCode sessions are created via useSDK / session API (not AgentRuntime yet)")
    },

    async prompt() {
      throw new Error("OpenCode prompts use SessionComposer + SDK (not AgentRuntime yet)")
    },

    async abort() {
      // sdk.session.abort — wired in CC3
    },

    subscribe() {
      return () => {}
    },

    async listSessions(): Promise<AgentSessionRef[]> {
      return []
    },
  }
}

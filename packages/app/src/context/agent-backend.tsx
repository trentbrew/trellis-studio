import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { createClaudeAcpPlaceholderRuntime } from "@/agent/claude-acp-placeholder"
import { createOpenCodeRuntime } from "@/agent/opencode-runtime"
import type { AgentRuntime } from "@/agent/runtime"
import type { AgentBackend } from "@/agent/types"
import { Persist, persisted } from "@/utils/persist"

type AgentBackendState = {
  backend: AgentBackend
}

export const { use: useAgentBackend, provider: AgentBackendProvider } = createSimpleContext({
  name: "AgentBackend",
  init: () => {
    const [store, setStore] = createStore<AgentBackendState>({ backend: "opencode" })

    persisted(Persist.global("agent.backend", ["agent.backend.v1"]), [store, setStore])

    if (typeof window !== "undefined") {
      createEffect(() => {
        const raw = new URLSearchParams(window.location.search).get("agentBackend")
        if (raw === "claude-acp" || raw === "opencode") setStore("backend", raw)
      })
    }

    const runtime = createMemo<AgentRuntime>(() =>
      store.backend === "claude-acp" ? createClaudeAcpPlaceholderRuntime() : createOpenCodeRuntime(),
    )

    return {
      backend: () => store.backend,
      /** True when the real ACP subprocess client is wired (CC2+), not the browser placeholder. */
      claudeAcpLive: () => false,
      setBackend(backend: AgentBackend) {
        setStore("backend", backend)
      },
      runtime,
    }
  },
})

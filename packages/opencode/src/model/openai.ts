import type { Delta, Provider, Request, Status } from "./types"
import { json, lines } from "./stream"

/**
 * Shared client for backends exposing an OpenAI-compatible `/v1/chat/completions`
 * SSE endpoint. The model always lives in a separate, already-running process —
 * we connect, we never spawn.
 */
export function openai(input: {
  id: string
  endpoint: string
  health: string
  model: string
  /** Reads RAM usage out of the health payload, when the backend reports it. */
  ram?: (payload: Record<string, any>) => number
  /** Backends that key their KV cache off a caller-supplied session id. */
  session?: boolean
}): Provider {
  const status: Status = { state: "disconnected", load: 0, ram: 0, sessions: 0, warm: false }
  let ready = false

  const connect = async () => {
    if (ready) return status
    const start = Date.now()
    status.state = "loading"
    const res = await fetch(`${input.endpoint}${input.health}`, { signal: AbortSignal.timeout(5000) }).catch(
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    )
    if (res instanceof Error || !res.ok) {
      status.state = "error"
      status.error = res instanceof Error ? res.message : `${input.id} returned ${res.status}`
      return status
    }
    const payload = (await res.json().catch(() => ({}))) as Record<string, any>
    status.state = "ready"
    status.load = Date.now() - start
    status.ram = input.ram?.(payload) ?? 0
    status.error = undefined
    ready = true
    return status
  }

  return {
    id: input.id,
    endpoint: input.endpoint,
    init: connect,
    status: () => status,
    /**
     * These servers pin the model at their own startup, so reaching /health is
     * itself proof the weights are resident.
     */
    async warm() {
      await connect()
      status.warm = status.state === "ready"
      return status
    },
    async shutdown() {
      ready = false
      status.state = "disconnected"
      status.sessions = 0
    },
    async reset() {
      // These backends replace the retained prefix whenever an incompatible
      // history arrives, so a reset is implicit in the next request.
    },
    async *generate(req: Request): AsyncIterable<Delta> {
      if (!ready) await connect()
      if (status.state !== "ready") throw new Error(`${input.id} not ready: ${status.error ?? "unknown"}`)

      status.sessions++
      status.warm = true
      const res = await fetch(`${input.endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          model: input.model,
          messages: req.messages,
          temperature: req.config.temp,
          top_k: req.config.topk,
          top_p: req.config.topp,
          seed: req.config.seed,
          max_tokens: req.config.max,
          stop: req.config.stop,
          stream: true,
          user: input.session ? req.session : undefined,
        }),
      }).catch((err: unknown) => {
        status.sessions = Math.max(0, status.sessions - 1)
        throw err instanceof Error ? err : new Error(String(err))
      })

      if (!res.ok || !res.body) {
        status.sessions = Math.max(0, status.sessions - 1)
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
      }

      let index = 0
      let first = true
      try {
        for await (const line of lines(res.body)) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (raw === "[DONE]") {
            yield { text: "", first: false, done: true, index: index++ }
            return
          }
          const delta = json(raw)?.choices?.[0]?.delta
          // Reasoning models expose their scratchpad separately from the answer.
          const reason = delta?.reasoning_content ?? delta?.reasoning
          if (typeof reason === "string" && reason) {
            yield { text: reason, first: false, done: false, index: index++, thinking: true }
          }
          const text = delta?.content
          if (typeof text !== "string" || !text) continue
          yield { text, first, done: false, index: index++ }
          first = false
        }
      } finally {
        status.sessions = Math.max(0, status.sessions - 1)
      }
    },
  }
}

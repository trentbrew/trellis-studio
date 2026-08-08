import type { Adapter, Config, Delta, Provider, Request, Status } from "./types"
import { json, lines, reachable } from "./stream"
import { openai } from "./openai"

/**
 * Defaults match each backend's own documented default, so a server started the
 * documented way is found without configuration. They are guesses about where a
 * user put something, not ports we own — override when yours differs.
 *
 * TurboFieldfare and llama.cpp genuinely share 8080; `isLlama` disambiguates
 * from the response rather than assuming one of them moved.
 */
const TURBO = env("TRELLIS_TURBOFIELDFARE_URL", "http://127.0.0.1:8080")
const OLLAMA = env("TRELLIS_OLLAMA_URL", "http://127.0.0.1:11434")
const LLAMA = env("TRELLIS_LLAMACPP_URL", "http://127.0.0.1:8080")

function env(key: string, fallback: string) {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  return URL.canParse(raw) ? raw.replace(/\/$/, "") : fallback
}

/** Ollama evicts idle models after 5m by default; pin them for the session instead. */
const KEEP = "2h"
const MODEL = "gemma4"

/**
 * TurboFieldfare server (macOS / Apple Silicon). OpenAI-compatible, and its
 * prefix KV cache is keyed off the `user` field, so sessions map cleanly.
 */
const turbo: Adapter = {
  id: "turbofieldfare",
  name: "TurboFieldfare Server",
  platform: "macOS 26+ (Apple Silicon)",
  endpoint: TURBO,
  caps: { context: 65536, output: 4096, streaming: true, reuse: true, trust: ["fast", "full"], memory: 512 },
  probe: (endpoint = TURBO) => reachable(`${endpoint}/health`),
  create: (endpoint = TURBO) =>
    openai({
      id: "turbofieldfare",
      endpoint,
      health: "/health",
      model: "gemma-4-26b-a4b-it",
      ram: (payload) => Number(payload.ram_usage_bytes ?? 0),
      session: true,
    }),
}

/**
 * llama.cpp shares port 8080 with TurboFieldfare and answers the same
 * `/v1/models` probe, so a bare reachability check misidentifies one as the
 * other. TurboFieldfare stamps `owned_by: turbofieldfare` on its models; treat
 * that as a disqualifier rather than claiming a server we do not own.
 */
async function isLlama(endpoint: string) {
  const res = await fetch(`${endpoint}/v1/models`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
  if (!res?.ok) return false
  const payload = (await res.json().catch(() => ({}))) as { data?: { owned_by?: string }[] }
  return !(payload.data ?? []).some((x) => x.owned_by === "turbofieldfare")
}

/** llama.cpp server — OpenAI-compatible, KV cache keyed off the prompt prefix. */
const llama: Adapter = {
  id: "llama.cpp",
  name: "llama.cpp Server",
  platform: "Cross-platform",
  endpoint: LLAMA,
  caps: { context: 32768, output: 2048, streaming: true, reuse: true, trust: ["fast", "full"], memory: 2048 },
  probe: (endpoint = LLAMA) => isLlama(endpoint),
  create: (endpoint = LLAMA) => openai({ id: "llama.cpp", endpoint, health: "/v1/models", model: "gemma4" }),
}

/**
 * Ollama counts reasoning tokens against `num_predict`, so a thinking model can
 * burn the whole budget before emitting a single word of the answer. Give the
 * reasoning its own allowance on top of the caller's visible-token cap.
 */
function budget(cfg: Config) {
  return cfg.max + (cfg.think ?? 0)
}

/** Ollama streams newline-delimited JSON from `/api/chat` rather than SSE. */
function ollamaProvider(endpoint: string): Provider {
  const status: Status = { state: "disconnected", load: 0, ram: 0, sessions: 0, warm: false }
  let ready = false

  const connect = async () => {
    if (ready) return status
    const start = Date.now()
    status.state = "loading"
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) }).catch((err: unknown) =>
      err instanceof Error ? err : new Error(String(err)),
    )
    if (res instanceof Error || !res.ok) {
      status.state = "error"
      status.error = res instanceof Error ? res.message : `ollama returned ${res.status}`
      return status
    }
    const payload = (await res.json().catch(() => ({}))) as { models?: { size?: number }[] }
    status.state = "ready"
    status.load = Date.now() - start
    status.ram = (payload.models ?? []).reduce((acc, m) => acc + (m.size ?? 0), 0)
    status.error = undefined
    ready = true
    return status
  }

  /** `/api/ps` lists models currently held in memory. */
  const resident = async () => {
    const res = await fetch(`${endpoint}/api/ps`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
    if (!res?.ok) return false
    const payload = (await res.json().catch(() => ({}))) as { models?: { model?: string }[] }
    return (payload.models ?? []).some((x) => (x.model ?? "").startsWith(MODEL))
  }

  return {
    id: "ollama",
    endpoint,
    init: connect,
    status: () => status,
    /**
     * Preload the weights and pin them. An empty messages array makes Ollama
     * load the model and return immediately without generating, so this pays
     * the ~4s load cost once at startup rather than on the user's first prompt.
     */
    async warm() {
      await connect()
      if (status.state !== "ready") return status
      if (await resident()) {
        status.warm = true
        return status
      }
      const start = Date.now()
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: [], keep_alive: KEEP }),
      }).catch(() => undefined)
      status.warm = Boolean(res?.ok) && (await resident())
      if (status.warm) status.load = Date.now() - start
      return status
    },
    async shutdown() {
      ready = false
      status.state = "disconnected"
      status.sessions = 0
    },
    async reset() {
      // Ollama carries context in the messages array; a fresh array is the reset.
    },
    async *generate(req: Request): AsyncIterable<Delta> {
      if (!ready) await connect()
      if (status.state !== "ready") throw new Error(`ollama not ready: ${status.error ?? "unknown"}`)

      status.sessions++
      status.warm = true
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          keep_alive: KEEP,
          messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          options: {
            temperature: req.config.temp,
            top_k: req.config.topk,
            top_p: req.config.topp,
            seed: req.config.seed,
            num_predict: budget(req.config),
            stop: req.config.stop,
          },
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
          if (!line.trim()) continue
          const parsed = json(line)
          if (!parsed) continue
          // Reasoning models emit `thinking` with empty `content` for most of the
          // stream. Forward it flagged so the UI can show progress instead of a
          // blank screen for several seconds.
          const reason = parsed.message?.thinking
          if (typeof reason === "string" && reason) {
            yield { text: reason, first: false, done: false, index: index++, thinking: true }
          }
          const text = parsed.message?.content
          if (typeof text === "string" && text) {
            yield { text, first, done: Boolean(parsed.done), index: index++ }
            first = false
          }
          if (parsed.done) return
        }
      } finally {
        status.sessions = Math.max(0, status.sessions - 1)
      }
    },
  }
}

const ollama: Adapter = {
  id: "ollama",
  name: "Ollama",
  platform: "Cross-platform",
  endpoint: OLLAMA,
  caps: { context: 16384, output: 2048, streaming: true, reuse: true, trust: ["fast", "full"], memory: 1024 },
  probe: (endpoint = OLLAMA) => reachable(`${endpoint}/api/tags`),
  create: (endpoint = OLLAMA) => ollamaProvider(endpoint),
}

/** Detection order is preference order: native first, then cross-platform. */
export const ADAPTERS: Adapter[] = [turbo, ollama, llama]

export function adapter(id: string) {
  return ADAPTERS.find((x) => x.id === id)
}

import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./deep-research.txt"
import { Env } from "../env"
import { abortAfterAny } from "../util/abort"

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
const API_REVISION = "2026-05-20"
const POLL_MS = 5_000
const MAX_WAIT_MS = 20 * 60_000

const AGENTS = {
  standard: "deep-research-preview-04-2026",
  max: "deep-research-max-preview-04-2026",
} as const

interface Interaction {
  id?: string
  status?: string
  output_text?: string
  error?: { message?: string }
}

function geminiApiKey() {
  for (const name of [
    "OPENCODE_GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "ZEN_IMAGE_GEMINI_API_KEY",
  ]) {
    const value = Env.get(name)
    if (value) return value
  }
  return undefined
}

function headers(key: string) {
  return {
    "content-type": "application/json",
    "x-goog-api-key": key,
    "Api-Revision": API_REVISION,
  }
}

async function parseJson(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text) as Interaction
  } catch {
    throw new Error(`Gemini Interactions API error (${res.status}): ${text}`)
  }
}

async function createInteraction(input: {
  brief: string
  mode: keyof typeof AGENTS
  key: string
  signal: AbortSignal
}) {
  const res = await fetch(`${BASE_URL}/interactions`, {
    method: "POST",
    headers: headers(input.key),
    body: JSON.stringify({
      input: input.brief,
      agent: AGENTS[input.mode],
      background: true,
      store: true,
    }),
    signal: input.signal,
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Failed to start deep research (${res.status})`)
  }
  if (!data.id) throw new Error("Gemini Interactions API did not return an interaction id")
  return data.id
}

async function getInteraction(id: string, key: string, signal: AbortSignal) {
  const res = await fetch(`${BASE_URL}/interactions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: headers(key),
    signal,
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Failed to poll deep research (${res.status})`)
  }
  return data
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("Aborted"))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error("Aborted"))
      },
      { once: true },
    )
  })
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g

function clean(url: string) {
  return url.replace(/[),.;:!?]+$/g, "")
}

function extractSources(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(URL_RE), (item) => clean(item[0])))).slice(0, 64)
}

async function pollUntilComplete(id: string, key: string, abort: AbortSignal) {
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    const { signal, clearTimeout } = abortAfterAny(Math.max(deadline - Date.now(), 1_000), abort)
    try {
      const interaction = await getInteraction(id, key, signal)
      if (interaction.status === "completed") {
        return interaction.output_text ?? "Deep research completed but returned no report text."
      }
      if (interaction.status === "failed") {
        throw new Error(interaction.error?.message ?? "Deep research failed")
      }
      if (interaction.status === "cancelled" || interaction.status === "canceled") {
        throw new Error("Deep research was cancelled")
      }
    } finally {
      clearTimeout()
    }
    await sleep(POLL_MS, abort)
  }
  throw new Error("Deep research timed out")
}

export const DeepResearchTool = Tool.define("deep_research", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      brief: z
        .string()
        .describe(
          "Research question or topic. Include scope, audience, and desired output structure when helpful.",
        ),
      mode: z
        .enum(["standard", "max"])
        .optional()
        .describe(
          "Research depth — 'standard': faster interactive research (default), 'max': maximum comprehensiveness for exhaustive reports",
        ),
    }),
    async execute(params, ctx) {
      const key = geminiApiKey()
      if (!key) {
        throw new Error(
          "GEMINI_API_KEY is required for deep research. Set GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENCODE_GEMINI_API_KEY.",
        )
      }

      const mode = params.mode ?? "standard"

      await ctx.ask({
        permission: "deep_research",
        patterns: [params.brief.slice(0, 200)],
        always: ["*"],
        metadata: { brief: params.brief, mode },
      })

      const { signal, clearTimeout } = abortAfterAny(MAX_WAIT_MS, ctx.abort)
      try {
        const id = await createInteraction({ brief: params.brief, mode, key, signal })
        const report = await pollUntilComplete(id, key, signal)
        const sources = extractSources(report)
        return {
          title: `Deep research: ${params.brief.slice(0, 80)}`,
          output: [
            "<deep_research_report>",
            `Mode: ${mode === "max" ? "Deep Research Max" : "Deep Research"}`,
            `Interaction: ${id}`,
            "",
            "Verification requirements:",
            "- Treat this report as synthesized research, not infallible truth.",
            "- Cite source URLs from the report for web-backed claims in your final answer.",
            "- Use webfetch to verify critical facts against primary sources when stakes are high.",
            "- End your response with a ## Sources section listing every URL you relied on.",
            "",
            report,
            "</deep_research_report>",
          ].join("\n"),
          metadata: { interactionId: id, mode, provider: "gemini-deep-research", sources },
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Deep research request timed out or was aborted")
        }
        throw error
      } finally {
        clearTimeout()
      }
    },
  }
})

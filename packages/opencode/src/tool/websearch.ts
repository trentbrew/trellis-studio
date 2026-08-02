import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import * as McpWebSearch from "./mcp-websearch"
import { Flag } from "../flag/flag"
import { Installation } from "../installation"

const DEFAULT_NUM_RESULTS = 8

const URL_RE = /https?:\/\/[^\s<>"'`]+/g

export type WebSearchProvider = "exa" | "parallel"

export function selectWebSearchProvider(
  _sessionID: string,
  flags = { exa: Flag.OPENCODE_ENABLE_EXA, parallel: Flag.OPENCODE_ENABLE_PARALLEL },
): WebSearchProvider {
  const override = process.env.OPENCODE_WEBSEARCH_PROVIDER
  if (override === "exa" || override === "parallel") return override
  if (flags.parallel) return "parallel"
  return "exa"
}

export function webSearchProviderLabel(provider: unknown) {
  if (provider === "parallel") return "Parallel Web Search"
  if (provider === "exa") return "Exa Web Search"
  return "Web Search"
}

export function webSearchModelName(extra: Tool.Context["extra"]) {
  const model = extra?.model
  if (!model || typeof model !== "object") return undefined
  const api = "api" in model && model.api && typeof model.api === "object" ? model.api : undefined
  const apiID = api && "id" in api && typeof api.id === "string" ? api.id : undefined
  const id = "id" in model && typeof model.id === "string" ? model.id : undefined
  return (apiID ?? id)?.slice(0, 100)
}

function parallelAuthHeaders() {
  const headers: Record<string, string> = { "User-Agent": `opencode/${Installation.VERSION}` }
  if (process.env.PARALLEL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.PARALLEL_API_KEY}`
  }
  return headers
}

function clean(url: string) {
  return url.replace(/[),.;:!?]+$/g, "")
}

function sources(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(URL_RE), (item) => clean(item[0])))).slice(0, 12)
}

function format(input: { query: string; text: string; sources: string[]; provider: WebSearchProvider }) {
  const src = input.sources.length
    ? input.sources.map((url, index) => `${index + 1}. ${url}`).join("\n")
    : "No source URLs were detected in the returned search text. Use another search or webfetch before making source-backed claims."
  return [
    "<web_search_result>",
    `Provider: ${webSearchProviderLabel(input.provider)}`,
    `Query: ${input.query}`,
    "",
    "Verification requirements:",
    "- Cite source URLs for any web-backed claim in the final answer.",
    "- End research responses with a ## Sources section: deduplicated URLs with title (or domain) and a brief note on what each source supported.",
    "- Verify important claims with primary or authoritative sources; corroborate with an independent source when possible.",
    "- Use webfetch on result URLs before relying on snippets for exact dates, versions, pricing, APIs, legal, medical, security, or financial details.",
    "- If sources are missing, ambiguous, outdated, or contradictory, say what is unknown instead of guessing.",
    "- Never invent citations, URLs, quotes, dates, source titles, or details not supported by retrieved evidence.",
    "",
    "Source URLs found:",
    src,
    "",
    "Search evidence:",
    input.text,
    "</web_search_result>",
  ].join("\n")
}

async function callProvider(
  provider: WebSearchProvider,
  params: {
    query: string
    numResults?: number
    livecrawl?: "fallback" | "preferred"
    type?: "auto" | "fast" | "deep"
    contextMaxCharacters?: number
  },
  ctx: Tool.Context,
) {
  if (provider === "parallel") {
    return McpWebSearch.callWithTimeout(
      McpWebSearch.PARALLEL_URL,
      "web_search",
      {
        objective: params.query,
        search_queries: [params.query],
        session_id: ctx.sessionID,
        model_name: webSearchModelName(ctx.extra),
      },
      ctx.abort,
      parallelAuthHeaders(),
    )
  }

  return McpWebSearch.callWithTimeout(
    McpWebSearch.EXA_URL,
    "web_search_exa",
    {
      query: params.query,
      type: params.type || "auto",
      numResults: params.numResults || DEFAULT_NUM_RESULTS,
      livecrawl: params.livecrawl || "fallback",
      contextMaxCharacters: params.contextMaxCharacters,
    },
    ctx.abort,
  )
}

export const WebSearchTool = Tool.define("websearch", async () => {
  return {
    get description() {
      return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
    },
    parameters: z.object({
      query: z.string().describe("Websearch query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8)"),
      livecrawl: z
        .enum(["fallback", "preferred"])
        .optional()
        .describe(
          "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
        ),
      type: z
        .enum(["auto", "fast", "deep"])
        .optional()
        .describe(
          "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
        ),
      contextMaxCharacters: z
        .number()
        .optional()
        .describe("Maximum characters for context string optimized for LLMs (default: 10000)"),
    }),
    async execute(params, ctx) {
      const provider = selectWebSearchProvider(ctx.sessionID)
      const label = webSearchProviderLabel(provider)

      await ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
          livecrawl: params.livecrawl,
          type: params.type,
          contextMaxCharacters: params.contextMaxCharacters,
          provider,
        },
      })

      try {
        const text = await callProvider(provider, params, ctx)

        if (text) {
          const urls = sources(text)
          return {
            output: format({ query: params.query, text, sources: urls, provider }),
            title: `${label}: ${params.query}`,
            metadata: { sources: urls, provider },
          }
        }

        return {
          output: [
            `No search results found for: ${params.query}`,
            "Do not answer current or source-sensitive claims from this search result.",
            "Try a narrower query, search authoritative domains, or state that the available evidence is insufficient.",
          ].join("\n"),
          title: `${label}: ${params.query}`,
          metadata: { sources: [], provider },
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Search request timed out")
        }
        throw error
      }
    },
  }
})

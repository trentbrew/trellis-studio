import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { MessageID, SessionID } from "../../src/session/schema"
import { parseResponse } from "../../src/tool/mcp-websearch"
import {
  selectWebSearchProvider,
  webSearchModelName,
  webSearchProviderLabel,
  WebSearchTool,
} from "../../src/tool/websearch"

const root = path.join(import.meta.dir, "../..")
const SESSION_ID = SessionID.make("ses_test")

const ctx = {
  sessionID: SESSION_ID,
  messageID: MessageID.make("message"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

async function mock(
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const prev = globalThis.fetch
  globalThis.fetch = fetcher as unknown as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = prev
  }
}

function sse(text: string) {
  return `data: ${JSON.stringify({ jsonrpc: "2.0", result: { content: [{ type: "text", text }] } })}\n\n`
}

describe("websearch provider", () => {
  test("defaults to Exa when no flags are set", () => {
    expect(selectWebSearchProvider(SESSION_ID, { exa: false, parallel: false })).toBe("exa")
  })

  test("supports OPENCODE_WEBSEARCH_PROVIDER override", () => {
    const original = process.env.OPENCODE_WEBSEARCH_PROVIDER
    try {
      process.env.OPENCODE_WEBSEARCH_PROVIDER = "parallel"
      expect(selectWebSearchProvider(SESSION_ID)).toBe("parallel")

      process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa"
      expect(selectWebSearchProvider(SESSION_ID)).toBe("exa")
    } finally {
      if (original === undefined) delete process.env.OPENCODE_WEBSEARCH_PROVIDER
      else process.env.OPENCODE_WEBSEARCH_PROVIDER = original
    }
  })

  test("routes to Parallel when the Parallel flag is enabled", () => {
    expect(selectWebSearchProvider(SESSION_ID, { exa: false, parallel: true })).toBe("parallel")
  })

  test("uses branded labels", () => {
    expect(webSearchProviderLabel("parallel")).toBe("Parallel Web Search")
    expect(webSearchProviderLabel("exa")).toBe("Exa Web Search")
    expect(webSearchProviderLabel(undefined)).toBe("Web Search")
  })

  test("uses the provider API model id for Parallel analytics", () => {
    expect(
      webSearchModelName({
        model: {
          id: "claude-opus-4-7",
          api: { id: "claude-opus-4.7" },
        },
      }),
    ).toBe("claude-opus-4.7")
  })
})

describe("websearch MCP response parser", () => {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [{ type: "text", text: "search results" }],
    },
  })

  test("parses plain JSON-RPC responses", () => {
    expect(parseResponse(payload)).toBe("search results")
  })

  test("parses SSE JSON-RPC responses", () => {
    expect(parseResponse(`event: message\ndata: ${payload}\n\n`)).toBe("search results")
  })

  test("ignores non-JSON SSE data frames", () => {
    expect(parseResponse(`data: [DONE]\ndata: ${payload}\n\n`)).toBe("search results")
  })
})

describe("tool.websearch", () => {
  test("wraps search results with verification guidance and extracted sources", async () => {
    const text = [
      "Bun runtime docs",
      "URL: https://bun.sh/docs/runtime",
      "Repository: https://github.com/oven-sh/bun.",
    ].join("\n")
    await mock(
      async () => new Response(sse(text), { status: 200, headers: { "content-type": "text/event-stream" } }),
      async () => {
        await Instance.provide({
          directory: root,
          fn: async () => {
            const tool = await WebSearchTool.init()
            const result = await tool.execute({ query: "bun runtime" }, ctx)
            expect(result.output).toContain("Verification requirements:")
            expect(result.output).toContain("Cite source URLs")
            expect(result.output).toContain("Provider: Exa Web Search")
            expect(result.output).toContain("https://bun.sh/docs/runtime")
            expect(result.output).toContain("https://github.com/oven-sh/bun")
            expect(result.metadata.sources).toEqual(["https://bun.sh/docs/runtime", "https://github.com/oven-sh/bun"])
            expect(result.metadata.provider).toBe("exa")
          },
        })
      },
    )
  })

  test("warns when results do not include detectable source urls", async () => {
    await mock(
      async () =>
        new Response(sse("A result without a visible URL"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      async () => {
        await Instance.provide({
          directory: root,
          fn: async () => {
            const tool = await WebSearchTool.init()
            const result = await tool.execute({ query: "current sdk release" }, ctx)
            expect(result.output).toContain("No source URLs were detected")
            expect(result.metadata.sources).toEqual([])
          },
        })
      },
    )
  })

  test("returns uncertainty guidance when no search results are found", async () => {
    await mock(
      async () =>
        new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", result: { content: [] } })}\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      async () => {
        await Instance.provide({
          directory: root,
          fn: async () => {
            const tool = await WebSearchTool.init()
            const result = await tool.execute({ query: "zzzzzz no result" }, ctx)
            expect(result.output).toContain("Do not answer current or source-sensitive claims")
            expect(result.output).toContain("available evidence is insufficient")
            expect(result.metadata.sources).toEqual([])
          },
        })
      },
    )
  })
})

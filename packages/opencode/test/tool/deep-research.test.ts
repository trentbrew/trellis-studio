import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { MessageID, SessionID } from "../../src/session/schema"
import { DeepResearchTool } from "../../src/tool/deep-research"
import { Env } from "../../src/env"

const root = path.join(import.meta.dir, "../..")

const ctx = {
  sessionID: SessionID.make("ses_deep_research"),
  messageID: MessageID.make("message"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.deep_research", () => {
  test("requires a Gemini API key", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const keys = [
          "OPENCODE_GEMINI_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "GEMINI_API_KEY",
          "ZEN_IMAGE_GEMINI_API_KEY",
        ] as const
        const saved = Object.fromEntries(keys.map((key) => [key, Env.get(key)]))
        for (const key of keys) Env.remove(key)

        try {
          const tool = await DeepResearchTool.init()
          await expect(tool.execute({ brief: "Research EV batteries" }, ctx)).rejects.toThrow("GEMINI_API_KEY")
        } finally {
          for (const key of keys) {
            const value = saved[key]
            if (value) Env.set(key, value)
            else Env.remove(key)
          }
        }
      },
    })
  })

  test("creates and polls an interaction until completed", async () => {
    await Instance.provide({
      directory: root,
      fn: async () => {
        const saved = Env.get("GEMINI_API_KEY")
        Env.set("GEMINI_API_KEY", "test-key")
        const calls: string[] = []

        const prev = globalThis.fetch
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
          calls.push(`${init?.method ?? "GET"} ${url}`)
          if (url.endsWith("/interactions") && init?.method === "POST") {
            return new Response(JSON.stringify({ id: "interaction-123", status: "in_progress" }), { status: 200 })
          }
          if (url.includes("/interactions/interaction-123")) {
            return new Response(
              JSON.stringify({
                id: "interaction-123",
                status: "completed",
                output_text: "Report body with https://example.com/source",
              }),
              { status: 200 },
            )
          }
          return new Response("not found", { status: 404 })
        }) as typeof fetch

        try {
          const tool = await DeepResearchTool.init()
          const result = await tool.execute({ brief: "Research EV batteries", mode: "max" }, ctx)
          expect(result.output).toContain("<deep_research_report>")
          expect(result.output).toContain("Deep Research Max")
          expect(result.output).toContain("Report body with https://example.com/source")
          expect(result.metadata.interactionId).toBe("interaction-123")
          expect(result.metadata.mode).toBe("max")
          expect(calls.some((c) => c.startsWith("POST"))).toBe(true)
          expect(calls.some((c) => c.startsWith("GET"))).toBe(true)
        } finally {
          globalThis.fetch = prev
          if (saved) Env.set("GEMINI_API_KEY", saved)
          else Env.remove("GEMINI_API_KEY")
        }
      },
    })
  })
})

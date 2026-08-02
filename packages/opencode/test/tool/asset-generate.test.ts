import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { readFile } from "fs/promises"
import { AssetTool } from "../../src/tool/asset"
import { Instance } from "../../src/project/instance"
import { resetEnvCache } from "../../src/file/image-generation"
import { SessionID, MessageID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"

const prev = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
}

const ctx = {
  sessionID: SessionID.make("ses_test-asset-generate"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

afterEach(async () => {
  process.env.OPENAI_API_KEY = prev.openai
  process.env.GEMINI_API_KEY = prev.gemini
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = prev.google
  resetEnvCache()
  await Instance.disposeAll()
})

describe("asset tool create_link_asset", () => {
  test("saves a link under .trellis/assets", async () => {
    await using tmp = await tmpdir()
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await AssetTool.init()
        const result = await tool.execute(
          {
            action: "create_link_asset",
            url: "https://trellis.computer/docs",
            title: "Trellis docs",
          },
          ctx,
        )

        expect(result.output).toContain(".trellis/assets")
        expect(result.metadata.url).toBe("https://trellis.computer/docs")
        expect(result.metadata.title).toBe("Trellis docs")
      },
    })
  })
})

describe("asset tool generate_image_asset", () => {
  test("generates and saves an image under .trellis/media", async () => {
    await using tmp = await tmpdir()
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    process.env.OPENAI_API_KEY = "test"
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    const old = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("tool-image").toString("base64") }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await AssetTool.init()
          const result = await tool.execute(
            {
              action: "generate_image_asset",
              prompt: "A turtle mascot",
              provider: "openai",
              size: "1024x1024",
              output_format: "png",
            },
            ctx,
          )

          expect(result.output).toContain(".trellis/media")
          expect(result.metadata.path).toMatch(/\.trellis\/media\//)
          const bytes = await readFile(path.join(tmp.path, result.metadata.path))
          expect(Buffer.from(bytes).toString()).toBe("tool-image")
        },
      })
    } finally {
      globalThis.fetch = old
    }
  })
})

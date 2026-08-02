import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, readFile } from "fs/promises"
import { Hono } from "hono"
import path from "path"
import { Instance } from "../../src/project/instance"
import { resetEnvCache } from "../../src/file/image-generation"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const prev = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  provider: process.env.IMAGE_PROVIDER,
  disableDotenv: process.env.OPENCODE_DISABLE_DOTENV,
}

let app: Hono
let dir: string
let cleanup: { [Symbol.asyncDispose](): Promise<void> }

async function post(body: unknown) {
  return Instance.provide({
    directory: dir,
    fn: () =>
      app.request("http://localhost/file/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  })
}

async function getMedia(filename: string) {
  return Instance.provide({
    directory: dir,
    fn: () => app.request(`http://localhost/file/media/${encodeURIComponent(filename)}`),
  })
}

beforeAll(async () => {
  const tmp = await tmpdir()
  cleanup = tmp
  dir = tmp.path

  const { FileRoutes } = await import("../../src/server/routes/file")
  const root = new Hono()
  root.route("/", FileRoutes())
  app = root
})

afterAll(async () => {
  await cleanup[Symbol.asyncDispose]()
})

afterEach(() => {
  process.env.OPENAI_API_KEY = prev.openai
  process.env.GEMINI_API_KEY = prev.gemini
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = prev.google
  process.env.IMAGE_PROVIDER = prev.provider
  process.env.OPENCODE_DISABLE_DOTENV = prev.disableDotenv
  resetEnvCache()
})

describe("POST /file/media/generate", () => {
  test("generates via OpenAI and writes .trellis/media asset", async () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    process.env.OPENAI_API_KEY = "test"
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    const old = globalThis.fetch
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe("gpt-image-2")
      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const res = await post({
        prompt: "A turtle icon",
        provider: "openai",
        size: "1024x1024",
        output_format: "png",
      })
      expect(res.status).toBe(200)

      const json = (await res.json()) as { path: string; name: string; provider: string; prompt: string }
      expect(json.provider).toBe("openai")
      expect(json.prompt).toBe("A turtle icon")
      expect(json.path).toBe(path.join(".trellis", "media", "a-turtle-icon.png"))
      expect(json.name).toBe("a-turtle-icon.png")

      const bytes = await readFile(path.join(dir, json.path))
      expect(Buffer.from(bytes).toString()).toBe("png-bytes")
    } finally {
      globalThis.fetch = old
    }
  })

  test("auto falls back to OpenAI when Gemini fails", async () => {
    process.env.GEMINI_API_KEY = "test"
    process.env.OPENAI_API_KEY = "test"
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    const old = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request) => {
      const target = String(url)
      if (target.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("openai-fallback").toString("base64") }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const res = await post({
        prompt: "A turtle icon",
        provider: "auto",
        size: "1024x1024",
        output_format: "png",
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as { provider: string; path: string }
      expect(json.provider).toBe("openai")
      expect(await readFile(path.join(dir, json.path), "utf8")).toBe("openai-fallback")
    } finally {
      globalThis.fetch = old
    }
  })

  test("returns 400 when no image API keys are configured", async () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    const res = await post({
      prompt: "A turtle icon",
      provider: "auto",
      size: "1024x1024",
      output_format: "png",
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain("No image generation API key found")
  })

  test("returns 400 for invalid request body", async () => {
    const res = await post({
      prompt: "",
      provider: "openai",
      size: "1024x1024",
      output_format: "png",
    })
    expect(res.status).toBe(400)
  })

  test("returns provider error message when generation fails", async () => {
    process.env.OPENAI_API_KEY = "test"
    process.env.OPENCODE_DISABLE_DOTENV = "1"

    const old = globalThis.fetch
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: "billing hard limit" } }), {
        status: 402,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof fetch

    try {
      const res = await post({
        prompt: "A turtle icon",
        provider: "openai",
        size: "1024x1024",
        output_format: "png",
      })
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toContain("OpenAI image generation failed (402)")
      expect(json.error).toContain("billing hard limit")
    } finally {
      globalThis.fetch = old
    }
  })
})

describe("GET /file/media/:filename", () => {
  test("serves a generated asset by filename", async () => {
    const mediaDir = path.join(dir, ".trellis", "media")
    await mkdir(mediaDir, { recursive: true })
    await Bun.write(path.join(mediaDir, "sample.png"), new Uint8Array([137, 80, 78, 71]))

    const res = await getMedia("sample.png")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([137, 80, 78, 71])
  })

  test("rejects path traversal in filename", async () => {
    const res = await getMedia("../outside.png")
    expect(res.status).toBe(400)
  })
})

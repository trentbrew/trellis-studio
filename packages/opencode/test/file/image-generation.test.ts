import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { annotate, generate, resetEnvCache, save } from "../../src/file/image-generation"

const prev = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  provider: process.env.IMAGE_PROVIDER,
  disableDotenv: process.env.OPENCODE_DISABLE_DOTENV,
}

let root = ""

afterEach(async () => {
  process.env.OPENAI_API_KEY = prev.openai
  process.env.GEMINI_API_KEY = prev.gemini
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = prev.google
  process.env.IMAGE_PROVIDER = prev.provider
  process.env.OPENCODE_DISABLE_DOTENV = prev.disableDotenv
  resetEnvCache()
  if (root) await rm(root, { recursive: true, force: true })
  root = ""
})

test("generate decodes OpenAI base64 image response", async () => {
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  process.env.OPENAI_API_KEY = "test"
  const old = globalThis.fetch
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body)).model).toBe("gpt-image-2")
    return new Response(
      JSON.stringify({
        data: [{ b64_json: Buffer.from("image bytes").toString("base64") }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const img = await generate({ prompt: "A turtle icon", provider: "openai" })
    expect(Buffer.from(img.bytes).toString()).toBe("image bytes")
    expect(img.ext).toBe("png")
    expect(img.mime).toBe("image/png")
    expect(img.provider).toBe("openai")
  } finally {
    globalThis.fetch = old
  }
})

test("generate decodes Gemini inline image response", async () => {
  delete process.env.OPENAI_API_KEY
  process.env.GEMINI_API_KEY = "test"
  const old = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    expect(String(url)).toContain("gemini-2.5-flash-image:generateContent")
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("image bytes").toString("base64") } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const img = await generate({ prompt: "A turtle icon", provider: "gemini" })
    expect(Buffer.from(img.bytes).toString()).toBe("image bytes")
    expect(img.provider).toBe("gemini")
  } finally {
    globalThis.fetch = old
  }
})

test("auto prefers Gemini when both keys are available", async () => {
  root = await mkdtemp(path.join(tmpdir(), "image-generation-"))
  await writeFile(path.join(root, ".env"), "GEMINI_API_KEY=test\nOPENAI_API_KEY=test\n")
  const cwd = process.cwd()
  process.chdir(root)

  const old = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    expect(String(url)).toContain("generativelanguage.googleapis.com")
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("gemini").toString("base64") } }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const img = await generate({ prompt: "A turtle icon" })
    expect(Buffer.from(img.bytes).toString()).toBe("gemini")
    expect(img.provider).toBe("gemini")
  } finally {
    globalThis.fetch = old
    process.chdir(cwd)
  }
})

test("generate throws when no API keys are configured", async () => {
  delete process.env.OPENAI_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  process.env.OPENCODE_DISABLE_DOTENV = "1"
  resetEnvCache()

  await expect(generate({ prompt: "A turtle icon", provider: "auto" })).rejects.toThrow(
    "No image generation API key found",
  )
})

test("auto falls back to OpenAI when Gemini fails", async () => {
  process.env.GEMINI_API_KEY = "test"
  process.env.OPENAI_API_KEY = "test"
  const old = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request) => {
    const target = String(url)
    if (target.includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })
    }
    expect(target).toContain("/images/generations")
    return new Response(
      JSON.stringify({
        data: [{ b64_json: Buffer.from("openai bytes").toString("base64") }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  try {
    const img = await generate({ prompt: "A turtle icon" })
    expect(Buffer.from(img.bytes).toString()).toBe("openai bytes")
    expect(img.provider).toBe("openai")
  } finally {
    globalThis.fetch = old
  }
})

test("save writes generated asset under .trellis media", async () => {
  root = await mkdtemp(path.join(tmpdir(), "image-generation-"))
  const asset = await save(
    root,
    {
      bytes: new TextEncoder().encode("image bytes"),
      ext: "png",
      mime: "image/png",
      model: "gpt-image-2",
      prompt: "A turtle icon",
      provider: "openai",
    },
    { prompt: "A turtle icon" },
  )

  expect(asset.path).toBe(path.join(".trellis", "media", "a-turtle-icon.png"))
  expect(await readFile(path.join(root, asset.path), "utf8")).toBe("image bytes")
})

test("annotate stores generated prompt metadata", async () => {
  root = await mkdtemp(path.join(tmpdir(), "image-generation-"))
  const asset = await save(
    root,
    {
      bytes: new TextEncoder().encode("image bytes"),
      ext: "png",
      mime: "image/png",
      model: "gemini-2.5-flash-image",
      prompt: "A turtle icon",
      provider: "gemini",
    },
    { prompt: "A turtle icon", name: "Turtle Icon" },
  )

  await annotate(root, asset, { prompt: "A turtle icon", name: "Turtle Icon" })

  const file = path.join(root, ".trellis", "media", "descriptions.json")
  const cache = JSON.parse(await readFile(file, "utf8"))
  expect(cache[asset.path].title).toBe("Turtle Icon")
  expect(cache[asset.path].alt).toBe("A turtle icon")
  expect(cache[path.join(root, asset.path)].title).toBe("Turtle Icon")
})

import z from "zod"
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { Instance } from "../project/instance"

export const ImageInput = z.object({
  prompt: z.string().trim().min(1).max(32_000),
  name: z.string().trim().min(1).max(120).optional(),
  provider: z.enum(["auto", "openai", "gemini"]).optional(),
  model: z.string().trim().min(1).optional(),
  size: z
    .string()
    .trim()
    .regex(/^(auto|\d{2,5}x\d{2,5})$/)
    .optional(),
  quality: z.enum(["auto", "low", "medium", "high"]).optional(),
  background: z.enum(["auto", "opaque", "transparent"]).optional(),
  moderation: z.enum(["auto", "low"]).optional(),
  output_format: z.enum(["png", "jpeg", "webp"]).optional(),
  output_compression: z.number().int().min(0).max(100).optional(),
})

export type ImageInput = z.infer<typeof ImageInput>

type Result = {
  bytes: Uint8Array
  ext: string
  mime: string
  model: string
  prompt: string
  provider: "openai" | "gemini"
  usage?: unknown
}

type Keys = {
  openai?: string
  gemini?: string
}

const mime = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

const geminiNames = [
  "OPENCODE_GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "ZEN_IMAGE_GEMINI_API_KEY",
]

const envCache = new Map<string, { mtime: number; env: Record<string, string> }>()

function clean(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function ext(format: ImageInput["output_format"]) {
  if (format === "jpeg") return "jpg"
  return format ?? "png"
}

function filename(input: ImageInput, format: ImageInput["output_format"]) {
  const base = clean(input.name ?? input.prompt) || "generated-image"
  return `${base}.${ext(format)}`
}

async function unique(dir: string, name: string) {
  const parsed = path.parse(name)
  for (let i = 0; i < 1_000; i++) {
    const next = i === 0 ? name : `${parsed.name}-${i + 1}${parsed.ext}`
    if (!existsSync(path.join(dir, next))) return next
  }
  throw new Error("Could not create a unique image filename")
}

const OPENAI_IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"] as const

function envRoots() {
  const roots: string[] = []
  try {
    roots.push(Instance.directory)
  } catch {}
  const cwd = process.cwd()
  if (!roots.includes(cwd)) roots.push(cwd)
  return roots
}

function envFiles() {
  const seen = new Set<string>()
  const files: string[] = []
  for (const dir of envRoots()) {
    let current = path.resolve(dir)
    while (true) {
      const file = path.join(current, ".env")
      if (!seen.has(file)) {
        seen.add(file)
        files.push(file)
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return files
}

async function readEnv(file: string) {
  const stat = await Bun.file(file).stat().catch(() => null)
  const mtime = stat?.mtimeMs ?? 0
  const hit = envCache.get(file)
  if (hit && hit.mtime === mtime) return hit.env
  const env = Object.fromEntries(
    (
      await Bun.file(file)
        .text()
        .catch(() => "")
    )
      .split(/\r?\n/)
      .flatMap((line) => {
        const text = line.trim().replace(/^export\s+/, "")
        if (!text || text.startsWith("#")) return []
        const index = text.indexOf("=")
        if (index === -1) return []
        const name = text.slice(0, index).trim()
        const raw = text.slice(index + 1).trim()
        const value =
          (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
            ? raw.slice(1, -1)
            : raw
        return [[name, value]]
      }),
  )
  envCache.set(file, { mtime, env })
  return env
}

async function keys() {
  const out: Keys = {}
  if (process.env.OPENAI_API_KEY) out.openai = process.env.OPENAI_API_KEY

  const gemini = geminiNames.map((name) => process.env[name]).find(Boolean)
  if (gemini) out.gemini = gemini

  if (process.env.OPENCODE_DISABLE_DOTENV) return out

  for (const file of envFiles()) {
    const env = await readEnv(file)
    if (!out.openai && env.OPENAI_API_KEY) out.openai = env.OPENAI_API_KEY
    if (!out.gemini) {
      const found = geminiNames.map((name) => env[name]).find(Boolean)
      if (found) out.gemini = found
    }
  }

  return out
}

function pick(input: ImageInput, key: Keys): "openai" | "gemini" {
  const pref = input.provider ?? process.env.IMAGE_PROVIDER ?? "auto"
  if (pref === "openai") {
    if (!key.openai) throw new Error("OPENAI_API_KEY is required for OpenAI image generation")
    return "openai"
  }
  if (pref === "gemini") {
    if (!key.gemini) throw new Error("GEMINI_API_KEY is required for Gemini image generation")
    return "gemini"
  }
  if (key.gemini) return "gemini"
  if (key.openai) return "openai"
  throw new Error(
    "No image generation API key found. Set GEMINI_API_KEY or OPENAI_API_KEY in your project .env or shell environment.",
  )
}

function openaiModels(input: ImageInput) {
  const preferred = input.model ?? process.env.OPENAI_IMAGE_MODEL ?? OPENAI_IMAGE_MODELS[0]
  const rest = OPENAI_IMAGE_MODELS.filter((model) => model !== preferred)
  return [preferred, ...rest]
}

function openaiRequest(input: ImageInput, model: string) {
  const format = input.output_format ?? "png"
  return Object.fromEntries(
    Object.entries({
      model,
      prompt: input.prompt,
      n: 1,
      size: input.size ?? "1024x1024",
      quality: input.quality ?? "auto",
      background: input.background ?? "auto",
      moderation: input.moderation ?? "auto",
      output_format: format,
      output_compression: format === "png" ? undefined : input.output_compression,
    }).filter(([, value]) => value !== undefined),
  )
}

async function message(res: Response) {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    return json.error?.message ?? json.message ?? text
  } catch {
    return text
  }
}

function partData(part: Record<string, unknown>) {
  const inline = (part.inlineData ?? part.inline_data) as { mimeType?: string; mime_type?: string; data?: string } | undefined
  if (!inline?.data) return undefined
  const type = inline.mimeType ?? inline.mime_type ?? "image/png"
  const next = type.includes("jpeg")
    ? "jpg"
    : type.includes("webp")
      ? "webp"
      : type.includes("png")
        ? "png"
        : "png"
  return {
    bytes: new Uint8Array(Buffer.from(inline.data, "base64")),
    ext: next,
    mime: type,
  }
}

async function openai(input: ImageInput, key: string, signal?: AbortSignal): Promise<Result> {
  const url = `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/images/generations`
  const format = input.output_format ?? "png"
  let res: Response | undefined
  let model = openaiModels(input)[0]!

  for (const candidate of openaiModels(input)) {
    model = candidate
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(openaiRequest(input, candidate)),
    })
    if (res.ok) break
    const detail = await message(res)
    const missing = res.status === 404 && /model/i.test(detail)
    if (missing && candidate !== openaiModels(input).at(-1)) continue
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `OpenAI image generation failed (${res.status}): invalid or expired OPENAI_API_KEY. Update the key in your project .env.`,
      )
    }
    throw new Error(`OpenAI image generation failed (${res.status}): ${detail}`)
  }

  if (!res?.ok) throw new Error("OpenAI image generation failed")

  const body = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[]
    usage?: unknown
  }
  const item = body.data?.[0]

  if (item?.b64_json) {
    return {
      bytes: new Uint8Array(Buffer.from(item.b64_json, "base64")),
      ext: ext(format),
      mime: mime[ext(format) as keyof typeof mime],
      model,
      prompt: input.prompt,
      provider: "openai",
      usage: body.usage,
    }
  }

  if (item?.url) {
    const asset = await fetch(item.url, { signal })
    if (!asset.ok) throw new Error(`OpenAI image download failed (${asset.status})`)
    const bytes = new Uint8Array(await asset.arrayBuffer())
    const type = asset.headers.get("content-type") ?? mime[ext(format) as keyof typeof mime]
    const next = type.includes("jpeg")
      ? "jpg"
      : type.includes("webp")
        ? "webp"
        : type.includes("png")
          ? "png"
          : ext(format)
    return {
      bytes,
      ext: next,
      mime: type,
      model,
      prompt: input.prompt,
      provider: "openai",
      usage: body.usage,
    }
  }

  throw new Error("OpenAI image generation returned no image data")
}

function geminiImage(body: {
  candidates?: { content?: { parts?: Record<string, unknown>[] } }[]
  usageMetadata?: unknown
}) {
  for (const part of body.candidates?.[0]?.content?.parts ?? []) {
    const img = partData(part)
    if (img) return img
  }
}

async function gemini(input: ImageInput, key: string, signal?: AbortSignal, retry = false): Promise<Result> {
  const model = input.model ?? process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const prompt = retry ? `${input.prompt}\n\nGenerate an image only.` : input.prompt
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  })

  if (!res.ok) throw new Error(`Gemini image generation failed (${res.status}): ${await message(res)}`)

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: Record<string, unknown>[] } }[]
    usageMetadata?: unknown
  }

  const img = geminiImage(body)
  if (!img) {
    if (!retry) return gemini(input, key, signal, true)
    throw new Error("Gemini image generation returned no image data")
  }

  return {
    bytes: img.bytes,
    ext: input.output_format ? ext(input.output_format) : img.ext,
    mime: input.output_format ? mime[ext(input.output_format) as keyof typeof mime] : img.mime,
    model,
    prompt: input.prompt,
    provider: "gemini",
    usage: body.usageMetadata,
  }
}

export async function generate(input: ImageInput, signal?: AbortSignal): Promise<Result> {
  const key = await keys()
  const provider = pick(input, key)
  const explicitGemini = input.provider === "gemini"
  const explicitOpenai = input.provider === "openai"

  if (provider === "gemini") {
    try {
      return await gemini(input, key.gemini!, signal)
    } catch (err) {
      if (explicitGemini || !key.openai) throw err
      return openai(input, key.openai, signal)
    }
  }

  try {
    return await openai(input, key.openai!, signal)
  } catch (err) {
    if (explicitOpenai || !key.gemini) throw err
    return gemini(input, key.gemini, signal)
  }
}

export async function save(root: string, img: Result, input: ImageInput) {
  const dir = path.join(root, ".trellis", "media")
  await mkdir(dir, { recursive: true })
  const name = await unique(dir, filename(input, img.ext === "jpg" ? "jpeg" : (img.ext as ImageInput["output_format"])))
  const abs = path.join(dir, name)
  await writeFile(abs, img.bytes)
  return {
    path: path.relative(root, abs),
    name,
    ext: img.ext,
    category: "image",
    size: img.bytes.byteLength,
    model: img.model,
    prompt: img.prompt,
    provider: img.provider,
  }
}

export async function annotate(root: string, asset: Awaited<ReturnType<typeof save>>, input: ImageInput) {
  const dir = path.join(root, ".trellis", "media")
  const file = path.join(dir, "descriptions.json")
  const cache = await readFile(file, "utf8")
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => ({} as Record<string, unknown>))
  const abs = path.join(root, asset.path)
  const meta = {
    title: input.name,
    alt: input.prompt,
    description: `Generated with ${asset.provider}/${asset.model}: ${input.prompt}`,
  }
  cache[asset.path] = meta
  cache[abs] = meta
  await mkdir(dir, { recursive: true })
  await writeFile(file, JSON.stringify(cache, null, 2))
  return meta
}

export function resetEnvCache() {
  envCache.clear()
}

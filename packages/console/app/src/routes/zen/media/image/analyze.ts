import type { APIEvent } from "@solidjs/start/server"
import { Resource } from "@opencode-ai/console-resource"
import { z } from "zod"

const Input = z.object({
  filename: z.string().optional(),
  mime: z.string(),
  data: z.string(),
  prompt: z.string().optional(),
})

const limit = 4 * 1024 * 1024
const daily = 25

export async function POST(input: APIEvent) {
  const ip =
    input.request.headers.get("cf-connecting-ip") ??
    input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    input.request.headers.get("x-real-ip") ??
    "unknown"
  const now = new Date().toISOString().slice(0, 10)
  const key = `media:image:${now}:${await hash(ip)}`
  const count = Number((await Resource.GatewayKv.get(key)) ?? "0")
  if (count >= daily) return json({ error: "rate_limited", message: "Image analysis daily limit exceeded" }, 429)

  const parsed = Input.safeParse(await input.request.json().catch(() => undefined))
  if (!parsed.success) return json({ error: "invalid_request", message: "Invalid image analysis request" }, 400)
  const body = parsed.data
  if (!body.data) return json({ error: "invalid_request", message: "Missing image data" }, 400)
  if (!body.data.match(/^[A-Za-z0-9+/=]+$/))
    return json({ error: "invalid_request", message: "Invalid image data" }, 400)
  if (!body.data.length || Math.ceil((body.data.length * 3) / 4) > limit) {
    return json({ error: "too_large", message: "Image is too large" }, 413)
  }
  if (!image(body.mime)) return json({ error: "unsupported_media", message: "Unsupported image MIME type" }, 415)

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": Resource.ZEN_IMAGE_GEMINI_API_KEY.value,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: body.prompt ?? prompt() }, { inlineData: { mimeType: body.mime, data: body.data } }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    }),
  })

  if (!res.ok) return json({ error: "gemini_failed", message: "Gemini image analysis failed" }, 502)

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates
    ?.flatMap((item) => item.content?.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim()
  if (!text) return json({ error: "empty_analysis", message: "Gemini returned no image analysis" }, 502)

  await Resource.GatewayKv.put(key, String(count + 1), { expirationTtl: 172800 })
  return json({ text, model: model() })
}

function image(mime: string) {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet"
}

function model() {
  return "gemini-2.5-flash"
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

async function hash(text: string) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(raw), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function prompt() {
  return [
    "Analyze this attachment for a coding assistant.",
    "If this is a static image, describe visible text, UI elements, objects, layout, errors, diagrams, code snippets, and anything uncertain.",
    "If this is a GIF or animation, describe the sequence of events, transitions, and key frames in detail.",
    "Be detailed but clear. Include information that helps an agent act on the visual data without seeing it.",
  ].join(" ")
}

import { Instance } from "../project/instance"
import { Log } from "../util/log"
import path from "path"
import { existsSync } from "fs"

export const MAX_SPEECH_CHARS = 8_000
export const EDGE_CHUNK_CHARS = 2_000
export const DEFAULT_EDGE_VOICE = "en-US-AriaNeural"
export const DEFAULT_GEMINI_VOICE = "Kore"
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"

const log = Log.create({ service: "tts" })

const GEMINI_KEY_NAMES = [
  "OPENCODE_GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "ZEN_IMAGE_GEMINI_API_KEY",
] as const

export type SpeakInput = {
  text: string
  voice?: string
  rate?: string
  pitch?: string
}

export type SpeechResult = {
  body: Uint8Array
  mime: "audio/mpeg" | "audio/wav"
  provider: "gemini" | "edge"
}

const envCache = new Map<string, Record<string, string>>()

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, label = "synthesis") {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0) log.debug(`${label} retry`, { attempt: i + 1, max: attempts })
      return await fn()
    } catch (err) {
      last = err
      log.warn(`${label} attempt failed`, {
        attempt: i + 1,
        max: attempts,
        error: err instanceof Error ? err.message : String(err),
      })
      if (i < attempts - 1) await sleep(300 * (i + 1))
    }
  }
  throw last
}

function envFiles() {
  const dirs = new Set<string>()
  try {
    dirs.add(Instance.directory)
  } catch {}
  dirs.add(process.cwd())
  return Array.from(dirs).flatMap((dir) => {
    const result: string[] = []
    let current = path.resolve(dir)
    while (true) {
      result.push(path.join(current, ".env"))
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  })
}

async function readEnv(file: string) {
  const hit = envCache.get(file)
  if (hit) return hit
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
  envCache.set(file, env)
  return env
}

export async function geminiApiKey() {
  for (const name of GEMINI_KEY_NAMES) {
    const value = process.env[name]
    if (value) {
      log.debug("gemini key found in env", { name })
      return value
    }
  }
  if (process.env.OPENCODE_DISABLE_DOTENV) {
    log.debug("gemini key lookup skipped", { reason: "OPENCODE_DISABLE_DOTENV" })
    return undefined
  }
  for (const file of envFiles()) {
    if (!existsSync(file)) continue
    const env = await readEnv(file)
    const found = GEMINI_KEY_NAMES.map((name) => env[name]).find(Boolean)
    if (found) {
      log.debug("gemini key found in dotenv", { file })
      return found
    }
  }
  log.debug("no gemini key found")
  return undefined
}

export function stripMarkdown(text: string) {
  let next = text
  next = next.replace(/```[\s\S]*?```/g, " ")
  next = next.replace(/`([^`]+)`/g, "$1")
  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  next = next.replace(/^#{1,6}\s+/gm, "")
  next = next.replace(/^\s*[-*+]\s+/gm, "")
  next = next.replace(/^\s*\d+\.\s+/gm, "")
  next = next.replace(/[*_~>#|]/g, "")
  next = next.replace(/\s+/g, " ").trim()
  return next
}

export function prepareSpeechText(text: string) {
  const plain = stripMarkdown(text.trim())
  if (!plain) return ""
  if (plain.length <= MAX_SPEECH_CHARS) return plain
  return plain.slice(0, MAX_SPEECH_CHARS).trim()
}

export function chunkText(text: string, max = EDGE_CHUNK_CHARS) {
  if (text.length <= max) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > max) {
    let split = rest.lastIndexOf(". ", max)
    if (split < max * 0.4) split = rest.lastIndexOf(" ", max)
    if (split < max * 0.4) split = max
    chunks.push(rest.slice(0, split).trim())
    rest = rest.slice(split).trim()
  }
  if (rest) chunks.push(rest)
  return chunks.filter(Boolean)
}

export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  write(0, "RIFF")
  view.setUint32(4, 36 + pcm.byteLength, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  write(36, "data")
  view.setUint32(40, pcm.byteLength, true)
  const wav = new Uint8Array(44 + pcm.byteLength)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcm, 44)
  return wav
}

function concat(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function edgeModule() {
  return import("msedge-tts")
}

async function streamEdge(text: string, voice: string, prosody: { rate?: string; pitch?: string }) {
  log.debug("edge stream start", { voice, chars: text.length, prosody })
  const timer = log.time("edge stream")
  const { MsEdgeTTS, OUTPUT_FORMAT } = await edgeModule()
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = tts.toStream(text, prosody as any)
  const chunks: Uint8Array[] = []
  let total = 0
  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (chunk: Buffer) => {
      const u8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      chunks.push(u8)
      total += u8.byteLength
    })
    audioStream.on("end", () => resolve())
    audioStream.on("error", (err: Error) => reject(err))
  })
  tts.close()
  timer.stop()
  if (total < 16) throw new Error("Edge TTS returned no audio")
  log.debug("edge stream done", { bytes: total })
  return concat(chunks)
}

async function synthesizeEdge(input: SpeakInput) {
  const voice = input.voice || DEFAULT_EDGE_VOICE
  const prosody: { rate?: string; pitch?: string } = {}
  if (input.rate) prosody.rate = input.rate
  if (input.pitch) prosody.pitch = input.pitch
  const text = prepareSpeechText(input.text)
  if (!text) throw new Error("No speakable text")
  const parts = chunkText(text)
  log.info("edge synthesis", {
    voice,
    inputChars: input.text.length,
    speakChars: text.length,
    chunks: parts.length,
  })
  const audio = await retry(
    async () => {
      const chunks: Uint8Array[] = []
      for (const [index, part] of parts.entries()) {
        log.debug("edge chunk", { index: index + 1, total: parts.length, chars: part.length })
        chunks.push(await streamEdge(part, voice, prosody))
      }
      return concat(chunks)
    },
    3,
    "edge",
  )
  log.info("edge synthesis complete", { bytes: audio.byteLength })
  return { body: audio, mime: "audio/mpeg" as const, provider: "edge" as const }
}

async function synthesizeGemini(input: SpeakInput, key: string) {
  const text = prepareSpeechText(input.text)
  if (!text) throw new Error("No speakable text")
  const voice = input.voice || DEFAULT_GEMINI_VOICE
  log.info("gemini synthesis", {
    model: GEMINI_TTS_MODEL,
    voice,
    inputChars: input.text.length,
    speakChars: text.length,
  })
  const timer = log.time("gemini synthesis")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }),
  })
  if (!res.ok) {
    const message = await res.text()
    log.warn("gemini request failed", { status: res.status, body: message.slice(0, 240) })
    throw new Error(`Gemini TTS failed (${res.status}): ${message.slice(0, 240)}`)
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[]
  }
  const part = json.candidates?.[0]?.content?.parts?.[0] as
    | { inlineData?: { data?: string }; inline_data?: { data?: string } }
    | undefined
  const encoded = part?.inlineData?.data ?? part?.inline_data?.data
  if (!encoded) {
    log.warn("gemini response missing audio", { candidates: json.candidates?.length ?? 0 })
    throw new Error("Gemini TTS returned no audio")
  }
  const pcm = Uint8Array.from(Buffer.from(encoded, "base64"))
  if (pcm.byteLength < 16) throw new Error("Gemini TTS returned empty audio")
  timer.stop()
  log.info("gemini synthesis complete", { pcmBytes: pcm.byteLength })
  return { body: pcmToWav(pcm), mime: "audio/wav" as const, provider: "gemini" as const }
}

function providerPref() {
  return (process.env.TTS_PROVIDER ?? "auto").toLowerCase()
}

export async function synthesizeSpeech(input: SpeakInput): Promise<SpeechResult> {
  const pref = providerPref()
  const key = await geminiApiKey()
  log.info("synthesis requested", {
    providerPref: pref,
    hasGeminiKey: !!key,
    inputChars: input.text.length,
    speakChars: prepareSpeechText(input.text).length,
    voice: input.voice,
  })

  if (pref === "edge") {
    log.debug("using edge provider", { reason: "TTS_PROVIDER=edge" })
    return synthesizeEdge(input)
  }
  if (pref === "gemini") {
    if (!key) throw new Error("GEMINI_API_KEY is required when TTS_PROVIDER=gemini")
    log.debug("using gemini provider", { reason: "TTS_PROVIDER=gemini" })
    return retry(() => synthesizeGemini(input, key), 3, "gemini")
  }

  if (key) {
    try {
      log.debug("using gemini provider", { reason: "auto with key" })
      return await retry(() => synthesizeGemini(input, key), 3, "gemini")
    } catch (err) {
      log.warn("gemini failed, falling back to edge", {
        error: err instanceof Error ? err.message : String(err),
      })
      return retry(() => synthesizeEdge(input), 3, "edge")
    }
  }

  log.debug("using edge provider", { reason: "auto without key" })
  return retry(() => synthesizeEdge(input), 3, "edge")
}

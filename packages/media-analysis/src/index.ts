import path from "path"

export type Source = "local" | "cloud" | "unavailable"
export type Kind = "image" | "audio" | "video" | "document"

export type Result = {
  text: string
  source: Source
  kind?: Kind
  model?: string
  elapsed: number
  reason?: string
}

export type Input = {
  bytes: Buffer
  mime: string
  filename?: string
  prompt?: string
  signal?: AbortSignal
}

export type LocalFn = (input: Input) => Promise<Result | undefined>
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export type AnalyzeOptions = {
  policy?: "auto" | "local" | "cloud" | "off"
  allow_cloud?: boolean
  cloud?: string
  cloud_model?: string
  endpoint?: string
  gemini_api_key?: string
  timeout_ms?: number
  max_bytes?: number
  disable_dotenv?: boolean
  dirs?: string[]
  fetch?: FetchFn
  local?: LocalFn
}

const version = "media-v1"
const cache = new Map<string, Result>()
const files = new Map<string, Record<string, string>>()
const endpoint = "https://opencode.ai/zen/media/image/analyze"
const maxBytes = 20 * 1024 * 1024
const timeout = 120_000
const base = "https://generativelanguage.googleapis.com/v1beta"
const upload = "https://generativelanguage.googleapis.com/upload/v1beta/files"
const retryAttempts = 3
const retryBaseMs = 300
const ua = "opencode-media-analysis/1.0.0"

const documents = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
])

const log = {
  info: (...a: unknown[]) => debug("info", a),
  warn: (...a: unknown[]) => debug("warn", a),
  debug: (...a: unknown[]) => debug("debug", a),
}

function debug(level: string, args: unknown[]) {
  if (!process.env.MEDIA_ANALYSIS_DEBUG) return
  console[level === "info" ? "log" : level === "warn" ? "warn" : "debug"](`[media-analysis]`, ...args)
}

export function image(mime: string) {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet"
}

export function kind(mime: string): Kind | undefined {
  if (image(mime)) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (documents.has(mime)) return "document"
  return undefined
}

export function supported(mime: string) {
  return kind(mime) !== undefined
}

export function resetCache() {
  cache.clear()
  files.clear()
}

export function text(input: { filename?: string; result: Result }) {
  const name = input.filename ?? "unnamed-attachment"
  const source =
    input.result.source === "cloud" ? `cloud ${input.result.model ?? "turtlecode-gemini"}` : input.result.source
  return [
    "[[ ATTACHMENT ANALYSIS REPORT ]]",
    `Target Identifier: ${name}`,
    `Attachment Type: ${input.result.kind ?? "media"}`,
    `Analysis Source: ${source}`,
    "Processing Status: FINAL / COMPLETE (DO NOT RE-READ OR SEARCH)",
    "",
    "--------------------------------------------------------------------------------",
    "CRITICAL INSTRUCTION FOR AI AGENT:",
    "The source file for this attachment may not be available on the local filesystem.",
    "The following description is your primary access to this attachment's content.",
    "Do not re-read, search for, or inspect this file unless the user explicitly asks you to.",
    "Use the information below to answer the user's request immediately.",
    "--------------------------------------------------------------------------------",
    "",
    "### MEDIA DESCRIPTION:",
    input.result.text,
    "",
    "[[ END OF REPORT ]]",
  ].join("\n")
}

function hash(input: Input) {
  const data = Buffer.concat([Buffer.from(`${version}\0${input.mime}\0${input.prompt ?? ""}\0`), input.bytes])
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function transientStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function retryable(err: unknown) {
  if (err instanceof TransientHttpError) return true
  if (err instanceof Error) return /\b(429|502|503|504)\b/.test(err.message)
  return false
}

class TransientHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function retryTransient<T>(fn: () => Promise<T>, label: string, signal?: AbortSignal) {
  let last: unknown
  for (let i = 0; i < retryAttempts; i++) {
    try {
      if (i > 0) log.debug(`${label} retry`, { attempt: i + 1, max: retryAttempts })
      return await fn()
    } catch (err) {
      last = err
      const again = retryable(err) && i < retryAttempts - 1
      log.warn(`${label} attempt failed`, { attempt: i + 1, max: retryAttempts, retryable: again })
      if (!again) throw err
      const wait = retryBaseMs * (i + 1)
      if (signal) await sleep(wait, signal)
      else await sleepMs(wait)
    }
  }
  throw last
}

function fetchTransient(
  doFetch: FetchFn,
  url: string,
  init: RequestInit | undefined,
  label: string,
  signal?: AbortSignal,
) {
  return retryTransient(
    async () => {
      const res = await doFetch(url, init)
      if (!res.ok && transientStatus(res.status)) {
        const body = await res.text().catch(() => "")
        throw new TransientHttpError(res.status, `${label}: ${res.status} ${res.statusText} - ${body}`)
      }
      return res
    },
    label,
    signal,
  )
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function sleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

function fileApi(input: Input, type: Kind) {
  if (input.mime === "image/gif") return true
  return type !== "image"
}

function geminiText(json: unknown) {
  const data = json as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return data.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim()
}

function unavailable(start: number, type: Kind | undefined, reason: string): Result {
  return {
    text: `${label(type)} analysis unavailable: ${reason}`,
    source: "unavailable",
    kind: type,
    elapsed: Date.now() - start,
    reason,
  }
}

function label(type: Kind | undefined) {
  if (!type) return "Media"
  return type[0].toUpperCase() + type.slice(1)
}

function prompt(type: Kind) {
  const base = [
    "Analyze this attachment for a coding assistant.",
    "Be detailed but clear. Include information that helps an agent act on the attachment without opening it.",
  ]
  if (type === "image")
    return [
      ...base,
      "Describe visible text, UI elements, objects, layout, errors, diagrams, code snippets, and anything uncertain.",
      "If this is animated, describe the sequence of events, transitions, and key frames in detail.",
    ].join(" ")
  if (type === "audio")
    return [
      ...base,
      "Transcribe important speech where possible, identify speakers when apparent, and describe music, sound effects, tone, timing, and any unclear sections.",
    ].join(" ")
  if (type === "video")
    return [
      ...base,
      "Describe the visual sequence, notable timestamps or ordering, on-screen text, UI interactions, objects, motion, scene changes, and any speech or audio cues.",
    ].join(" ")
  return [
    ...base,
    "Summarize the document's text, structure, layout, tables, charts, diagrams, images, key facts, and any formatting that affects interpretation.",
  ].join(" ")
}

function envNames() {
  return ["OPENCODE_GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "ZEN_IMAGE_GEMINI_API_KEY"]
}

function envFiles(dirs: string[] = []) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const dir of dirs) {
    if (!dir) continue
    let current = path.resolve(dir)
    while (true) {
      const file = path.join(current, ".env")
      if (!seen.has(file)) {
        seen.add(file)
        result.push(file)
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return result
}

async function readEnv(file: string): Promise<Record<string, string>> {
  const hit = files.get(file)
  if (hit) return hit
  const raw = await Bun.file(file)
    .text()
    .catch(() => "")
  const env: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim().replace(/^export\s+/, "")
    if (!text || text.startsWith("#")) continue
    const idx = text.indexOf("=")
    if (idx === -1) continue
    const name = text.slice(0, idx).trim()
    let value = text.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[name] = value
  }
  files.set(file, env)
  return env
}

async function secret(opts: AnalyzeOptions | undefined, dirs: string[]) {
  const names = envNames()
  const direct = opts?.gemini_api_key ?? names.map((n) => process.env[n]).find(Boolean)
  if (direct) {
    log.info("media-analysis found key in env")
    return direct
  }
  if (process.env.OPENCODE_DISABLE_DOTENV || opts?.disable_dotenv) return undefined
  for (const file of envFiles(dirs)) {
    const env = await readEnv(file)
    const found = names.map((n) => env[n]).find(Boolean)
    if (found) {
      log.info("media-analysis found key in file", { file })
      return found
    }
  }
  log.info("media-analysis no key found")
  return undefined
}

async function direct(
  doFetch: FetchFn,
  input: Input,
  opts: AnalyzeOptions | undefined,
  apiKey: string,
  start: number,
  type: Kind,
) {
  const model = opts?.cloud_model ?? opts?.cloud ?? "gemini-2.5-flash"
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), opts?.timeout_ms ?? timeout)
  const signal = input.signal ? AbortSignal.any([input.signal, ctl.signal]) : ctl.signal
  let file: GeminiFile | undefined
  try {
    file = fileApi(input, type) ? await uploadFile(doFetch, input, apiKey, signal) : undefined
    const url = `${base}/models/${model}:generateContent?key=${apiKey}`
    log.info("media-analysis direct request", { model, mode: file ? "file" : "inline", kind: type })
    const res = await fetchTransient(
      doFetch,
      url,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: input.prompt ?? prompt(type) },
                file
                  ? { fileData: { fileUri: file.uri, mimeType: file.mimeType ?? input.mime } }
                  : { inlineData: { mimeType: input.mime, data: input.bytes.toString("base64") } },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      },
      "Gemini direct API",
      signal,
    )
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Gemini direct API failed: ${res.status} ${res.statusText} - ${body}`)
    }
    const out = geminiText(await res.json())
    if (!out) throw new Error("Gemini direct API returned no text")
    return { text: out, source: "cloud" as const, kind: type, model, elapsed: Date.now() - start }
  } finally {
    clearTimeout(id)
    if (file?.name) doFetch(`${base}/${file.name}?key=${apiKey}`, { method: "DELETE" }).catch(() => {})
  }
}

type GeminiFile = {
  uri?: string
  name?: string
  state?: string
  mimeType?: string
  error?: { message?: string }
}

async function uploadFile(doFetch: FetchFn, input: Input, apiKey: string, signal: AbortSignal) {
  log.info("media-analysis using File API", { filename: input.filename, mime: input.mime })
  const boundary = "-------" + Math.random().toString(16).slice(2)
  const metadata = JSON.stringify({
    file: { displayName: input.filename ?? "attachment", mimeType: input.mime },
  })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from("Content-Type: application/json; charset=UTF-8\r\n\r\n"),
    Buffer.from(`${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Type: ${input.mime}\r\n\r\n`),
    input.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await fetchTransient(
    doFetch,
    `${upload}?key=${apiKey}`,
    {
      method: "POST",
      signal,
      headers: {
        "X-Goog-Upload-Protocol": "multipart",
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    "Gemini File API upload",
    signal,
  )
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error")
    throw new Error(`Gemini File API upload failed: ${res.status} - ${err}`)
  }
  const json = (await res.json()) as { file?: GeminiFile } & GeminiFile
  const f = json.file ?? json
  if (!f.uri || !f.name) throw new Error("Gemini File API returned no file URI")
  return ready(doFetch, f, apiKey, signal)
}

async function ready(doFetch: FetchFn, file: GeminiFile, apiKey: string, signal: AbortSignal): Promise<GeminiFile> {
  if (!file.state || file.state === "ACTIVE") return file
  if (file.state === "FAILED") throw new Error(file.error?.message ?? "Gemini File API processing failed")
  if (file.state !== "PROCESSING" && file.state !== "STATE_UNSPECIFIED") return file
  await sleep(1000, signal)
  const res = await fetchTransient(
    doFetch,
    `${base}/${file.name}?key=${apiKey}`,
    { signal },
    "Gemini File API status",
    signal,
  )
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error")
    throw new Error(`Gemini File API status failed: ${res.status} - ${err}`)
  }
  const next = (await res.json()) as GeminiFile
  return ready(doFetch, { ...file, ...next }, apiKey, signal)
}

async function cloud(doFetch: FetchFn, input: Input, opts: AnalyzeOptions | undefined, start: number, type: Kind) {
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), opts?.timeout_ms ?? timeout)
  const signal = input.signal ? AbortSignal.any([input.signal, ctl.signal]) : ctl.signal
  const url = opts?.endpoint ?? process.env.OPENCODE_MEDIA_ANALYSIS_ENDPOINT ?? (type === "image" ? endpoint : "")
  if (!url) throw new Error("Gemini API key is required for audio, video, and document analysis")
  log.info("media-analysis cloud request", { url })
  const res = await fetchTransient(
    doFetch,
    url,
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "user-agent": ua,
      },
      body: JSON.stringify({
        filename: input.filename,
        mime: input.mime,
        data: input.bytes.toString("base64"),
        prompt: input.prompt ?? prompt(type),
      }),
    },
    `${label(type)} analysis relay`,
    signal,
  ).finally(() => clearTimeout(id))
  log.info("media-analysis cloud response", { status: res.status, statusText: res.statusText })
  if (!res.ok) throw new Error(`${label(type)} analysis relay failed: ${res.status}`)
  const json = (await res.json()) as { text?: unknown; model?: unknown }
  if (typeof json.text !== "string" || !json.text.trim()) {
    throw new Error(`${label(type)} analysis relay returned no text`)
  }
  return {
    text: json.text.trim(),
    source: "cloud" as const,
    kind: type,
    model: typeof json.model === "string" ? json.model : (opts?.cloud_model ?? opts?.cloud ?? "turtlecode-gemini"),
    elapsed: Date.now() - start,
  }
}

export async function analyze(input: Input, opts: AnalyzeOptions = {}): Promise<Result> {
  const start = Date.now()
  const doFetch = opts.fetch ?? fetch
  const policy = opts.policy ?? "auto"
  const max = opts.max_bytes ?? maxBytes
  const type = kind(input.mime)
  const dirs = opts.dirs ?? [process.cwd()]

  if (!type) return unavailable(start, undefined, "Unsupported attachment MIME type")
  if (policy === "off") return unavailable(start, type, `${label(type)} analysis is disabled`)
  if (input.bytes.byteLength > max)
    return unavailable(start, type, `${label(type)} is larger than ${Math.round(max / 1024 / 1024)} MB`)

  const key = hash(input)
  const hit = cache.get(key)
  if (hit) {
    log.info("media-analysis cache hit", { key })
    return { ...hit, elapsed: Date.now() - start }
  }

  log.info("media-analysis starting", { policy, mime: input.mime, bytes: input.bytes.byteLength, kind: type })

  const local =
    policy !== "cloud"
      ? await opts.local?.(input).catch((err) => {
          log.warn("local media analysis failed", { err })
          return undefined
        })
      : undefined
  if (local?.text.trim()) {
    const result = { ...local, kind: local.kind ?? type, source: "local" as const, elapsed: Date.now() - start }
    log.info("media-analysis local success", { source: result.source })
    cache.set(key, result)
    return result
  }

  if (policy === "local" || opts.allow_cloud === false)
    return unavailable(start, type, `Cloud ${type === "image" ? "image" : "media"} analysis is disabled`)

  const apiKey = await secret(opts, dirs)
  log.info("media-analysis secret resolution", { hasKey: !!apiKey })

  const attempt = apiKey
    ? await direct(doFetch, input, opts, apiKey, start, type)
        .then((result) => {
          log.info("media-analysis direct success")
          return { result }
        })
        .catch((err) => {
          log.warn("direct gemini analysis failed", { err })
          return { err }
        })
    : undefined
  if (attempt && "result" in attempt) {
    cache.set(key, attempt.result)
    return attempt.result
  }

  log.info("media-analysis falling back to cloud relay")
  const result = await cloud(doFetch, input, opts, start, type).catch((err) => {
    const directErr = attempt && "err" in attempt ? attempt.err : undefined
    const reason = [directErr, err]
      .filter(Boolean)
      .map((item) => (item instanceof Error ? item.message : String(item)))
      .join("; ")
    log.warn("cloud media analysis failed", { err, reason })
    return unavailable(start, type, reason)
  })
  if (result.source !== "unavailable") {
    log.info("media-analysis cloud success")
    cache.set(key, result)
  }
  return result
}

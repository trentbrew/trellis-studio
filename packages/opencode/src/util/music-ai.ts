import { Env } from "@/env"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import path from "path"

export namespace MusicAI {
  const log = Log.create({ service: "music-ai" })
  const base = "https://api.music.ai/v1"
  const pollMs = 2000
  const timeoutMs = 180_000

  export type MusicMetadata = {
    bpm?: number
    key?: string
    genre?: string[]
    mood?: string[]
    subgenre?: string[]
    energy?: string
    instruments?: string[]
    timeSignature?: string
    musicalEra?: string
    voicePresence?: string
    emotionalProfile?: string
  }

  type Workflow = { slug: string; name: string; description?: string }
  type Job = {
    id: string
    status: "QUEUED" | "STARTED" | "SUCCEEDED" | "FAILED"
    result?: Record<string, string>
    error?: { code?: string; title?: string; message?: string }
  }

  type Fetch = (url: string, init?: RequestInit) => Promise<Response>

  const state: { fetch: Fetch; workflows?: Workflow[] } = { fetch }

  export function configure(input: { fetch?: Fetch }) {
    if (input.fetch) state.fetch = input.fetch
  }

  export function reset() {
    state.fetch = fetch
    state.workflows = undefined
  }

  export async function analyze(bytes: Buffer, mime: string, filename: string): Promise<MusicMetadata | undefined> {
    const key = await secret()
    if (!key) {
      log.info("music-ai skipped: no API key")
      return undefined
    }

    const downloadUrl = await upload(bytes, mime, key)
    const metadata = await runMetadataWorkflow(downloadUrl, key, filename)
    const bpm = await runBpmWorkflow(downloadUrl, key, filename).catch((err) => {
      log.warn("music-ai bpm workflow failed", { err })
      return undefined
    })

    if (!metadata && bpm === undefined) return undefined
    return { ...metadata, bpm: bpm ?? metadata?.bpm }
  }

  async function secret() {
    const names = ["MUSIC_AI_API_KEY"]
    const direct = names.map((name) => Env.get(name)).find(Boolean)
    if (direct) return direct
    if (Env.get("OPENCODE_DISABLE_DOTENV")) return undefined
    for (const file of envs()) {
      const env = await read(file)
      const found = names.map((name) => env[name]).find(Boolean)
      if (found) return found
    }
    return undefined
  }

  function envs() {
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

  const files = new Map<string, Record<string, string>>()

  async function read(file: string) {
    const hit = files.get(file)
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
    files.set(file, env)
    return env
  }

  async function api<T>(key: string, path: string, init?: RequestInit): Promise<T> {
    const res = await state.fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: key,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Music AI ${path} failed: ${res.status} ${body}`)
    }
    return res.json() as Promise<T>
  }

  async function upload(bytes: Buffer, mime: string, key: string): Promise<string> {
    const signed = await api<{ uploadUrl: string; downloadUrl: string }>(key, "/upload")
    const res = await state.fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: new Uint8Array(bytes),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Music AI upload failed: ${res.status} ${body}`)
    }
    return signed.downloadUrl
  }

  async function workflows(key: string) {
    if (state.workflows) return state.workflows
    const listed = await api<{ workflows?: Workflow[] }>(key, "/workflow?size=100")
    state.workflows = listed.workflows ?? []
    return state.workflows
  }

  function pickWorkflow(list: Workflow[], patterns: RegExp[]) {
    return list.find((item) => patterns.some((pattern) => pattern.test(`${item.name} ${item.description ?? ""}`)))
  }

  async function runMetadataWorkflow(inputUrl: string, key: string, filename: string) {
    const override = Env.get("MUSIC_AI_METADATA_WORKFLOW")
    const list = await workflows(key)
    const workflow =
      (override ? { slug: override, name: "metadata override" } : undefined) ??
      pickWorkflow(list, [/cyanite/i, /musical metadata/i, /metadata suite/i, /extract song metadata/i])
    if (!workflow) {
      log.warn("music-ai metadata workflow not found")
      return undefined
    }
    const result = await runJob(workflow.slug, inputUrl, key, `metadata:${filename}`)
    return parseMetadataResult(result)
  }

  async function runBpmWorkflow(inputUrl: string, key: string, filename: string): Promise<number | undefined> {
    const override = Env.get("MUSIC_AI_BPM_WORKFLOW")
    const list = await workflows(key)
    const workflow =
      (override ? { slug: override, name: "bpm override" } : undefined) ??
      pickWorkflow(list, [/\bbpm\b/i, /beat map/i, /beat detection/i])
    if (!workflow) return undefined
    const result = await runJob(workflow.slug, inputUrl, key, `bpm:${filename}`)
    return parseBpmResult(result)
  }

  async function runJob(workflow: string, inputUrl: string, key: string, name: string) {
    const created = await api<{ id: string }>(key, "/job", {
      method: "POST",
      body: JSON.stringify({ name, workflow, params: { inputUrl } }),
    })
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const job = await api<Job>(key, `/job/${created.id}`)
      if (job.status === "SUCCEEDED") return job.result ?? {}
      if (job.status === "FAILED") {
        throw new Error(job.error?.message ?? job.error?.title ?? "Music AI job failed")
      }
      await sleep(pollMs)
    }
    throw new Error("Music AI job timed out")
  }

  async function sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function parseMetadataResult(result: Record<string, string>): Promise<MusicMetadata | undefined> {
    const advancedUrl = result.advanced ?? result.metadata ?? result.tags ?? Object.values(result)[0]
    if (!advancedUrl) return parseInlineMetadata(result)

    const res = await state.fetch(advancedUrl)
    if (!res.ok) return parseInlineMetadata(result)
    const json = await res.json().catch(() => undefined)
    if (!json || typeof json !== "object") return parseInlineMetadata(result)
    return normalizeCyanite(json as Record<string, unknown>)
  }

  function parseInlineMetadata(result: Record<string, string>): MusicMetadata | undefined {
    const bpm = parseNumber(result.bpm ?? result.tempo)
    const key = clean(result.key ?? result.musicalKey)
    const genre = parseTags(result.genre ?? result.genreTags)
    if (!bpm && !key && !genre?.length) return undefined
    return { bpm, key, genre }
  }

  function parseBpmResult(result: Record<string, string>): number | undefined {
    for (const value of Object.values(result)) {
      if (!value) continue
      if (/^\d+(\.\d+)?$/.test(value.trim())) return parseNumber(value)
      try {
        const json = JSON.parse(value) as Record<string, unknown>
        const bpm = parseNumber(json.bpm ?? json.tempo ?? json.averageBpm)
        if (bpm) return bpm
      } catch {
        const match = value.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/i)
        if (match) return parseNumber(match[1])
      }
    }
    return parseNumber(result.bpm ?? result.tempo)
  }

  function normalizeCyanite(raw: Record<string, unknown>): MusicMetadata {
    return {
      bpm: parseNumber(raw.bpm ?? raw.tempo),
      key: clean(raw.key ?? raw.musicalKey),
      genre: parseTags(raw.genreTags ?? raw.genre),
      mood: parseTags(raw.moodTags ?? raw.mood),
      subgenre: parseTags(raw.subgenreTags ?? raw.subgenre),
      energy: clean(raw.energyLevel ?? raw.energy),
      instruments: parseTags(raw.instrumentTags ?? raw.instruments),
      timeSignature: clean(raw.timeSignature),
      musicalEra: clean(raw.musicalEraTag ?? raw.musicalEra),
      voicePresence: clean(raw.voicePresenceProfile ?? raw.voicePresence),
      emotionalProfile: clean(raw.emotionalProfile),
    }
  }

  function parseTags(value: unknown) {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    }
    if (typeof value !== "string" || !value.trim()) return undefined
    return value
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  function parseNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 10) / 10
    if (typeof value !== "string" || !value.trim()) return undefined
    const match = value.match(/(\d+(?:\.\d+)?)/)
    if (!match) return undefined
    return Math.round(Number(match[1]) * 10) / 10
  }

  function clean(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined
  }
}

import { createHash } from "crypto"
import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { Bus } from "../bus"
import { FileWatcher } from "../file/watcher"
import { Instance } from "../project/instance"
import { Trellis } from "../trellis"
import { GEMINI_TTS_MODEL, prepareSpeechText, type SpeechResult } from "./synthesize"

export type SavedSpeechAsset = {
  path: string
  name: string
  ext: string
  category: "audio"
  kind: "speech"
  size: number
  title: string
  description: string
  transcript: string
  audioContentType: "speech"
  tone: string
  tags: string[]
  analysisSource: string
  analysisModel: string
  analyzedAt: string
}

const FACTS = new Set([
  "type",
  "label",
  "path",
  "name",
  "extension",
  "category",
  "kind",
  "url",
  "mime",
  "size",
  "title",
  "alt",
  "description",
  "semantic.palette",
  "semantic.tone",
  "semantic.tags",
  "semantic.transcript",
  "semantic.audioContentType",
  "semantic.audioAnalysis",
  "semantic.source",
  "semantic.model",
  "semantic.analyzedAt",
  "previewImage",
  "previewFavicon",
  "previewCachedAt",
])

const assetId = (rel: string) => `asset:${rel.replaceAll("\\", "/")}`

const ext = (mime: SpeechResult["mime"]) => (mime === "audio/wav" ? "wav" : "mp3")

const mime = (next: string) => (next === "wav" ? "audio/wav" : "audio/mpeg")

const snippet = (text: string, max = 72) => {
  const plain = text.replace(/\s+/g, " ").trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1).trim()}…`
}

const add = (
  facts: Array<{ e: string; a: string; v: string | number | boolean }>,
  e: string,
  a: string,
  v: string | number | boolean | undefined,
) => {
  if (v === undefined) return
  if (typeof v === "string" && !v.trim()) return
  facts.push({ e, a, v })
}

const assetFacts = (asset: SavedSpeechAsset) => {
  const id = assetId(asset.path)
  const facts: Array<{ e: string; a: string; v: string | number | boolean }> = []
  add(facts, id, "type", "Asset")
  add(facts, id, "label", asset.title)
  add(facts, id, "path", asset.path)
  add(facts, id, "name", asset.name)
  add(facts, id, "extension", asset.ext)
  add(facts, id, "category", asset.category)
  add(facts, id, "kind", asset.kind)
  add(facts, id, "mime", mime(asset.ext))
  add(facts, id, "size", asset.size)
  add(facts, id, "title", asset.title)
  add(facts, id, "description", asset.description)
  add(facts, id, "semantic.tone", asset.tone)
  add(facts, id, "semantic.tags", JSON.stringify(asset.tags))
  add(facts, id, "semantic.transcript", asset.transcript)
  add(facts, id, "semantic.audioContentType", asset.audioContentType)
  add(facts, id, "semantic.source", asset.analysisSource)
  add(facts, id, "semantic.model", asset.analysisModel)
  add(facts, id, "semantic.analyzedAt", asset.analyzedAt)
  return facts
}

const sync = async (asset: SavedSpeechAsset, dir: string, reason: string) => {
  if (!Trellis.storeStats(dir)) return

  try {
    const facts = assetFacts(asset)
    const byEntity = new Map<string, typeof facts>()
    for (const fact of facts) {
      const list = byEntity.get(fact.e) ?? []
      list.push(fact)
      byEntity.set(fact.e, list)
    }

    const assert: typeof facts = []
    const retract: typeof facts = []
    const meta = {
      actor: "design-panel",
      actorKind: "system" as const,
      source: "asset-library",
      reason,
      relatedEntities: [assetId(asset.path)],
    }

    for (const [entity, desired] of byEntity) {
      const current = (Trellis.storeEntity(entity, dir)?.facts ?? []) as Array<{
        e: string
        a: string
        v: string | number | boolean
      }>
      for (const old of current) {
        if (!FACTS.has(old.a)) continue
        if (!desired.some((next) => next.a === old.a && next.v === old.v)) {
          retract.push({ e: old.e, a: old.a, v: old.v as string | number | boolean })
        }
      }
      for (const next of desired) {
        if (!current.some((old) => old.a === next.a && old.v === next.v)) assert.push(next)
      }
    }

    if (retract.length) Trellis.storeRetract(retract, dir, meta)
    if (assert.length) Trellis.storeAssert(assert, dir, meta)
  } catch {
    // graph sync best-effort
  }
}

const cacheMeta = async (dir: string, rel: string, abs: string, meta: Record<string, unknown>) => {
  const file = path.join(dir, "descriptions.json")
  const cache = await readFile(file, "utf8")
    .then((text) => JSON.parse(text) as Record<string, unknown>)
    .catch(() => ({} as Record<string, unknown>))
  cache[rel] = meta
  cache[abs] = meta
  await writeFile(file, JSON.stringify(cache, null, 2))
}

export type SaveSpeechInput = {
  result: SpeechResult
  text: string
  voice?: string
}

export async function saveSpeechAsset(input: SaveSpeechInput, dir?: string): Promise<SavedSpeechAsset | undefined> {
  const root = dir ?? Instance.directory
  const transcript = prepareSpeechText(input.text)
  if (!transcript) return undefined

  const hash = createHash("sha256")
    .update([transcript, input.result.provider, input.voice ?? "", input.result.mime].join("\0"))
    .digest("hex")
    .slice(0, 16)
  const nextExt = ext(input.result.mime)
  const name = `speech-${hash}.${nextExt}`
  const mediaDir = path.join(root, ".trellis", "media")
  await mkdir(mediaDir, { recursive: true })
  const abs = path.join(mediaDir, name)
  const rel = path.relative(root, abs)
  const created = !existsSync(abs)

  if (created) {
    await writeFile(abs, input.result.body)
    try {
      await Bus.publish(FileWatcher.Event.Updated, { file: abs, event: "add" })
    } catch {
      // best-effort when instance context is unavailable
    }
  }

  const title = snippet(transcript)
  const analyzedAt = new Date().toISOString()
  const asset: SavedSpeechAsset = {
    path: rel,
    name,
    ext: nextExt,
    category: "audio",
    kind: "speech",
    size: input.result.body.byteLength,
    title,
    description: `Read-aloud speech synthesized with ${input.result.provider}.`,
    transcript,
    audioContentType: "speech",
    tone: "spoken",
    tags: ["speech", "tts", input.result.provider],
    analysisSource: "tts",
    analysisModel: input.result.provider === "gemini" ? GEMINI_TTS_MODEL : "edge-tts",
    analyzedAt,
  }

  await cacheMeta(mediaDir, rel, abs, {
    title: asset.title,
    alt: asset.title,
    description: asset.description,
    tone: asset.tone,
    tags: asset.tags,
    transcript: asset.transcript,
    audioContentType: asset.audioContentType,
    analysisSource: asset.analysisSource,
    analysisModel: asset.analysisModel,
    analyzedAt: asset.analyzedAt,
  })
  await sync(asset, root, created ? "speech asset saved" : "speech asset synced")
  return asset
}

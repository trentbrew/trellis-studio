import { Hono } from "hono"
import { stream } from "hono/streaming"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { createHash } from "crypto"
import { mkdir, writeFile, readdir, readFile as fsRead, stat, rename as fsRename, rm } from "fs/promises"
import os from "os"
import path from "path"
import { generateText, streamText, type ModelMessage } from "ai"
import { File } from "../../file"
import * as ImageGeneration from "../../file/image-generation"
import * as LinkAsset from "../../file/link-asset"
import { fetchLinkPreview } from "../../file/link-preview"
import { FileWatcher } from "../../file/watcher"
import { Ripgrep } from "../../file/ripgrep"
import { LSP } from "../../lsp"
import { Bus } from "../../bus"
import { Instance } from "../../project/instance"
import { Provider } from "../../provider/provider"
import { ProviderID, ModelID } from "../../provider/schema"
import { Trellis } from "../../trellis"
import { lazy } from "../../util/lazy"
import { AudioEnrichment } from "../../util/audio-enrichment"
import { MediaAnalysis } from "../../util/media-analysis"
import { errors } from "../error"

const MEDIA_EXTS = new Set([
  // images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "tif",
  "avif",
  "heic",
  "heif",
  "apng",
  "jxl",
  // video
  "mp4",
  "m4v",
  "mov",
  "webm",
  "ogv",
  "avi",
  "mkv",
  "flv",
  "wmv",
  "3gp",
  "3g2",
  // audio
  "mp3",
  "wav",
  "ogg",
  "oga",
  "flac",
  "aac",
  "wma",
  "m4a",
  "weba",
  "opus",
  "aif",
  "aiff",
  "mid",
  "midi",
  // documents
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  // archives
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  // fonts
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  // 3d
  "glb",
  "gltf",
  "obj",
  "fbx",
  "usdz",
  "stl",
  "ply",
  "dae",
  "blend",
  "usd",
  "abc",
  // textures
  "hdr",
  "exr",
  "ktx",
  "ktx2",
  "dds",
  "tga",
  "psd",
])

const mediaExt = (file: string) => {
  const e = path.extname(file).toLowerCase().slice(1)
  return MEDIA_EXTS.has(e) ? e : null
}

const MIME: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  apng: "image/apng",
  jxl: "image/jxl",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  wma: "audio/x-ms-wma",
  m4a: "audio/mp4",
  weba: "audio/webm",
  opus: "audio/opus",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  mid: "audio/midi",
  midi: "audio/midi",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "tif",
  "avif",
  "heic",
  "heif",
  "apng",
  "jxl",
])

const mediaCategory = (ext: string) => {
  if (IMAGE_EXTS.has(ext)) return "image"
  if (["glb", "gltf", "obj", "fbx", "usdz", "stl", "ply", "dae", "blend", "usd", "abc"].includes(ext)) return "model3d"
  if (["hdr", "exr", "ktx", "ktx2", "dds", "tga", "psd"].includes(ext)) return "texture"
  if (["mp4", "m4v", "mov", "webm", "ogv", "avi", "mkv", "flv", "wmv", "3gp", "3g2"].includes(ext)) return "video"
  if (
    ["mp3", "wav", "ogg", "oga", "flac", "aac", "wma", "m4a", "weba", "opus", "aif", "aiff", "mid", "midi"].includes(
      ext,
    )
  )
    return "audio"
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "document"
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "archive"
  if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) return "font"
  return "other"
}

const listTurtlecode = async (dir: string, rel: string) => {
  const root = path.resolve(os.homedir(), ".turtlecode")
  const resolved = path.resolve(dir, rel)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return []

  const entries = await readdir(resolved, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.name !== ".DS_Store")
    .map((entry) => {
      const absolute = path.join(resolved, entry.name)
      return {
        name: entry.name,
        path: path.relative(dir, absolute),
        absolute,
        type: entry.isDirectory() ? "directory" : "file",
        ignored: false,
      } satisfies File.Node
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

const descCache = async (dir: string) => {
  const file = path.join(dir, "descriptions.json")
  try {
    return JSON.parse(await fsRead(file, "utf-8")) as Record<string, MediaMetadata | string>
  } catch {
    return {} as Record<string, any>
  }
}

const saveDescCache = async (dir: string, cache: Record<string, any>) => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "descriptions.json"), JSON.stringify(cache, null, 2))
}

type AudioAnalysis = AudioEnrichment.Analysis

type MediaMetadata = {
  title?: string
  alt?: string
  description?: string
  palette?: string[]
  tone?: string
  tags?: string[]
  transcript?: string
  audioContentType?: AudioEnrichment.ContentType
  audioAnalysis?: AudioAnalysis
  analysisSource?: string
  analysisModel?: string
  analyzedAt?: string
  previewImage?: string
  previewFavicon?: string
  previewCachedAt?: string
}

type MediaAsset = MediaMetadata & {
  path: string
  name: string
  ext: string
  category: string
  kind?: string
  url?: string
  size?: number
}

const MediaMetadataSchema = z.object({
  title: z.string().optional(),
  alt: z.string().optional(),
  description: z.string().optional(),
  palette: z.array(z.string()).optional(),
  tone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  transcript: z.string().optional(),
  audioContentType: z.enum(["speech", "music", "sfx", "misc"]).optional(),
  audioAnalysis: z
    .object({
      contentType: z.enum(["speech", "music", "sfx", "misc"]),
      confidence: z.number().optional(),
      bpm: z.number().optional(),
      key: z.string().optional(),
      genre: z.array(z.string()).optional(),
      mood: z.array(z.string()).optional(),
      subgenre: z.array(z.string()).optional(),
      energy: z.string().optional(),
      instruments: z.array(z.string()).optional(),
      timeSignature: z.string().optional(),
      musicalEra: z.string().optional(),
      voicePresence: z.string().optional(),
      emotionalProfile: z.string().optional(),
    })
    .optional(),
  analysisSource: z.string().optional(),
  analysisModel: z.string().optional(),
  analyzedAt: z.string().optional(),
  previewImage: z.string().optional(),
  previewFavicon: z.string().optional(),
  previewCachedAt: z.string().optional(),
})

const MediaAssetSchema = z
  .object({
    path: z.string(),
    name: z.string(),
    ext: z.string(),
    category: z.string(),
    kind: z.string().optional(),
    url: z.string().optional(),
    size: z.number().optional(),
  })
  .merge(MediaMetadataSchema)

const ASSET_FACTS = new Set([
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

const OP_FACTS = new Set(["type", "label", "kind", "tool", "prompt", "model", "provider", "outputPath", "createdAt"])

const assetId = (rel: string) => `asset:${rel.replaceAll("\\", "/")}`

const isLinkAsset = (rel: string) => rel.startsWith(".trellis/assets/links/") && rel.endsWith(".link")

const linkPath = (url: string) => {
  const slug = createHash("sha256").update(url).digest("hex").slice(0, 16)
  return `.trellis/assets/links/${slug}.link`
}

const entityFact = (detail: { facts: Array<{ a: string; v: unknown }> } | undefined, attr: string) =>
  detail?.facts.find((fact) => fact.a === attr)?.v

const parseTags = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    return cleanList(JSON.parse(value), 12)
  } catch {
    return cleanList(value, 12)
  }
}

const parsePalette = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    return cleanList(JSON.parse(value), 8)
  } catch {
    return undefined
  }
}

const entityToAsset = (id: string, dir: string): MediaAsset | undefined => {
  const detail = Trellis.storeEntity(id, dir)
  if (!detail) return undefined
  const category = String(entityFact(detail, "category") ?? "other")
  if (category !== "link") return undefined
  const rel = String(entityFact(detail, "path") ?? "")
  if (!rel) return undefined
  const meta = stripEmptyMetadata({
    title: cleanString(entityFact(detail, "title")),
    alt: cleanString(entityFact(detail, "alt")),
    description: cleanString(entityFact(detail, "description")),
    palette: parsePalette(entityFact(detail, "semantic.palette")),
    tone: cleanString(entityFact(detail, "semantic.tone")),
    tags: parseTags(entityFact(detail, "semantic.tags")),
    transcript: cleanString(entityFact(detail, "semantic.transcript")),
    analysisSource: cleanString(entityFact(detail, "semantic.source")),
    analysisModel: cleanString(entityFact(detail, "semantic.model")),
    analyzedAt: cleanString(entityFact(detail, "semantic.analyzedAt")),
    previewImage: cleanString(entityFact(detail, "previewImage")),
    previewFavicon: cleanString(entityFact(detail, "previewFavicon")),
    previewCachedAt: cleanString(entityFact(detail, "previewCachedAt")),
  })
  return {
    path: rel,
    name: String(entityFact(detail, "name") ?? path.basename(rel)),
    ext: "link",
    category: "link",
    kind: "link",
    url: cleanString(entityFact(detail, "url")),
    ...meta,
  }
}

const listLinkAssets = async () => {
  await Trellis.init(Instance.directory).catch(() => undefined)
  if (!Trellis.storeStats(Instance.directory)) return [] as MediaAsset[]
  return Trellis.storeEntities(Instance.directory, { type: "Asset" })
    .map((entity) => entityToAsset(entity.id, Instance.directory))
    .filter((asset): asset is MediaAsset => !!asset)
}

const touchLinksRegistry = async () => {
  const dir = path.join(Instance.directory, ".trellis", "assets")
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, "links.json")
  const links = await listLinkAssets()
  await writeFile(
    file,
    JSON.stringify(
      links.map((item) => ({ path: item.path, url: item.url, title: item.title, name: item.name })),
      null,
      2,
    ),
  )
  await Bus.publish(FileWatcher.Event.Updated, { file, event: "change" })
}

const opId = (kind: string, key: string) =>
  `operation:${kind}:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`

const mimeForExt = (ext?: string | null) =>
  ext ? (MIME[ext] ?? "application/octet-stream") : "application/octet-stream"

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : undefined)

const cleanList = (value: unknown, limit: number) => {
  const input = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

const parseAudioAnalysis = (value: unknown): AudioAnalysis | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value) as AudioAnalysis
    if (!parsed?.contentType) return undefined
    return parsed
  } catch {
    return undefined
  }
}

const normalizeMetadata = (input: unknown): MediaMetadata => {
  if (typeof input === "string") return { description: input.trim() || undefined }
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const raw = input as Record<string, unknown>
  const audioAnalysis =
    (raw.audioAnalysis as AudioAnalysis | undefined) ??
    parseAudioAnalysis(raw.audioAnalysis) ??
    parseAudioAnalysis(raw["semantic.audioAnalysis"])
  const audioContentType =
    cleanString(raw.audioContentType) ??
    cleanString(raw["semantic.audioContentType"]) ??
    audioAnalysis?.contentType
  return {
    title: cleanString(raw.title),
    alt: cleanString(raw.alt),
    description: cleanString(raw.description),
    palette: cleanList(raw.palette, 8),
    tone: cleanString(raw.tone),
    tags: cleanList(raw.tags, 12),
    transcript: cleanString(raw.transcript),
    audioContentType: audioContentType as AudioEnrichment.ContentType | undefined,
    audioAnalysis,
    analysisSource: cleanString(raw.analysisSource) ?? cleanString(raw.source),
    analysisModel: cleanString(raw.analysisModel) ?? cleanString(raw.model),
    analyzedAt: cleanString(raw.analyzedAt),
  }
}

const stripEmptyMetadata = (input: MediaMetadata): MediaMetadata =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== ""
    }),
  ) as MediaMetadata

const cacheMetadata = (cache: Record<string, any>, rel: string, abs: string) =>
  normalizeMetadata(cache[rel] ?? cache[abs])

const writeCacheMetadata = (cache: Record<string, any>, rel: string, abs: string, meta: MediaMetadata) => {
  cache[rel] = meta
  cache[abs] = meta
}

const metadataComplete = (meta: MediaMetadata, category: string) => {
  if (!meta.description || !meta.tone || !meta.tags?.length) return false
  if (category === "image" || category === "video" || category === "texture") return !!meta.palette?.length
  if (category === "audio") {
    const contentType = meta.audioContentType ?? meta.audioAnalysis?.contentType
    if (!contentType) return false
    if (contentType === "speech") return !!meta.transcript?.trim()
    if (contentType === "music") {
      const analysis = meta.audioAnalysis
      return !!analysis?.bpm || !!analysis?.key || !!analysis?.genre?.length || !!analysis?.mood?.length
    }
    return true
  }
  return true
}

const parseMetadata = (text: string): MediaMetadata | undefined => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const raw = fenced ?? text
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return undefined
  try {
    return normalizeMetadata(JSON.parse(raw.slice(start, end + 1)))
  } catch {
    return undefined
  }
}

const semanticPrompt = (category: string, rel: string) =>
  [
    `Analyze this ${category} asset for a design/CMS asset graph.`,
    `Asset name: ${path.basename(rel)}.`,
    'Return only compact JSON with keys: "description", "alt", "palette", "tone", "tags", "transcript".',
    '"description" should be 1-3 concise sentences for agents and CMS editors.',
    '"alt" should be accessibility-ready when the asset has visual content, otherwise omit it.',
    '"palette" should be 3-6 dominant hex colors for visual assets, otherwise an empty array.',
    '"tone" should be a short phrase describing mood, style, or sonic/document tone.',
    '"tags" should be 4-10 lowercase semantic tags.',
    '"transcript" should contain important spoken words for audio/video, otherwise omit it.',
  ].join(" ")

const fallbackMetadata = (rel: string, category: string): MediaMetadata => ({
  description: `${category.charAt(0).toUpperCase() + category.slice(1)} file: ${path.basename(rel)}`,
  tone: "unknown",
  tags: [category],
  palette: category === "image" || category === "video" || category === "texture" ? [] : undefined,
})

const audioKind = (meta: MediaMetadata, category: string) => {
  if (category !== "audio") return category
  return meta.audioContentType ?? meta.audioAnalysis?.contentType ?? category
}

const addFact = (
  facts: Array<{ e: string; a: string; v: string | number | boolean }>,
  e: string,
  a: string,
  v: string | number | boolean | undefined,
) => {
  if (v === undefined) return
  if (typeof v === "string" && v.trim() === "") return
  facts.push({ e, a, v })
}

const assetFacts = (asset: MediaAsset) => {
  const id = assetId(asset.path)
  const facts: Array<{ e: string; a: string; v: string | number | boolean }> = []
  addFact(facts, id, "type", "Asset")
  addFact(facts, id, "label", asset.title || asset.name)
  addFact(facts, id, "path", asset.path)
  addFact(facts, id, "name", asset.name)
  addFact(facts, id, "extension", asset.ext)
  addFact(facts, id, "category", asset.category)
  addFact(
    facts,
    id,
    "kind",
    asset.category === "audio"
      ? (asset.audioContentType ?? asset.audioAnalysis?.contentType ?? asset.kind ?? asset.category)
      : (asset.kind ?? asset.category),
  )
  addFact(facts, id, "url", asset.url)
  addFact(facts, id, "mime", asset.category === "link" ? "text/uri-list" : mimeForExt(asset.ext))
  addFact(facts, id, "size", asset.size)
  addFact(facts, id, "title", asset.title)
  addFact(facts, id, "alt", asset.alt)
  addFact(facts, id, "description", asset.description)
  addFact(facts, id, "semantic.palette", asset.palette?.length ? JSON.stringify(asset.palette) : undefined)
  addFact(facts, id, "semantic.tone", asset.tone)
  addFact(facts, id, "semantic.tags", asset.tags?.length ? JSON.stringify(asset.tags) : undefined)
  addFact(facts, id, "semantic.transcript", asset.transcript)
  addFact(
    facts,
    id,
    "semantic.audioContentType",
    asset.audioContentType ?? asset.audioAnalysis?.contentType,
  )
  addFact(
    facts,
    id,
    "semantic.audioAnalysis",
    asset.audioAnalysis ? JSON.stringify(asset.audioAnalysis) : undefined,
  )
  addFact(facts, id, "semantic.source", asset.analysisSource)
  addFact(facts, id, "semantic.model", asset.analysisModel)
  addFact(facts, id, "semantic.analyzedAt", asset.analyzedAt)
  addFact(facts, id, "previewImage", asset.previewImage)
  addFact(facts, id, "previewFavicon", asset.previewFavicon)
  addFact(facts, id, "previewCachedAt", asset.previewCachedAt)
  return facts
}

const syncFacts = async (
  facts: Array<{ e: string; a: string; v: string | number | boolean }>,
  managed: Set<string>,
  meta: Trellis.StoreMeta,
) => {
  if (facts.length === 0) return
  await Trellis.init(Instance.directory).catch(() => undefined)
  if (!Trellis.storeStats(Instance.directory)) return

  const byEntity = new Map<string, typeof facts>()
  for (const fact of facts) {
    const list = byEntity.get(fact.e) ?? []
    list.push(fact)
    byEntity.set(fact.e, list)
  }

  const assert: typeof facts = []
  const retract: typeof facts = []

  for (const [entity, desired] of byEntity) {
    const current = (Trellis.storeEntity(entity, Instance.directory)?.facts ?? []) as Array<{
      e: string
      a: string
      v: string | number | boolean
    }>
    for (const old of current) {
      if (!managed.has(old.a)) continue
      if (!desired.some((next) => next.a === old.a && next.v === old.v)) {
        retract.push({ e: old.e, a: old.a, v: old.v as string | number | boolean })
      }
    }
    for (const next of desired) {
      if (!current.some((old) => old.a === next.a && old.v === next.v)) assert.push(next)
    }
  }

  if (retract.length) Trellis.storeRetract(retract, Instance.directory, meta)
  if (assert.length) Trellis.storeAssert(assert, Instance.directory, meta)
}

const syncLinks = async (links: Array<{ e1: string; a: string; e2: string }>, meta: Trellis.StoreMeta) => {
  if (links.length === 0) return
  await Trellis.init(Instance.directory).catch(() => undefined)
  if (!Trellis.storeStats(Instance.directory)) return
  const missing: typeof links = []
  for (const link of links) {
    const existing = Trellis.storeLinks(Instance.directory, { entity: link.e1, attribute: link.a })
    if (!existing.some((old: any) => old.e1 === link.e1 && old.a === link.a && old.e2 === link.e2)) missing.push(link)
  }
  if (missing.length) Trellis.storeLink(missing, Instance.directory, meta)
}

const syncAssetNode = async (asset: MediaAsset, reason = "asset metadata sync") => {
  await syncFacts(assetFacts(asset), ASSET_FACTS, {
    actor: "design-panel",
    actorKind: "system",
    source: "asset-library",
    reason,
    relatedEntities: [assetId(asset.path)],
  })
}

const deleteAssetNode = async (rel: string) => {
  await Trellis.init(Instance.directory).catch(() => undefined)
  const id = assetId(rel)
  const detail = Trellis.storeEntity(id, Instance.directory)
  if (!detail) return
  const meta = {
    actor: "design-panel",
    actorKind: "system" as const,
    source: "asset-library",
    reason: "asset deleted",
    relatedEntities: [id],
  }
  if (detail.facts.length)
    Trellis.storeRetract(
      detail.facts.map((fact: any) => ({ e: fact.e, a: fact.a, v: fact.v as string | number | boolean })),
      Instance.directory,
      meta,
    )
  if (detail.links.length) Trellis.storeUnlink(detail.links, Instance.directory, meta)
}

const recordGeneratedAssetOp = async (asset: MediaAsset & { model?: string; provider?: string; prompt?: string }) => {
  const assetEntity = assetId(asset.path)
  const entity = opId("imagegen", `${asset.path}\0${asset.prompt ?? ""}\0${asset.model ?? ""}`)
  const facts: Array<{ e: string; a: string; v: string | number | boolean }> = []
  addFact(facts, entity, "type", "Operation")
  addFact(facts, entity, "label", `imagegen: ${asset.name}`)
  addFact(facts, entity, "kind", "imagegen")
  addFact(facts, entity, "tool", "file.media.generate")
  addFact(facts, entity, "prompt", asset.prompt)
  addFact(facts, entity, "model", asset.model)
  addFact(facts, entity, "provider", asset.provider)
  addFact(facts, entity, "outputPath", asset.path)
  addFact(facts, entity, "createdAt", new Date().toISOString())
  const meta = {
    actor: "design-panel",
    actorKind: "agent" as const,
    source: "imagegen",
    sessionID: "design-panel",
    reason: "generated asset",
    relatedEntities: [entity, assetEntity],
  }
  await syncFacts(facts, OP_FACTS, meta)
  await syncLinks([{ e1: entity, a: "produced", e2: assetEntity }], meta)
}

const modelMetadata = async (
  abs: string,
  rel: string,
  category: string,
  ext: string | null,
): Promise<MediaMetadata> => {
  const model = await Provider.defaultModel()
  const resolved = await Provider.getModel(model.providerID, model.modelID)
  const language = await Provider.getLanguage(resolved)
  const mime = mimeForExt(ext)
  const messages: ModelMessage[] = []

  if (category === "image" && IMAGE_EXTS.has(ext ?? "")) {
    const bytes = await fsRead(abs)
    messages.push({
      role: "user",
      content: [
        { type: "file", data: bytes.toString("base64"), mediaType: mime },
        { type: "text", text: semanticPrompt(category, rel) },
      ],
    })
  } else {
    messages.push({
      role: "user",
      content: `${semanticPrompt(category, rel)} Infer cautiously from the filename and file type if the file bytes cannot be inspected.`,
    })
  }

  const result = await generateText({
    model: language,
    messages: [
      {
        role: "system",
        content:
          "You generate semantic metadata for uploaded design assets. Return only a valid JSON object with no preamble.",
      },
      ...messages,
    ],
    maxOutputTokens: 800,
  })
  return stripEmptyMetadata({
    ...(parseMetadata(result.text) ?? { description: result.text.trim() }),
    analysisSource: "model",
    analysisModel: `${model.providerID}/${model.modelID}`,
  })
}

const generateMetadata = async (abs: string, rel: string): Promise<MediaMetadata> => {
  const ext = mediaExt(rel)
  const category = ext ? mediaCategory(ext) : "file"
  const mime = mimeForExt(ext)

  try {
    if (category === "audio") {
      const bytes = await fsRead(abs)
      const enriched = await AudioEnrichment.enrich({ abs, rel, bytes, mime })
      return stripEmptyMetadata({
        description: enriched.description,
        tone: enriched.tone,
        tags: enriched.tags,
        transcript: enriched.transcript,
        audioContentType: enriched.kind ?? enriched.audioAnalysis?.contentType,
        audioAnalysis: enriched.audioAnalysis,
        analysisSource: enriched.analysisSource,
        analysisModel: enriched.analysisModel,
      })
    }

    if (MediaAnalysis.supported(mime)) {
      const result = await MediaAnalysis.analyze({
        bytes: await fsRead(abs),
        mime,
        filename: path.basename(rel),
        prompt: semanticPrompt(category, rel),
      })
      if (result.source !== "unavailable" && result.text.trim()) {
        return stripEmptyMetadata({
          ...(parseMetadata(result.text) ?? { description: result.text.trim() }),
          analysisSource: result.source,
          analysisModel: result.model,
        })
      }
    }

    return await modelMetadata(abs, rel, category, ext)
  } catch {
    return fallbackMetadata(rel, category)
  }
}

const ensureMetadata = async (rel: string, opts?: { force?: boolean }) => {
  const abs = path.join(Instance.directory, rel)
  if (!Instance.containsPath(abs)) throw new Error("invalid path")

  const ext = mediaExt(rel)
  const category = ext ? mediaCategory(ext) : "file"
  const mediaDir = path.join(Instance.directory, ".trellis", "media")
  const cache = await descCache(mediaDir)
  const existing = cacheMetadata(cache, rel, abs)

  if (!opts?.force && metadataComplete(existing, category)) {
    const asset: MediaAsset = {
      path: rel,
      name: path.basename(rel),
      ext: ext ?? "bin",
      category,
      kind: audioKind(existing, category),
      ...existing,
    }
    await syncAssetNode(asset, "asset metadata cached")
    return existing
  }

  const generated = await generateMetadata(abs, rel)
  const next = stripEmptyMetadata({
    ...existing,
    ...generated,
    title: existing.title,
    alt: existing.alt ?? generated.alt,
    analyzedAt: new Date().toISOString(),
  })

  writeCacheMetadata(cache, rel, abs, next)
  await saveDescCache(mediaDir, cache).catch(() => {})
  const size = await stat(abs)
    .then((info) => info.size)
    .catch(() => undefined)
  await syncAssetNode(
    {
      path: rel,
      name: path.basename(rel),
      ext: ext ?? "bin",
      category,
      kind: audioKind(next, category),
      size,
      ...next,
    },
    opts?.force ? "asset metadata regenerated" : "asset metadata generated",
  )
  return next
}

const ensureLinkMetadata = async (rel: string, url: string, opts?: { force?: boolean }) => {
  const existing =
    entityToAsset(assetId(rel), Instance.directory) ??
    ({
      path: rel,
      name: new URL(url).hostname,
      ext: "link",
      category: "link",
      kind: "link",
      url,
    } satisfies MediaAsset)
  const meta = stripEmptyMetadata({
    title: existing.title,
    alt: existing.alt,
    description: existing.description,
    palette: existing.palette,
    tone: existing.tone,
    tags: existing.tags,
    transcript: existing.transcript,
    analysisSource: existing.analysisSource,
    analysisModel: existing.analysisModel,
    analyzedAt: existing.analyzedAt,
  })

  if (!opts?.force && metadataComplete(meta, "link")) {
    await syncAssetNode({ ...existing, ...meta }, "link metadata cached")
    return meta
  }

  const model = await Provider.defaultModel()
  const resolved = await Provider.getModel(model.providerID, model.modelID)
  const language = await Provider.getLanguage(resolved)
  const result = await generateText({
    model: language,
    messages: [
      {
        role: "system",
        content:
          "You generate semantic metadata for bookmark/link assets used in a CMS and design library. Return only valid JSON.",
      },
      {
        role: "user",
        content: [
          semanticPrompt("link", rel),
          `URL: ${url}`,
          `Title hint: ${existing.title ?? existing.name ?? new URL(url).hostname}`,
        ].join(" "),
      },
    ],
    maxOutputTokens: 800,
  })

  const generated = stripEmptyMetadata({
    ...(parseMetadata(result.text) ?? { description: result.text.trim() }),
    analysisSource: "model",
    analysisModel: `${model.providerID}/${model.modelID}`,
    analyzedAt: new Date().toISOString(),
  })

  const next = stripEmptyMetadata({
    ...meta,
    ...generated,
    title: meta.title ?? existing.title,
    alt: meta.alt ?? generated.alt,
  })

  const asset: MediaAsset = {
    path: rel,
    name: existing.name ?? new URL(url).hostname,
    ext: "link",
    category: "link",
    kind: "link",
    url,
    ...next,
  }
  await syncAssetNode(asset, opts?.force ? "link metadata regenerated" : "link metadata generated")
  await touchLinksRegistry().catch(() => {})
  return next
}

export const FileRoutes = lazy(() =>
  new Hono()
    .get(
      "/find",
      describeRoute({
        summary: "Find text",
        description: "Search for text patterns across files in the project using ripgrep.",
        operationId: "find.text",
        responses: {
          200: {
            description: "Matches",
            content: {
              "application/json": {
                schema: resolver(Ripgrep.Match.shape.data.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          pattern: z.string(),
        }),
      ),
      async (c) => {
        const pattern = c.req.valid("query").pattern
        const result = await Ripgrep.search({
          cwd: Instance.directory,
          pattern,
          limit: 10,
          follow: true,
        })
        return c.json(result)
      },
    )
    .get(
      "/find/file",
      describeRoute({
        summary: "Find files",
        description: "Search for files or directories by name or pattern in the project directory.",
        operationId: "find.files",
        responses: {
          200: {
            description: "File paths",
            content: {
              "application/json": {
                schema: resolver(z.string().array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
          dirs: z.enum(["true", "false"]).optional(),
          type: z.enum(["file", "directory"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query").query
        const dirs = c.req.valid("query").dirs
        const type = c.req.valid("query").type
        const limit = c.req.valid("query").limit
        const results = await File.search({
          query,
          limit: limit ?? 100,
          dirs: dirs !== "false",
          type,
        })
        return c.json(results)
      },
    )
    .get(
      "/find/symbol",
      describeRoute({
        summary: "Find symbols",
        description: "Search for workspace symbols like functions, classes, and variables using LSP.",
        operationId: "find.symbols",
        responses: {
          200: {
            description: "Symbols",
            content: {
              "application/json": {
                schema: resolver(LSP.Symbol.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
        }),
      ),
      async (c) => {
        /*
      const query = c.req.valid("query").query
      const result = await LSP.workspaceSymbol(query)
      return c.json(result)
      */
        return c.json([])
      },
    )
    .get(
      "/file",
      describeRoute({
        summary: "List files",
        description: "List files and directories in a specified path.",
        operationId: "file.list",
        responses: {
          200: {
            description: "Files and directories",
            content: {
              "application/json": {
                schema: resolver(File.Node.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
          directory: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        // SDK adds `directory` on every GET for instance routing; only use the legacy
        // turtlecode home listing when the query path is under ~/.turtlecode.
        const turtleRoot = path.resolve(os.homedir(), ".turtlecode")
        const queryDir = q.directory ? path.resolve(q.directory) : undefined
        const useTurtlecodeListing =
          queryDir !== undefined &&
          (queryDir === turtleRoot || queryDir.startsWith(turtleRoot + path.sep))
        const content = useTurtlecodeListing
          ? await listTurtlecode(q.directory!, q.path)
          : await File.list(q.path)
        return c.json(content)
      },
    )
    .get(
      "/file/content",
      describeRoute({
        summary: "Read file",
        description: "Read the content of a specified file.",
        operationId: "file.read",
        responses: {
          200: {
            description: "File content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.read(path)
        return c.json(content)
      },
    )
    .get(
      "/file/raw",
      describeRoute({
        summary: "Serve raw file",
        description: "Serve a workspace file as binary with correct MIME type.",
        operationId: "file.raw",
        responses: {
          200: { description: "File bytes" },
          400: { description: "Invalid path" },
          404: { description: "Not found" },
        },
      }),
      validator("query", z.object({ path: z.string() })),
      async (c) => {
        const rel = c.req.valid("query").path
        const abs = path.resolve(path.isAbsolute(rel) ? rel : path.join(Instance.directory, rel))
        if (!Instance.containsPath(abs)) return c.json({ error: "invalid path" }, 400)
        let buf: Buffer
        try {
          buf = await fsRead(abs)
        } catch {
          return c.json({ error: "not found" }, 404)
        }
        const mime = MIME[path.extname(abs).toLowerCase().slice(1)] ?? "application/octet-stream"
        return new Response(new Uint8Array(buf), { headers: { "Content-Type": mime } })
      },
    )
    .post(
      "/file/content",
      describeRoute({
        summary: "Write file",
        description: "Write text or base64-encoded binary content to a specified file.",
        operationId: "file.write",
        responses: {
          200: {
            description: "Updated file content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", File.WriteInput),
      async (c) => {
        const body = c.req.valid("json")
        const content = await File.write(body)
        return c.json(content)
      },
    )
    .post(
      "/file/rename",
      describeRoute({
        summary: "Rename file or directory",
        description: "Rename a file or directory within the project. Paths are relative to the project root.",
        operationId: "file.rename",
        responses: {
          200: {
            description: "Renamed",
            content: {
              "application/json": {
                schema: resolver(z.object({ from: z.string(), to: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          from: z.string().meta({ description: "Source path relative to project root" }),
          to: z.string().meta({ description: "Destination path relative to project root" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const fullFrom = path.join(Instance.directory, body.from)
        const fullTo = path.join(Instance.directory, body.to)
        if (!Instance.containsPath(fullFrom) || !Instance.containsPath(fullTo)) {
          return c.json({ error: "Access denied: path escapes project directory" }, 400)
        }
        try {
          await stat(fullTo)
          return c.json({ error: "Destination already exists" }, 400)
        } catch {
          // does not exist — good
        }
        await mkdir(path.dirname(fullTo), { recursive: true })
        await fsRename(fullFrom, fullTo)
        await Bus.publish(FileWatcher.Event.Updated, { file: fullFrom, event: "unlink" })
        await Bus.publish(FileWatcher.Event.Updated, { file: fullTo, event: "add" })
        return c.json({ from: body.from, to: body.to })
      },
    )
    .post(
      "/file/delete",
      describeRoute({
        summary: "Delete file or directory",
        description: "Delete a file or directory within the project. Path is relative to the project root.",
        operationId: "file.delete",
        responses: {
          200: {
            description: "Deleted",
            content: {
              "application/json": {
                schema: resolver(z.object({ path: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string().meta({ description: "Path relative to project root" }),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const fullPath = path.join(Instance.directory, body.path)
        if (!Instance.containsPath(fullPath)) {
          return c.json({ error: "Access denied: path escapes project directory" }, 400)
        }
        await rm(fullPath, { recursive: true, force: true })
        await Bus.publish(FileWatcher.Event.Updated, { file: fullPath, event: "unlink" })
        if (isLinkAsset(body.path)) {
          void deleteAssetNode(body.path).catch(() => {})
          void touchLinksRegistry().catch(() => {})
        } else if (mediaExt(body.path)) void deleteAssetNode(body.path).catch(() => {})
        return c.json({ path: body.path })
      },
    )
    .post(
      "/file/upload",
      describeRoute({
        summary: "Upload file",
        description:
          "Upload a binary or text file blob to a workspace-relative directory. The caller supplies the final target name (the frontend computes any conflict-free name before posting).",
        operationId: "file.upload",
        responses: {
          200: {
            description: "Uploaded file metadata",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    path: z.string(),
                    size: z.number(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const body = await c.req.parseBody()
        const dir = typeof body["path"] === "string" ? body["path"] : ""
        const raw = body["file"]
        if (!raw || typeof raw === "string") return c.json({ error: "file field required" }, 400)
        const name = typeof body["name"] === "string" && body["name"] ? body["name"] : raw.name
        if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
          return c.json({ error: "invalid file name" }, 400)
        }
        const rel = dir ? path.posix.join(dir.replaceAll("\\", "/"), name) : name
        const target = path.join(Instance.directory, rel)
        if (!Instance.containsPath(target)) {
          return c.json({ error: "Access denied: path escapes project directory" }, 400)
        }
        const bytes = new Uint8Array(await raw.arrayBuffer())
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, bytes)
        await Bus.publish(FileWatcher.Event.Updated, { file: target, event: "add" })
        const ext = mediaExt(rel)
        if (ext) {
          void syncAssetNode(
            {
              path: rel,
              name,
              ext,
              category: mediaCategory(ext),
              kind: mediaCategory(ext),
              size: bytes.byteLength,
            },
            "asset uploaded",
          ).catch(() => {})
        }
        return c.json({ path: rel, size: bytes.byteLength })
      },
    )
    .get(
      "/file/status",
      describeRoute({
        summary: "Get file status",
        description: "Get the git status of all files in the project.",
        operationId: "file.status",
        responses: {
          200: {
            description: "File status",
            content: {
              "application/json": {
                schema: resolver(File.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const content = await File.status()
        return c.json(content)
      },
    )
    .get(
      "/file/stat",
      describeRoute({
        summary: "Get file stat",
        description: "Get the size and last modified time of a specified file.",
        operationId: "file.stat",
        responses: {
          200: {
            description: "File stat",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    size: z.number(),
                    mtime: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const filePath = c.req.valid("query").path
        const abs = path.isAbsolute(filePath) ? filePath : path.join(Instance.directory, filePath)
        const info = await stat(abs)
        return c.json({ size: info.size, mtime: info.mtime.toISOString() })
      },
    )
    .get(
      "/file/media/list",
      describeRoute({
        summary: "List media files",
        description: "List all media/binary files in the workspace and .trellis/media/, merged and deduplicated.",
        operationId: "file.media.list",
        responses: {
          200: {
            description: "Media file list",
            content: {
              "application/json": {
                schema: resolver(z.array(MediaAssetSchema)),
              },
            },
          },
        },
      }),
      async (c) => {
        const seen = new Set<string>()
        const results: MediaAsset[] = []

        // 1. scan workspace via File.search
        const files = await File.search({ query: "", type: "file", limit: 10000 })
        for (const rel of files) {
          const e = mediaExt(rel)
          if (!e) continue
          const abs = path.join(Instance.directory, rel)
          seen.add(abs)
          let size: number | undefined
          try {
            size = (await stat(abs)).size
          } catch {}
          results.push({
            path: rel,
            name: path.basename(rel),
            ext: e,
            category: mediaCategory(e),
            kind: mediaCategory(e),
            size,
          })
        }

        // 2. scan .trellis/media/
        const mediaDir = path.join(Instance.directory, ".trellis", "media")
        try {
          const entries = await readdir(mediaDir)
          for (const entry of entries) {
            if (entry === "descriptions.json") continue
            const abs = path.join(mediaDir, entry)
            if (seen.has(abs)) continue
            seen.add(abs)
            const e = mediaExt(entry)
            if (!e) continue
            const rel = path.relative(Instance.directory, abs)
            let size: number | undefined
            try {
              size = (await stat(abs)).size
            } catch {}
            results.push({
              path: rel,
              name: entry,
              ext: e,
              category: mediaCategory(e),
              kind: mediaCategory(e),
              size,
            })
          }
        } catch {}

        const links = await listLinkAssets()
        for (const link of links) {
          if (results.some((item) => item.path === link.path)) continue
          results.push(link)
          if (link.url && !link.previewCachedAt) {
            void LinkAsset.warmPreview({ path: link.path, url: link.url }).catch(() => undefined)
          }
        }

        // 3. attach cached metadata
        const cache = await descCache(mediaDir)
        for (const item of results) {
          if (isLinkAsset(item.path)) continue
          const abs = path.join(Instance.directory, item.path)
          const meta = cacheMetadata(cache, item.path, abs)
          Object.assign(item, meta)
          if (item.category === "audio") item.kind = audioKind(meta, item.category)
        }

        void syncFacts(
          results.flatMap((asset) => assetFacts(asset)),
          ASSET_FACTS,
          {
            actor: "design-panel",
            actorKind: "system",
            source: "asset-library",
            reason: "asset library listed",
            relatedEntities: results.map((asset) => assetId(asset.path)).slice(0, 100),
          },
        ).catch(() => {})

        return c.json(results)
      },
    )
    .post(
      "/file/media/update",
      describeRoute({
        summary: "Update media metadata",
        description: "Update title, alt text, or description for a media file.",
        operationId: "file.media.update",
        responses: {
          200: {
            description: "Updated metadata",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string(),
          title: z.string().optional(),
          alt: z.string().optional(),
          description: z.string().optional(),
          palette: z.array(z.string()).optional(),
          tone: z.string().optional(),
          tags: z.array(z.string()).optional(),
          transcript: z.string().optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        if (!isLinkAsset(body.path) && !Instance.containsPath(path.join(Instance.directory, body.path))) {
          return c.json({ error: "invalid path" }, 400)
        }
        const mediaDir = path.join(Instance.directory, ".trellis", "media")
        const cache = await descCache(mediaDir)
        const abs = path.join(Instance.directory, body.path)

        const existing = isLinkAsset(body.path)
          ? stripEmptyMetadata((await listLinkAssets()).find((item) => item.path === body.path) ?? {})
          : cacheMetadata(cache, body.path, abs)
        const next = stripEmptyMetadata({
          ...existing,
          title: body.title !== undefined ? body.title : existing.title,
          alt: body.alt !== undefined ? body.alt : existing.alt,
          description: body.description !== undefined ? body.description : existing.description,
          palette: body.palette !== undefined ? body.palette : existing.palette,
          tone: body.tone !== undefined ? body.tone : existing.tone,
          tags: body.tags !== undefined ? body.tags : existing.tags,
          transcript: body.transcript !== undefined ? body.transcript : existing.transcript,
        })

        if (!isLinkAsset(body.path)) {
          writeCacheMetadata(cache, body.path, abs, next)
          await saveDescCache(mediaDir, cache).catch(() => {})
        }

        const ext = isLinkAsset(body.path) ? "link" : mediaExt(body.path)
        const size = isLinkAsset(body.path)
          ? undefined
          : await stat(abs)
              .then((info) => info.size)
              .catch(() => undefined)
        const link = isLinkAsset(body.path) ? (await listLinkAssets()).find((item) => item.path === body.path) : undefined
        if (ext || isLinkAsset(body.path)) {
          void syncAssetNode(
            {
              path: body.path,
              name: path.basename(body.path),
              ext: ext ?? "bin",
              category: isLinkAsset(body.path) ? "link" : mediaCategory(ext ?? "bin"),
              kind: isLinkAsset(body.path) ? "link" : mediaCategory(ext ?? "bin"),
              url: link?.url,
              size,
              ...next,
            },
            "asset metadata updated",
          ).catch(() => {})
          if (isLinkAsset(body.path)) void touchLinksRegistry().catch(() => {})
        }
        return c.json({ success: true })
      },
    )
    .post(
      "/file/media/describe",
      describeRoute({
        summary: "Describe a media file",
        description: "Generate an AI description of a media file and cache it.",
        operationId: "file.media.describe",
        responses: {
          200: {
            description: "Generated semantic metadata",
            content: {
              "application/json": {
                schema: resolver(MediaMetadataSchema),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", z.object({ path: z.string(), force: z.boolean().optional() })),
      async (c) => {
        const body = c.req.valid("json")
        try {
          if (isLinkAsset(body.path)) {
            const link = (await listLinkAssets()).find((item) => item.path === body.path)
            if (!link?.url) return c.json({ error: "invalid path" }, 400)
            return c.json(await ensureLinkMetadata(body.path, link.url, { force: body.force }))
          }
          return c.json(await ensureMetadata(body.path, { force: body.force }))
        } catch {
          return c.json({ error: "invalid path" }, 400)
        }
      },
    )
    .get(
      "/file/media/link/preview",
      describeRoute({
        summary: "Preview link asset",
        description: "Fetch Open Graph metadata and favicon for a bookmark URL.",
        operationId: "file.media.link.preview",
        responses: {
          200: {
            description: "Link preview metadata",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    url: z.string(),
                    title: z.string().optional(),
                    description: z.string().optional(),
                    favicon: z.string().optional(),
                    image: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          url: z.string().trim().min(1),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        try {
          return c.json(await fetchLinkPreview(q.url))
        } catch {
          return c.json({ error: "invalid url" }, 400)
        }
      },
    )
    .post(
      "/file/media/link",
      describeRoute({
        summary: "Create link asset",
        description: "Create a bookmark/link asset backed by a Trellis Asset entity (no binary file).",
        operationId: "file.media.link",
        responses: {
          200: {
            description: "Created link asset",
            content: {
              "application/json": {
                schema: resolver(MediaAssetSchema),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          url: z.string().trim().min(1),
          title: z.string().trim().min(1).max(200).optional(),
          description: z.string().trim().max(4000).optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        try {
          const asset = await LinkAsset.create(body)
          void ensureLinkMetadata(asset.path, asset.url).catch(() => {})
          Trellis.record({
            tool: "file.media.link",
            sessionID: "design-panel",
            args: { url: asset.url, title: body.title },
            output: asset.path,
          }).catch(() => {})
          return c.json(asset)
        } catch {
          return c.json({ error: "invalid url" }, 400)
        }
      },
    )
    .post(
      "/file/media/generate",
      describeRoute({
        summary: "Generate image asset",
        description: "Generate an image with Gemini or OpenAI and save it to .trellis/media/.",
        operationId: "file.media.generate",
        responses: {
          200: {
            description: "Generated image asset",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      path: z.string(),
                      name: z.string(),
                      ext: z.string(),
                      category: z.string(),
                      size: z.number(),
                      model: z.string(),
                      prompt: z.string(),
                      provider: z.string().optional(),
                    })
                    .merge(MediaMetadataSchema),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ImageGeneration.ImageInput),
      async (c) => {
        const input = c.req.valid("json")
        try {
          const img = await ImageGeneration.generate(input, c.req.raw.signal)
          const asset = await ImageGeneration.save(Instance.directory, img, input)
          const abs = path.join(Instance.directory, asset.path)
          await Bus.publish(FileWatcher.Event.Updated, { file: abs, event: "add" })
          await ImageGeneration.annotate(Instance.directory, asset, input).catch(() => {})
          const metadata = await ensureMetadata(asset.path).catch(() => normalizeMetadata(undefined))
          const output = { ...asset, ...metadata }
          await syncAssetNode(output, "generated asset saved").catch(() => {})
          await recordGeneratedAssetOp(output).catch(() => {})

          Trellis.record({
            tool: "file.media.generate",
            sessionID: "design-panel",
            args: {
              prompt: input.prompt,
              model: asset.model,
              size: input.size,
              quality: input.quality,
              output_format: input.output_format,
            },
            output: asset.path,
          }).catch(() => {})

          return c.json(output)
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
        }
      },
    )
    .get(
      "/file/media/:filename",
      describeRoute({
        summary: "Serve media file",
        description: "Serve a media file from .trellis/media/ by filename.",
        operationId: "file.media.get",
        responses: {
          200: { description: "Media file bytes" },
          404: { description: "Not found" },
        },
      }),
      async (c) => {
        const filename = c.req.param("filename")
        if (!filename || filename.includes("..") || filename.includes("/")) return c.json({ error: "invalid" }, 400)
        const dest = path.join(Instance.directory, ".trellis", "media", filename)
        let buf: Buffer
        try {
          buf = await fsRead(dest)
        } catch {
          return c.json({ error: "not found" }, 404)
        }
        const ext = path.extname(filename).toLowerCase().slice(1)
        const mime = MIME[ext] ?? "application/octet-stream"
        return new Response(new Uint8Array(buf), {
          headers: { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" },
        })
      },
    )
    .post(
      "/file/rewrite",
      describeRoute({
        summary: "Rewrite a selection with AI (streaming)",
        description:
          "Given a file path, the surrounding context, and a user instruction, stream a replacement for the selected text. Response is a text/plain stream of the replacement only (no chat framing). Logs a decision trace into Trellis at the end.",
        operationId: "file.rewrite",
        responses: {
          200: {
            description: "Streamed replacement text",
            content: { "text/plain": { schema: resolver(z.string()) } },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string().meta({ description: "Workspace-relative or absolute path for context only (not written)" }),
          language: z.string().optional().meta({ description: "Hint like 'typescript', 'markdown', 'python'" }),
          before: z.string().meta({ description: "Text immediately before the selection (context)" }),
          selection: z.string().meta({ description: "The selected text to be rewritten (may be empty for insert)" }),
          after: z.string().meta({ description: "Text immediately after the selection (context)" }),
          instruction: z.string().min(1).meta({ description: "User instruction describing the edit" }),
          providerID: z.string().optional(),
          modelID: z.string().optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const providerID = body.providerID
        const modelID = body.modelID
        const resolved =
          providerID && modelID
            ? await Provider.getModel(ProviderID.make(providerID), ModelID.make(modelID))
            : await (async () => {
                const m = await Provider.defaultModel()
                return Provider.getModel(m.providerID, m.modelID)
              })()
        const languageModel = await Provider.getLanguage(resolved)

        const insert = body.selection.length === 0
        const system = [
          "You are an inline code editor similar to Cursor's Cmd+K.",
          "Output ONLY the replacement text. No commentary, no explanations, no markdown code fences.",
          insert
            ? "The user's cursor is at the <CURSOR/> marker. Produce text to INSERT there."
            : "Rewrite the text between <SELECTION> and </SELECTION> according to the instruction.",
          "Preserve the file's existing indentation style, quoting style, and surrounding formatting.",
          "Do not include the <BEFORE>, <AFTER>, <SELECTION>, or <CURSOR/> markers in your output.",
        ].join(" ")

        const hint = body.language ? ` (language: ${body.language})` : ""
        const user = insert
          ? [
              `File: ${body.path}${hint}`,
              `Instruction: ${body.instruction}`,
              "",
              "<BEFORE>",
              body.before,
              "<CURSOR/>",
              body.after,
              "</BEFORE>",
              "",
              "Return only the text to insert at <CURSOR/>.",
            ].join("\n")
          : [
              `File: ${body.path}${hint}`,
              `Instruction: ${body.instruction}`,
              "",
              "<BEFORE>",
              body.before,
              "</BEFORE>",
              "<SELECTION>",
              body.selection,
              "</SELECTION>",
              "<AFTER>",
              body.after,
              "</AFTER>",
              "",
              "Return only the replacement for <SELECTION>.",
            ].join("\n")

        c.header("Content-Type", "text/plain; charset=utf-8")
        c.header("Cache-Control", "no-cache")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Provider-ID", String(resolved.providerID))
        c.header("X-Model-ID", String(resolved.id))

        return stream(c, async (s) => {
          const abort = new AbortController()
          const onAbort = () => abort.abort()
          c.req.raw.signal.addEventListener("abort", onAbort, { once: true })
          s.onAbort(() => abort.abort())

          // Fence stripping state: buffer a small head to detect a leading ``` fence, and
          // hold the last few chars back so we can strip a trailing ``` at EOF.
          const TAIL_HOLD = 6
          let decided = false
          let fenced = false
          let head = ""
          let pendingTail = ""
          let total = ""

          const pushSafe = async (text: string) => {
            const combined = pendingTail + text
            if (combined.length <= TAIL_HOLD) {
              pendingTail = combined
              return
            }
            const writeLen = combined.length - TAIL_HOLD
            const toWrite = combined.slice(0, writeLen)
            pendingTail = combined.slice(writeLen)
            total += toWrite
            await s.write(toWrite)
          }

          try {
            const result = streamText({
              model: languageModel,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              maxOutputTokens: 4096,
              abortSignal: abort.signal,
            })

            for await (const chunk of result.textStream) {
              if (abort.signal.aborted) break
              if (!decided) {
                head += chunk
                if (head.length < 12 && !head.includes("\n")) continue
                const m = head.match(/^\s*```[a-zA-Z0-9_-]*\n/)
                if (m) {
                  fenced = true
                  await pushSafe(head.slice(m[0].length))
                } else {
                  await pushSafe(head)
                }
                decided = true
                continue
              }
              await pushSafe(chunk)
            }

            // Finalize buffers
            if (!decided) {
              const m = head.match(/^\s*```[a-zA-Z0-9_-]*\n?/)
              if (m) {
                fenced = true
                pendingTail = head.slice(m[0].length)
              } else {
                pendingTail = head
              }
            }
            if (fenced) {
              pendingTail = pendingTail.replace(/\n?```\s*$/, "")
            }
            if (pendingTail) {
              total += pendingTail
              await s.write(pendingTail)
              pendingTail = ""
            }
          } catch (err) {
            if (!abort.signal.aborted) {
              await s.write(`\n[inline-edit error: ${(err as Error).message ?? String(err)}]`)
            }
          } finally {
            c.req.raw.signal.removeEventListener("abort", onAbort)
            Trellis.record({
              tool: "file.rewrite",
              sessionID: "inline-edit",
              args: {
                path: body.path,
                instruction: body.instruction,
                selectionLength: body.selection.length,
                replacementLength: total.length,
                aborted: abort.signal.aborted,
                providerID: resolved.providerID,
                modelID: resolved.id,
              },
              output: total.slice(0, 400),
            }).catch(() => {})
          }
        })
      },
    )
    .post(
      "/file/media",
      describeRoute({
        summary: "Upload media file",
        description: "Upload a media file (image, etc.) to .trellis/media/ and register it as a Trellis entity.",
        operationId: "file.media.upload",
        responses: {
          200: {
            description: "Uploaded media metadata",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    path: z.string(),
                    url: z.string(),
                    mediaType: z.string(),
                    size: z.number(),
                    entityId: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const body = await c.req.parseBody()
        const raw = body["file"]
        if (!raw || typeof raw === "string") return c.json({ error: "file field required" }, 400)
        const buf = Buffer.from(await raw.arrayBuffer())
        const sha = createHash("sha256").update(buf).digest("hex").slice(0, 16)
        const ext = (raw.name?.match(/\.([^.]+)$/) ?? [])[1] ?? "bin"
        const mediaType = raw.type || "application/octet-stream"
        const dir = path.join(Instance.directory, ".trellis", "media")
        await mkdir(dir, { recursive: true })
        const filename = `${sha}.${ext}`
        const dest = path.join(dir, filename)
        await writeFile(dest, buf)
        let entityId: string | undefined
        try {
          const eng = Trellis.engine()
          if (eng) {
            const store = eng.getStore?.()
            if (store) {
              const id = `media:${sha}`
              store.addFacts([
                { e: id, a: "type", v: "MediaFile" },
                { e: id, a: "name", v: filename },
                { e: id, a: "path", v: dest },
                { e: id, a: "mediaType", v: mediaType },
                { e: id, a: "size", v: buf.length },
                { e: id, a: "sha256", v: sha },
              ])
              entityId = id
            }
          }
        } catch {
          // entity registration is best-effort
        }
        return c.json({ path: dest, url: `/file/media/${filename}`, mediaType, size: buf.length, entityId })
      },
    ),
)

import { createHash } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { Instance } from "../project/instance"
import { Trellis } from "../trellis"
import { Bus } from "../bus"
import { FileWatcher } from "./watcher"
import { fetchLinkPreview } from "./link-preview"

export type LinkInput = {
  url: string
  title?: string
  description?: string
}

export type LinkAsset = {
  path: string
  name: string
  ext: string
  category: string
  kind: string
  url: string
  title?: string
  description?: string
  previewImage?: string
  previewFavicon?: string
  previewCachedAt?: string
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
  "title",
  "description",
  "previewImage",
  "previewFavicon",
  "previewCachedAt",
])

const assetId = (rel: string) => `asset:${rel.replaceAll("\\", "/")}`

const linkPath = (url: string) => {
  const slug = createHash("sha256").update(url).digest("hex").slice(0, 16)
  return `.trellis/assets/links/${slug}.link`
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

const assetFacts = (asset: LinkAsset) => {
  const id = assetId(asset.path)
  const facts: Array<{ e: string; a: string; v: string | number | boolean }> = []
  add(facts, id, "type", "Asset")
  add(facts, id, "label", asset.title || asset.name)
  add(facts, id, "path", asset.path)
  add(facts, id, "name", asset.name)
  add(facts, id, "extension", asset.ext)
  add(facts, id, "category", asset.category)
  add(facts, id, "kind", asset.kind)
  add(facts, id, "url", asset.url)
  add(facts, id, "mime", "text/uri-list")
  add(facts, id, "title", asset.title)
  add(facts, id, "description", asset.description)
  add(facts, id, "previewImage", asset.previewImage)
  add(facts, id, "previewFavicon", asset.previewFavicon)
  add(facts, id, "previewCachedAt", asset.previewCachedAt)
  return facts
}

const sync = async (asset: LinkAsset, dir: string, reason: string) => {
  await Trellis.init(dir).catch(() => undefined)
  if (!Trellis.storeStats(dir)) return

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
}

const entityToAsset = (id: string, dir: string): LinkAsset | undefined => {
  const detail = Trellis.storeEntity(id, dir)
  if (!detail) return undefined
  const fact = (attr: string) => detail.facts.find((item: { a: string }) => item.a === attr)?.v
  const str = (attr: string) => {
    const v = fact(attr)
    return typeof v === "string" ? v : undefined
  }
  if (String(fact("category") ?? "") !== "link") return undefined
  const rel = String(fact("path") ?? "")
  if (!rel) return undefined
  return {
    path: rel,
    name: String(fact("name") ?? path.basename(rel)),
    ext: "link",
    category: "link",
    kind: "link",
    url: String(fact("url") ?? ""),
    title: str("title"),
    description: str("description"),
    previewImage: str("previewImage"),
    previewFavicon: str("previewFavicon"),
    previewCachedAt: str("previewCachedAt"),
  }
}

const list = async (dir: string) => {
  await Trellis.init(dir).catch(() => undefined)
  if (!Trellis.storeStats(dir)) return [] as LinkAsset[]
  return Trellis.storeEntities(dir, { type: "Asset" })
    .map((entity) => entityToAsset(entity.id, dir))
    .filter((asset): asset is LinkAsset => !!asset)
}

const touch = async (dir: string) => {
  const root = path.join(dir, ".trellis", "assets")
  await mkdir(root, { recursive: true })
  const file = path.join(root, "links.json")
  const links = await list(dir)
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

export async function warmPreview(input: { path: string; url: string }, dir?: string): Promise<LinkAsset | undefined> {
  const root = dir ?? Instance.directory
  const id = assetId(input.path)
  await Trellis.init(root).catch(() => undefined)
  if (!Trellis.storeStats(root)) return undefined

  const existing = entityToAsset(id, root)
  if (existing?.previewCachedAt) return existing

  try {
    const preview = await fetchLinkPreview(input.url)
    const asset: LinkAsset = {
      path: input.path,
      name: existing?.name ?? new URL(input.url).hostname,
      ext: "link",
      category: "link",
      kind: "link",
      url: input.url,
      title: existing?.title ?? preview.title,
      description: existing?.description ?? preview.description,
      previewImage: preview.image,
      previewFavicon: preview.favicon,
      previewCachedAt: new Date().toISOString(),
    }
    await sync(asset, root, "link preview cached")
    await touch(root)
    return asset
  } catch {
    return existing
  }
}

export async function create(input: LinkInput, dir?: string): Promise<LinkAsset> {
  const root = dir ?? Instance.directory
  const href = new URL(input.url).href
  const rel = linkPath(href)
  const host = new URL(href).hostname
  const asset: LinkAsset = {
    path: rel,
    name: input.title ?? host,
    ext: "link",
    category: "link",
    kind: "link",
    url: href,
    title: input.title,
    description: input.description,
  }

  await sync(asset, root, "link asset created")
  await touch(root)
  void warmPreview({ path: rel, url: href }, root).catch(() => undefined)
  return asset
}

export async function exists(url: string, dir?: string) {
  const root = dir ?? Instance.directory
  const rel = linkPath(new URL(url).href)
  const id = assetId(rel)
  await Trellis.init(root).catch(() => undefined)
  return !!Trellis.storeEntity(id, root)
}

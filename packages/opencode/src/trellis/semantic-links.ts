import matter from "gray-matter"
import { Trellis } from "./index"
import { StoreSDK } from "./store-sdk"

type StoreMeta = Trellis.StoreMeta
type Link = { e1: string; a: string; e2: string }

export type ParsedWikiLink = {
  raw: string
  entityId: string
  kind: "mention" | "frontmatter"
  relation: string
}

export type SyncResult = {
  linked: number
  unlinked: number
  stubs: number
}

const MENTION_REL = "mentions"
const WIKI_RE = /\[\[([^\]]+)\]\]/g
const ENTITY_ID_RE = /^([a-z][a-z0-9_]*):([a-zA-Z0-9_.-]+)$/i
const SYSTEM_NS = new Set(["issue", "file", "symbol", "identity", "milestone", "decision"])
const SYSTEM_REL = new Set(["knows", "produced", "consulted"])
const SKIP_FM = new Set(["title", "description", "date", "created", "updated", "updatedAt", "createdAt", "tags", "type"])
const RESERVED_STUB = new Set([
  "issue",
  "project",
  "memory",
  "note",
  "agent",
  "file",
  "session",
  "branch",
  "decision",
  "operation",
  "asset",
  "source",
  "schema",
  "typeschema",
])

function stripAlias(raw: string) {
  const pipe = raw.indexOf("|")
  const base = pipe === -1 ? raw : raw.slice(0, pipe)
  const hash = base.indexOf("#")
  return (hash === -1 ? base : base.slice(0, hash)).trim()
}

export function wikiToEntityId(raw: string): string | undefined {
  const inner = stripAlias(raw)
  if (!inner) return undefined

  const direct = inner.match(ENTITY_ID_RE)
  if (direct) return `${direct[1].toLowerCase()}:${direct[2]}`

  const colon = inner.indexOf(":")
  if (colon !== -1) {
    const ns = inner.slice(0, colon).toLowerCase()
    const rest = inner.slice(colon + 1)
    const { target } = splitAnchor(rest)
    if (SYSTEM_NS.has(ns)) {
      if (ns === "issue") return `issue:${target.toUpperCase()}`
      if (ns === "decision") return `decision:${target.toUpperCase()}`
      if (ns === "file") return `file:${target.replaceAll("\\", "/")}`
      if (ns === "identity") return `identity:${target}`
      if (ns === "milestone") return `milestone:${target}`
      if (ns === "symbol") return target.includes("/") ? `file:${target}` : undefined
    }
    return `${ns}:${target.toLowerCase()}`
  }

  if (/^TRL-\d+$/i.test(inner)) return `issue:${inner.toUpperCase()}`
  if (/^DEC-\d+$/i.test(inner)) return `decision:${inner.toUpperCase()}`
  if (inner.includes("/") || /\.(md|mdx|ts|tsx|js|jsx|json|yaml|yml)$/i.test(inner)) {
    return `file:${inner.replaceAll("\\", "/")}`
  }
  return undefined
}

function splitAnchor(content: string) {
  const hash = content.indexOf("#")
  if (hash === -1) return { target: content }
  return { target: content.slice(0, hash), anchor: content.slice(hash + 1) }
}

function wikiValues(value: unknown, out: string[]) {
  if (typeof value === "string") {
    let match: RegExpExecArray | null
    const re = new RegExp(WIKI_RE.source, WIKI_RE.flags)
    while ((match = re.exec(value)) !== null) out.push(match[1])
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) wikiValues(item, out)
  }
}

function relationKey(key: string) {
  return key
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 64)
}

export function parseSemanticLinks(content: string, _source?: string): ParsedWikiLink[] {
  const parsed = matter(content)
  const out: ParsedWikiLink[] = []
  const seen = new Set<string>()

  const push = (raw: string, kind: ParsedWikiLink["kind"], relation: string) => {
    const entityId = wikiToEntityId(raw)
    if (!entityId) return
    const key = `${kind}\0${relation}\0${entityId}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ raw, entityId, kind, relation })
  }

  let match: RegExpExecArray | null
  const bodyRe = new RegExp(WIKI_RE.source, WIKI_RE.flags)
  while ((match = bodyRe.exec(parsed.content)) !== null) {
    push(match[1], "mention", MENTION_REL)
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    if (SKIP_FM.has(key)) continue
    const rel = relationKey(key)
    if (!rel) continue
    const raws: string[] = []
    wikiValues(value, raws)
    for (const raw of raws) push(raw, "frontmatter", rel)
  }

  return out
}

function desiredLinks(source: string, content: string): Link[] {
  return parseSemanticLinks(content, source).map((item) => ({
    e1: source,
    a: item.relation,
    e2: item.entityId,
  }))
}

const CMS_SKIP_ATTRS = new Set([
  "type",
  "cms_status",
  "id",
  "slug",
  "lastEdited",
  "createdAt",
  "updatedAt",
  "name",
  "title",
  "label",
])

const TEXT_FIELD_TYPES = new Set(["rich_text", "text", "longtext"])

function fieldMentionRel(fieldKey: string) {
  return `${relationKey(fieldKey)}.mentions`
}

function schemaKeys(name: string) {
  const raw = name.replace(/^schema:/, "").trim()
  const lower = raw.toLowerCase().replace(/\s+/g, "_")
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const compact = lower.replace(/[^a-z0-9]+/g, "")
  return [...new Set([lower, snake, compact].filter(Boolean))]
}

type CmsFieldDef = { key: string; type: string }

function readCmsSchema(collection: string, dir: string): CmsFieldDef[] {
  const keys = new Set(schemaKeys(collection))
  const facts = Trellis.storeFacts(dir, { limit: 5000 })
  const propsFact = facts.find(
    (f) => f.a === "props" && f.e.startsWith("schema:") && schemaKeys(f.e).some((k) => keys.has(k)),
  )
  if (!propsFact || typeof propsFact.v !== "string") return []
  try {
    const parsed = JSON.parse(propsFact.v) as CmsFieldDef[]
    return Array.isArray(parsed) ? parsed.filter((d) => d?.key && d?.type) : []
  } catch {
    return []
  }
}

type EntityFact = { a: string; v: unknown }

function isCmsEntry(entryId: string, dir: string) {
  const detail = Trellis.storeEntity(entryId, dir)
  return !!detail?.facts.some((fact: EntityFact) => fact.a === "cms_status")
}

function wikiLinksInText(text: string): Link[] {
  const links: Link[] = []
  const raws: string[] = []
  wikiValues(text, raws)
  const seen = new Set<string>()
  for (const raw of raws) {
    const entityId = wikiToEntityId(raw)
    if (!entityId || seen.has(entityId)) continue
    seen.add(entityId)
    links.push({ e1: "", a: "", e2: entityId })
  }
  return links
}

function desiredCmsLinks(entryId: string, dir: string): { links: Link[]; managed: Set<string> } {
  const detail = Trellis.storeEntity(entryId, dir)
  if (!detail) return { links: [], managed: new Set<string>() }

  const typeFact = detail.facts.find((fact: EntityFact) => fact.a === "type")
  const collection = typeof typeFact?.v === "string" ? String(typeFact.v) : entryId.split(":")[0] ?? ""
  const schema = readCmsSchema(collection, dir)
  const textFields =
    schema.length > 0
      ? schema.filter((def) => TEXT_FIELD_TYPES.has(def.type)).map((def) => def.key)
      : detail.facts
          .filter(
            (fact: EntityFact) => !CMS_SKIP_ATTRS.has(fact.a) && typeof fact.v === "string" && fact.v.includes("[["),
          )
          .map((fact: EntityFact) => fact.a)

  const links: Link[] = []
  const managed = new Set<string>()
  for (const key of textFields) {
    const rel = fieldMentionRel(key)
    managed.add(rel)
    const fact = detail.facts.find((item: EntityFact) => item.a === key)
    if (!fact || typeof fact.v !== "string") continue
    for (const item of wikiLinksInText(fact.v)) {
      links.push({ e1: entryId, a: rel, e2: item.e2 })
    }
  }
  return { links, managed }
}

function reconcileLinks(
  source: string,
  desired: Link[],
  managed: Set<string>,
  dir: string,
  meta?: StoreMeta,
): SyncResult {
  const byAttr = new Map<string, Set<string>>()
  for (const link of desired) {
    const set = byAttr.get(link.a) ?? new Set<string>()
    set.add(link.e2)
    byAttr.set(link.a, set)
  }

  const existing = Trellis.storeLinks(dir, { entity: source }) as Link[]
  const attrs = new Set(managed)
  for (const link of desired) attrs.add(link.a)
  for (const link of existing) {
    if (link.e1 !== source || SYSTEM_REL.has(link.a)) continue
    if (managed.has(link.a) || desired.some((item) => item.a === link.a)) attrs.add(link.a)
  }

  const toLink: Link[] = []
  const toUnlink: Link[] = []
  let stubs = 0

  for (const attr of attrs) {
    const want = byAttr.get(attr) ?? new Set<string>()
    const have = existing.filter((link) => link.e1 === source && link.a === attr)
    for (const link of have) {
      if (!want.has(link.e2)) toUnlink.push(link)
    }
    for (const e2 of want) {
      if (!have.some((link) => link.e2 === e2)) {
        if (ensureStub(e2, dir)) stubs++
        toLink.push({ e1: source, a: attr, e2 })
      }
    }
  }

  for (const link of existing) {
    if (link.e1 !== source || SYSTEM_REL.has(link.a) || attrs.has(link.a)) continue
    toUnlink.push(link)
  }

  if (toUnlink.length) Trellis.storeUnlink(toUnlink, dir, meta)
  if (toLink.length) Trellis.storeLink(toLink, dir, meta)
  return { linked: toLink.length, unlinked: toUnlink.length, stubs }
}

function ensureStub(id: string, dir: string) {
  if (Trellis.storeEntity(id, dir)) return false
  const type = id.split(":")[0]?.toLowerCase()
  if (!type || RESERVED_STUB.has(type)) return false
  const slug = id.slice(type.length + 1)
  StoreSDK.defineEntity(type, id, { label: slug.replace(/[-_]+/g, " "), status: "stub" }, dir)
  return true
}

export function findBrokenSemanticLinks(dir: string): Array<{ source: string; relation: string; target: string }> {
  if (!Trellis.storeStats(dir)) return []
  const broken: Array<{ source: string; relation: string; target: string }> = []
  for (const link of Trellis.storeLinks(dir)) {
    if (SYSTEM_REL.has(link.a)) continue
    const cmsField = link.a.endsWith(".mentions")
    if (link.a !== MENTION_REL && !link.e1.startsWith("note:") && !link.e1.startsWith("file:") && !cmsField) continue
    if (Trellis.storeEntity(link.e2, dir)) continue
    broken.push({ source: link.e1, relation: link.a, target: link.e2 })
  }
  return broken.slice(0, 20)
}

export function sync(source: string, content: string, dir: string, meta?: StoreMeta): SyncResult {
  if (!Trellis.storeStats(dir)) return { linked: 0, unlinked: 0, stubs: 0 }
  const desired = desiredLinks(source, content)
  const managed = new Set<string>([MENTION_REL])
  for (const link of desired) managed.add(link.a)
  const existing = Trellis.storeLinks(dir, { entity: source }) as Link[]
  for (const link of existing) {
    if (link.e1 !== source || SYSTEM_REL.has(link.a)) continue
    if (link.a === MENTION_REL || desired.some((item) => item.a === link.a)) managed.add(link.a)
  }
  return reconcileLinks(source, desired, managed, dir, meta)
}

export function syncCmsEntry(entryId: string, dir: string, meta?: StoreMeta): SyncResult {
  if (!Trellis.storeStats(dir) || !isCmsEntry(entryId, dir)) return { linked: 0, unlinked: 0, stubs: 0 }
  const { links, managed } = desiredCmsLinks(entryId, dir)
  const existing = Trellis.storeLinks(dir, { entity: entryId }) as Link[]
  for (const link of existing) {
    if (link.a.endsWith(".mentions")) managed.add(link.a)
  }
  return reconcileLinks(entryId, links, managed, dir, meta)
}

export function syncCmsEntriesFromFacts(
  facts: Array<{ e: string; a: string; v: unknown }>,
  dir: string,
  meta?: StoreMeta,
): SyncResult {
  const totals = { linked: 0, unlinked: 0, stubs: 0 }
  const ids = new Set<string>()
  for (const fact of facts) {
    if (isCmsEntry(fact.e, dir)) ids.add(fact.e)
  }
  for (const id of ids) {
    const result = syncCmsEntry(id, dir, meta)
    totals.linked += result.linked
    totals.unlinked += result.unlinked
    totals.stubs += result.stubs
  }
  return totals
}

export function syncMarkdownFile(path: string, content: string, dir: string, meta?: StoreMeta) {
  const rel = path.replaceAll("\\", "/").replace(/^\.\//, "")
  if (!/\.(md|mdx)$/i.test(rel)) return { linked: 0, unlinked: 0, stubs: 0 }
  return sync(`file:${rel}`, content, dir, meta)
}

export function syncNote(noteId: string, content: string, dir: string, meta?: StoreMeta) {
  return sync(noteId, content, dir, meta)
}

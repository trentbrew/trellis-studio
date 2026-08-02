import { createHash } from "crypto"
import { Trellis } from "../trellis"
import { Instance } from "../project/instance"

export type SourceInput = {
  url: string
  title?: string
  snippet?: string
  tool: string
  sessionID: string
  messageID: string
  callID?: string
  retrievedAt?: number
}

export type SourceRecord = {
  id: string
  url: string
  domain: string
  title?: string
  snippet?: string
  tool: string
  sessionID: string
  messageID: string
  callID?: string
  retrievedAt: number
}

const FACTS = new Set([
  "type",
  "label",
  "url",
  "domain",
  "title",
  "snippet",
  "tool",
  "sessionID",
  "messageID",
  "callID",
  "retrievedAt",
])

export function normalizeUrl(raw: string) {
  const url = new URL(raw)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }
  return url.href
}

export function sourceId(url: string) {
  const href = normalizeUrl(url)
  const slug = createHash("sha256").update(href).digest("hex").slice(0, 16)
  return `source:${slug}`
}

export function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
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

const sourceFacts = (source: SourceRecord) => {
  const facts: Array<{ e: string; a: string; v: string | number | boolean }> = []
  add(facts, source.id, "type", "Source")
  add(facts, source.id, "label", source.title || source.domain)
  add(facts, source.id, "url", source.url)
  add(facts, source.id, "domain", source.domain)
  add(facts, source.id, "title", source.title)
  add(facts, source.id, "snippet", source.snippet)
  add(facts, source.id, "tool", source.tool)
  add(facts, source.id, "sessionID", source.sessionID)
  add(facts, source.id, "messageID", source.messageID)
  add(facts, source.id, "callID", source.callID)
  add(facts, source.id, "retrievedAt", source.retrievedAt)
  return facts
}

const sync = async (source: SourceRecord, dir: string, reason: string) => {
  await Trellis.init(dir).catch(() => undefined)
  if (!Trellis.storeStats(dir)) return

  const facts = sourceFacts(source)
  const byEntity = new Map<string, typeof facts>()
  for (const fact of facts) {
    const list = byEntity.get(fact.e) ?? []
    list.push(fact)
    byEntity.set(fact.e, list)
  }

  const assert: typeof facts = []
  const retract: typeof facts = []
  const meta = {
    actor: "research",
    actorKind: "system" as const,
    source: "research-sources",
    reason,
    relatedEntities: [source.id, `session:${source.sessionID}`],
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

  Trellis.storeLink([{ e1: `session:${source.sessionID}`, a: "consulted", e2: source.id }], dir, meta)
}

export async function upsert(input: SourceInput, dir?: string): Promise<SourceRecord> {
  const root = dir ?? Instance.directory
  const url = normalizeUrl(input.url)
  const id = sourceId(url)
  const record: SourceRecord = {
    id,
    url,
    domain: domain(url),
    title: input.title,
    snippet: input.snippet,
    tool: input.tool,
    sessionID: input.sessionID,
    messageID: input.messageID,
    callID: input.callID,
    retrievedAt: input.retrievedAt ?? Date.now(),
  }

  await sync(record, root, "research source captured")
  return record
}

export async function exists(url: string, dir?: string) {
  const root = dir ?? Instance.directory
  await Trellis.init(root).catch(() => undefined)
  return !!Trellis.storeEntity(sourceId(normalizeUrl(url)), root)
}

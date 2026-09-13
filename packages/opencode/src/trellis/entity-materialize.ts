import matter from "gray-matter"
import path from "path"
import { unlink } from "fs/promises"
import {
  defaultEntityMarkdownPath,
  entityIdFromMarkdownPath,
  isEntityMarkdownPath,
} from "@opencode-ai/whiteboard/paths"
import { Trellis } from "./index"
import { Filesystem } from "../util/filesystem"
import * as SemanticLinks from "./semantic-links"

type Fact = { e: string; a: string; v: unknown }
type StoreFact = { e: string; a: string; v: string | number | boolean }
type Json = string | number | boolean
type EntityFact = { a: string; v: unknown }

function asJson(v: unknown): Json {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v
  return String(v)
}

const SKIP = new Set([
  "type",
  "cms_status",
  "id",
  "createdAt",
  "createdBy",
  "lastEdited",
  "updatedAt",
  "path",
  "contentHash",
])
const BODY_KEYS = ["body", "description", "content"] as const

function norm(rel: string) {
  return rel.replaceAll("\\", "/").replace(/^\.\//, "")
}

function full(dir: string, rel: string) {
  return path.join(dir, norm(rel))
}

function isCms(id: string, dir: string) {
  const detail = Trellis.storeEntity(id, dir)
  return !!detail?.facts.some((fact: EntityFact) => fact.a === "cms_status")
}

function entityFacts(id: string, dir: string) {
  return Trellis.storeEntity(id, dir)?.facts ?? []
}

function val(list: readonly EntityFact[], attr: string) {
  const hit = list.find((fact) => fact.a === attr)
  return hit?.v
}

function pathFromFacts(id: string, list: readonly EntityFact[]) {
  const hit = list.find((fact) => fact.a === "path")
  if (typeof hit?.v === "string" && hit.v.trim()) return norm(hit.v)
  return defaultEntityMarkdownPath(id)
}

function bodyFromFacts(list: readonly EntityFact[]) {
  for (const key of BODY_KEYS) {
    const hit = list.find((fact) => fact.a === key)
    if (typeof hit?.v === "string" && hit.v.trim()) return hit.v
  }
  return ""
}

function frontmatter(id: string, list: readonly EntityFact[]) {
  const out: Record<string, unknown> = {}
  const meta: Record<string, unknown> = { id }
  const type = val(list, "type")
  const status = val(list, "cms_status")
  if (type) meta.type = type
  if (status) meta.cms_status = status
  out.trellis = meta
  for (const fact of list) {
    if (SKIP.has(fact.a) || (BODY_KEYS as readonly string[]).includes(fact.a)) continue
    if (fact.v === undefined || fact.v === null || fact.v === "") continue
    out[fact.a] = fact.v
  }
  return out
}

function render(id: string, list: readonly EntityFact[], body: string) {
  const data = frontmatter(id, list)
  const next = body.trim()
  return matter.stringify(next ? `${next}\n` : "", data)
}

function entityId(rel: string, content: string) {
  const parsed = matter(content)
  const meta = parsed.data?.trellis
  if (meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).id === "string") {
    return (meta as Record<string, unknown>).id as string
  }
  return entityIdFromMarkdownPath(rel)
}

export function resolvePath(id: string, dir: string) {
  return pathFromFacts(id, entityFacts(id, dir))
}

export async function materialize(id: string, dir: string, meta?: Trellis.StoreMeta) {
  if (!isCms(id, dir)) return false
  const list = entityFacts(id, dir)
  const rel = pathFromFacts(id, list)
  const text = render(id, list, bodyFromFacts(list))
  await Filesystem.write(full(dir, rel), text)

  const pathFact = list.find((fact: EntityFact) => fact.a === "path")
  if (!pathFact || pathFact.v !== rel) {
    Trellis.storeAssert([{ e: id, a: "path", v: rel }], dir, meta)
  }

  SemanticLinks.sync(id, text, dir, meta)
  return true
}

export async function ensure(id: string, dir: string, meta?: Trellis.StoreMeta) {
  if (!isCms(id, dir)) return false
  const rel = resolvePath(id, dir)
  const exists = await Filesystem.exists(full(dir, rel))
  if (!exists) return materialize(id, dir, meta)
  const list = entityFacts(id, dir)
  const pathFact = list.find((fact: EntityFact) => fact.a === "path")
  if (!pathFact || pathFact.v !== rel) {
    Trellis.storeAssert([{ e: id, a: "path", v: rel }], dir, meta)
  }
  return true
}

export async function ensureFromFacts(facts: Fact[], dir: string, meta?: Trellis.StoreMeta) {
  const ids = new Set<string>()
  for (const fact of facts) {
    if (fact.a === "cms_status") ids.add(fact.e)
  }
  for (const id of ids) await ensure(id, dir, meta)
}

export async function ingest(relPath: string, content: string, dir: string, meta?: Trellis.StoreMeta) {
  const rel = norm(relPath)
  if (!/\.(md|mdx)$/i.test(rel)) return false
  const id = entityId(rel, content)
  if (!id || !isCms(id, dir)) return false

  const detail = Trellis.storeEntity(id, dir)
  if (!detail) return false

  const parsed = matter(content)
  const retracts: StoreFact[] = []
  const asserts: StoreFact[] = []
  const body = parsed.content.trim()

  if (body) {
    let wrote = false
    for (const key of BODY_KEYS) {
      const old = detail.facts.find((fact: EntityFact) => fact.a === key)
      if (old && old.v !== body) retracts.push({ e: id, a: key, v: asJson(old.v) })
      if (!wrote && (!old || old.v !== body)) {
        asserts.push({ e: id, a: "body", v: body })
        wrote = true
      }
    }
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "trellis" || SKIP.has(key) || (BODY_KEYS as readonly string[]).includes(key)) continue
    if (value !== null && typeof value === "object") continue
    const old = detail.facts.find((fact: EntityFact) => fact.a === key)
    if (old && old.v !== value) retracts.push({ e: id, a: key, v: asJson(old.v) })
    if (!old || old.v !== value) asserts.push({ e: id, a: key, v: asJson(value) })
  }

  const pathOld = detail.facts.find((fact: EntityFact) => fact.a === "path")
  if (!pathOld || pathOld.v !== rel) {
    if (pathOld) retracts.push({ e: id, a: "path", v: asJson(pathOld.v) })
    asserts.push({ e: id, a: "path", v: rel })
  }

  if (retracts.length) Trellis.storeRetract(retracts, dir, meta)
  if (asserts.length) Trellis.storeAssert(asserts, dir, meta)
  SemanticLinks.sync(id, content, dir, meta)
  return true
}

export async function remove(id: string, dir: string, list?: readonly EntityFact[]) {
  const facts = list ?? entityFacts(id, dir)
  const rel = pathFromFacts(id, facts)
  const file = full(dir, rel)
  if (await Filesystem.exists(file)) await unlink(file).catch(() => undefined)
  return true
}

export function shouldIngestMarkdown(relPath: string, content: string) {
  const rel = norm(relPath)
  if (!/\.(md|mdx)$/i.test(rel)) return false
  if (isEntityMarkdownPath(rel)) return true
  const parsed = matter(content)
  const meta = parsed.data?.trellis
  return !!(meta && typeof meta === "object" && typeof (meta as Record<string, unknown>).id === "string")
}

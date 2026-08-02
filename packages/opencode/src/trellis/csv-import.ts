import z from "zod"
import { normalizeCollectionKey, validateCollectionKey } from "@opencode-ai/util/collection-key"
import { Trellis } from "."
import * as SemanticLinks from "./semantic-links"
import { parseCsv } from "./csv"

type Json = string | number | boolean
type Fact = { e: string; a: string; v: Json }
type Status = "draft" | "published" | "archived"
type FieldKind = "text" | "rich_text" | "number" | "boolean" | "date" | "email" | "url"
type Field = { key: string; label?: string; type?: string; [key: string]: unknown }
type Header = { raw: string; key: string; label: string }
type Row = { id: string; status: Status; values: Map<string, Json>; fresh: boolean }

const RESERVED = new Set(["id", "type", "cms_status"])
const READONLY = new Set(["createdAt", "createdBy", "lastEdited", "updatedAt", "slug"])
const CANON: Record<string, string> = {
  createdat: "createdAt",
  created_at: "createdAt",
  createdby: "createdBy",
  created_by: "createdBy",
  lastedited: "lastEdited",
  last_edited: "lastEdited",
  updatedat: "updatedAt",
  updated_at: "updatedAt",
}
const TITLE = ["name", "title", "label", "description"]
const NUM = /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i
const DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-Z]+)?$/i
const MDY = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STRINGY = /(^id$|_id$|id_|zip|postal|phone|tel|code|sku)/i

export const CsvImportBody = z.object({
  csv: z.string().min(1),
  collection: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  schema: z.enum(["extend", "none"]).optional(),
  dryRun: z.boolean().optional(),
})

export const CsvImportResult = z.object({
  collection: z.string(),
  imported: z.number(),
  facts: z.number(),
  retracted: z.number(),
  fields: z.array(z.string()),
  ids: z.array(z.string()),
  schema: z.object({
    created: z.boolean(),
    extended: z.array(z.string()),
  }),
  warnings: z.array(z.string()),
})

export type CsvImportInput = z.infer<typeof CsvImportBody> & {
  dir?: string
  meta?: Trellis.StoreMeta
}

export type CsvImportResult = z.infer<typeof CsvImportResult>

function humanize(raw: string) {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
    .trim()
}

function key(raw: string, i: number) {
  const clean = raw
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
  if (!clean) return `column_${i + 1}`
  const attr = /^[a-z]/.test(clean) ? clean : `field_${clean}`
  return CANON[attr] ?? attr
}

function slug(raw: string) {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
  return clean || short()
}

function short() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function value(raw: string, attr: string): Json | undefined {
  const text = raw.trim()
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower === "true" || lower === "yes") return true
  if (lower === "false" || lower === "no") return false
  if (!STRINGY.test(attr) && NUM.test(text)) {
    const n = Number(text)
    if (Number.isFinite(n)) return n
  }
  return text
}

function dateish(raw: string) {
  const text = raw.trim()
  return DATE.test(text) || MDY.test(text)
}

function dateValue(raw: string) {
  if (DATE.test(raw) && raw.length === 10) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toISOString()
}

function urlish(raw: string) {
  try {
    new URL(raw)
    return true
  } catch {
    return false
  }
}

function fieldType(header: Header, values: Json[]): FieldKind {
  if (values.length === 0) return "text"
  if (values.every((v) => typeof v === "boolean")) return "boolean"
  if (values.every((v) => typeof v === "number")) return "number"
  const strings = values.filter((v): v is string => typeof v === "string")
  if (strings.length !== values.length) return "text"
  if (strings.every(dateish)) return "date"
  if ((header.key.includes("email") || strings.every((s) => EMAIL.test(s))) && strings.every((s) => EMAIL.test(s)))
    return "email"
  if (
    (header.key.includes("url") || header.key.includes("link") || strings.every(urlish)) &&
    strings.every(urlish)
  )
    return "url"
  if (strings.some((s) => s.length > 120 || s.includes("\n"))) return "rich_text"
  return "text"
}

function headers(raw: string[], width: number, warnings: string[]) {
  const seen = new Map<string, number>()
  return Array.from({ length: width }).map((_, i) => {
    const source = raw[i] ?? ""
    const base = key(source, i)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const attr = count === 0 ? base : `${base}_${count + 1}`
    if (count > 0) warnings.push(`Renamed duplicate column "${source || base}" to "${attr}".`)
    return {
      raw: source,
      key: attr,
      label: source.trim().replace(/^\uFEFF/, "") || humanize(attr),
    }
  })
}

function fact(input: unknown): Fact | undefined {
  if (!input || typeof input !== "object") return undefined
  const item = input as { e?: unknown; a?: unknown; v?: unknown }
  if (typeof item.e !== "string" || typeof item.a !== "string") return undefined
  if (typeof item.v === "string" || typeof item.v === "number" || typeof item.v === "boolean") {
    return { e: item.e, a: item.a, v: item.v }
  }
  return undefined
}

function facts(id: string, dir?: string) {
  return (Trellis.storeEntity(id, dir)?.facts ?? []).map(fact).filter((item: Fact | undefined): item is Fact => !!item)
}

function readSchema(key: string, dir?: string): Field[] {
  const raw = facts(`schema:${key}`, dir).find((f: Fact) => f.a === "props")?.v
  if (typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is Field => {
      if (!item || typeof item !== "object") return false
      return typeof (item as { key?: unknown }).key === "string"
    })
  } catch {
    return []
  }
}

function hasSchema(key: string, dir?: string) {
  const list = facts(`schema:${key}`, dir)
  return list.some((f: Fact) => f.a === "type" && f.v === "TypeSchema") && list.some((f: Fact) => f.a === "cms" && f.v === true)
}

function factsForField(id: string, schema: string, def: Field, order: number): Fact[] {
  return [
    { e: id, a: "type", v: "Field" },
    { e: id, a: "collection", v: schema },
    { e: id, a: "key", v: def.key },
    { e: id, a: "label", v: typeof def.label === "string" ? def.label : humanize(def.key) },
    { e: id, a: "kind", v: typeof def.type === "string" ? def.type : "text" },
    { e: id, a: "order", v: order },
  ]
}

function status(raw: string | undefined, fallback: Status): Status {
  const text = raw?.trim().toLowerCase()
  if (text === "published" || text === "archived" || text === "draft") return text
  return fallback
}

function rowId(collection: string, row: string[], heads: Header[], used: Set<string>) {
  const id = heads.findIndex((h) => h.key === "id")
  const raw = id >= 0 ? row[id]?.trim() : ""
  const named = TITLE.map((name) => heads.findIndex((h) => h.key === name))
    .map((i) => (i >= 0 ? row[i]?.trim() : ""))
    .find((v): v is string => !!v)
  const source = raw || named
  const base = source
    ? `${collection}:${slug(source.includes(":") ? source.slice(source.indexOf(":") + 1) : source)}`
    : `${collection}:${short()}`
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  for (let i = 2; ; i++) {
    const next = `${base}_${i}`
    if (used.has(next)) continue
    used.add(next)
    return next
  }
}

function plan(input: CsvImportInput) {
  const collection = normalizeCollectionKey(input.collection)
  if (!collection) throw new Error("Collection is required.")
  const known = hasSchema(collection, input.dir)
  const error = known ? null : validateCollectionKey(collection)
  if (error) throw new Error(error)

  const parsed = parseCsv(input.csv)
  if (parsed.length < 2) throw new Error("CSV must include a header row and at least one data row.")
  const warnings: string[] = []
  const width = Math.max(...parsed.map((row) => row.length))
  const heads = headers(parsed[0], width, warnings)
  const data = parsed.slice(1)
  const valueHeads = heads.filter((h) => !RESERVED.has(h.key))
  const schemaHeads = valueHeads.filter((h) => !READONLY.has(h.key))
  const samples = new Map<string, Json[]>()

  for (const head of schemaHeads) samples.set(head.key, [])
  for (const row of data) {
    for (const head of schemaHeads) {
      const i = heads.findIndex((h) => h.key === head.key)
      const v = value(row[i] ?? "", head.key)
      if (v !== undefined) samples.get(head.key)?.push(v)
    }
  }

  const existing = readSchema(collection, input.dir)
  const existingKeys = new Set(existing.map((f) => f.key))
  const inferred = schemaHeads
    .filter((h) => !existingKeys.has(h.key))
    .map((h) => ({
      key: h.key,
      label: h.label,
      type: fieldType(h, samples.get(h.key) ?? []),
    }))
  const schema = [...existing, ...inferred]
  const types = new Map(schema.map((f) => [f.key, f.type]))
  const existingIds = new Set(Trellis.storeEntities(input.dir, { limit: 100_000 }).map((e) => e.id))
  const used = new Set<string>()
  const rows: Row[] = data.flatMap((item) => {
    if (!item.some((cell) => cell.trim() !== "")) return []
    const id = rowId(collection, item, heads, used)
    const values = new Map<string, Json>()
    for (const head of valueHeads) {
      const i = heads.findIndex((h) => h.key === head.key)
      const v = value(item[i] ?? "", head.key)
      if (v === undefined) continue
      values.set(head.key, types.get(head.key) === "date" && typeof v === "string" ? dateValue(v) : v)
    }
    return [
      {
        id,
        status: status(item[heads.findIndex((h) => h.key === "cms_status")], input.status ?? "draft"),
        values,
        fresh: !existingIds.has(id),
      },
    ]
  })
  if (rows.length === 0) throw new Error("CSV has no importable data rows.")

  const now = new Date().toISOString()
  const asserts: Fact[] = []
  const retracts: Fact[] = []
  const created = input.schema !== "none" && !known
  const schemaId = `schema:${collection}`
  const oldProps = facts(schemaId, input.dir).filter((f: Fact) => f.a === "props")

  if (input.schema !== "none") {
    retracts.push(...oldProps)
    if (!known) {
      asserts.push({ e: schemaId, a: "type", v: "TypeSchema" })
      asserts.push({ e: schemaId, a: "label", v: input.label?.trim() || humanize(collection) })
      asserts.push({ e: schemaId, a: "cms", v: true })
    }
    asserts.push({ e: schemaId, a: "props", v: JSON.stringify(schema) })
    for (const [i, def] of schema.entries()) {
      if (existingKeys.has(def.key)) continue
      asserts.push(...factsForField(`field:${collection}.${def.key}`, schemaId, def, i))
    }
  }

  for (const row of rows) {
    const attrs = new Set(["type", "cms_status", "lastEdited", ...row.values.keys()])
    if (row.fresh) {
      attrs.add("createdAt")
      attrs.add("createdBy")
    }
    retracts.push(...facts(row.id, input.dir).filter((f: Fact) => attrs.has(f.a)))
    asserts.push({ e: row.id, a: "type", v: collection })
    asserts.push({ e: row.id, a: "cms_status", v: row.status })
    if (row.fresh && !row.values.has("createdAt")) asserts.push({ e: row.id, a: "createdAt", v: now })
    if (row.fresh && !row.values.has("createdBy")) asserts.push({ e: row.id, a: "createdBy", v: "csv" })
    if (!row.values.has("lastEdited")) asserts.push({ e: row.id, a: "lastEdited", v: now })
    for (const [attr, v] of row.values) asserts.push({ e: row.id, a: attr, v })
  }

  return {
    collection,
    rows,
    asserts,
    retracts,
    schema: { created, extended: input.schema === "none" ? [] : inferred.map((f) => f.key) },
    fields: schema.map((f) => f.key),
    warnings,
  }
}

export function importCsv(input: CsvImportInput): CsvImportResult {
  const job = plan(input)
  if (!input.dryRun) {
    if (job.retracts.length > 0) Trellis.storeRetract(job.retracts, input.dir, input.meta)
    const result = Trellis.storeAssert(job.asserts, input.dir, input.meta)
    if (!result) throw new Error("Trellis store not available.")
    SemanticLinks.syncCmsEntriesFromFacts(job.asserts, input.dir ?? "", {
      ...(input.meta ?? {}),
      reason: input.meta?.reason ?? "csv import semantic link sync",
    })
  }
  return {
    collection: job.collection,
    imported: job.rows.length,
    facts: job.asserts.length,
    retracted: job.retracts.length,
    fields: job.fields,
    ids: job.rows.map((row) => row.id),
    schema: job.schema,
    warnings: job.warnings,
  }
}

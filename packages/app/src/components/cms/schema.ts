import type { StoreFact } from "@/context/trellis-store"
import type { PropDef } from "@/pages/session/database-panel-utils"

export type FieldRule = {
  key: string
  label?: string
  required?: boolean
  type?: string
}

export type PublishBlock = {
  id: string
  missing: string[]
}

const SKIP = new Set(["type", "cms_status", "id", "createdAt", "createdBy", "lastEdited", "updatedAt"])

export function schemaProps(facts: StoreFact[], schemaId: string): PropDef[] {
  const raw = facts.find((f) => f.e === schemaId && f.a === "props")?.v
  if (typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as PropDef[]) : []
  } catch {
    return []
  }
}

export function isEmptyValue(v: StoreFact["v"] | undefined): boolean {
  if (v === undefined || v === null || v === "") return true
  if (typeof v === "boolean") return false
  if (typeof v === "number") return Number.isNaN(v)
  if (typeof v === "string") return v.trim() === ""
  return false
}

export function missingRequired(props: FieldRule[], read: (key: string) => StoreFact["v"] | undefined): FieldRule[] {
  return props.filter((def) => {
    if (!def.required || SKIP.has(def.key) || def.type === "formula") return false
    return isEmptyValue(read(def.key))
  })
}

export function publishError(props: FieldRule[], read: (key: string) => StoreFact["v"] | undefined): string | null {
  const missing = missingRequired(props, read)
  if (missing.length === 0) return null
  const names = missing.map((def) => def.label || def.key)
  if (names.length === 1) return `Missing required field: ${names[0]}`
  if (names.length <= 3) return `Missing required fields: ${names.join(", ")}`
  return `Missing ${names.length} required fields: ${names.slice(0, 3).join(", ")}…`
}

export function publishBlocks(
  props: FieldRule[],
  ids: string[],
  read: (id: string, key: string) => StoreFact["v"] | undefined,
): PublishBlock[] {
  return ids.flatMap((id) => {
    const missing = missingRequired(props, (key) => read(id, key)).map((def) => def.label || def.key)
    return missing.length > 0 ? [{ id, missing }] : []
  })
}

function castDefault(def: PropDef, raw: string): StoreFact["v"] {
  if (def.type === "number") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : raw
  }
  if (def.type === "boolean") return raw === "true" || raw === "1"
  return raw
}

export function defaultFacts(id: string, props: PropDef[]): StoreFact[] {
  return props.flatMap((def) => {
    if (SKIP.has(def.key) || def.default === undefined || def.default === "") return []
    return [{ e: id, a: def.key, v: castDefault(def, def.default) }]
  })
}

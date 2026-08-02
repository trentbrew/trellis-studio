import type { StoreFact } from "@/context/trellis-store"

export const DISPLAY_KEYS = ["name", "title", "label", "description"] as const
export const NAME_ALIASES = ["title", "label"] as const

export function slugify(value: unknown) {
  if (typeof value !== "string") return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function read(facts: StoreFact[], key: string) {
  return facts.find((f) => f.a === key)?.v
}

export function entryLabel(facts: StoreFact[], fallback: string) {
  for (const key of DISPLAY_KEYS) {
    const v = read(facts, key)
    if (typeof v === "string" && v.trim()) return v
  }
  return fallback
}

export function entityIdSuffix(id: string): string {
  return id.includes(":") ? id.split(":").slice(1).join(":") : id
}

export function buildEntityLabelIndex(
  facts: ReadonlyArray<{ e: string; a: string; v: unknown }>,
): Map<string, string> {
  const byEntity = new Map<string, Partial<Record<(typeof DISPLAY_KEYS)[number], string>>>()
  for (const fact of facts) {
    if (!(DISPLAY_KEYS as readonly string[]).includes(fact.a)) continue
    if (typeof fact.v !== "string" || !fact.v.trim()) continue
    const attrs = byEntity.get(fact.e) ?? {}
    if (attrs[fact.a as (typeof DISPLAY_KEYS)[number]]) continue
    attrs[fact.a as (typeof DISPLAY_KEYS)[number]] = fact.v.trim()
    byEntity.set(fact.e, attrs)
  }
  const out = new Map<string, string>()
  for (const [id, attrs] of byEntity) {
    for (const key of DISPLAY_KEYS) {
      const value = attrs[key]
      if (value) {
        out.set(id, value)
        break
      }
    }
  }
  return out
}

export function resolveEntityLabel(
  id: string,
  opts?: { label?: string | null; labels?: ReadonlyMap<string, string> | Record<string, string> },
): string {
  const explicit = opts?.label?.trim()
  if (explicit) return explicit
  const map = opts?.labels
  let fromMap: string | undefined
  if (map instanceof Map) fromMap = map.get(id)
  else if (map && Object.prototype.hasOwnProperty.call(map, id)) fromMap = (map as Record<string, string>)[id]
  if (fromMap?.trim()) return fromMap.trim()
  return entityIdSuffix(id)
}

export function aliasName(facts: StoreFact[]) {
  const name = read(facts, "name")
  if (typeof name === "string" && name.trim()) return
  for (const key of NAME_ALIASES) {
    const v = read(facts, key)
    if (typeof v === "string" && v.trim()) return { key, value: v.trim() }
  }
}

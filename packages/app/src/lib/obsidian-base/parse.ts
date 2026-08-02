import YAML from "yaml"
import type { BaseFilterNode, BasePropertyDef, BaseSpec, BaseView, BaseViewType } from "./types"

export function parseBase(src: string): BaseSpec {
  const raw = YAML.parse(src) ?? {}
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid .base file: expected object at root")
  }
  return {
    filters: parseFilters(raw.filters),
    properties: parseProperties(raw.properties),
    views: parseViews(raw.views),
  }
}

function parseFilters(raw: unknown): BaseFilterNode | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === "string") return { kind: "expr", src: raw }
  if (Array.isArray(raw)) {
    // Bare array under filters: → and of items
    return { kind: "and", items: raw.flatMap((item) => filterChild(item)) }
  }
  if (typeof raw === "object") {
    return filterFromObject(raw as Record<string, unknown>)
  }
  return undefined
}

function filterFromObject(obj: Record<string, unknown>): BaseFilterNode | undefined {
  const keys = Object.keys(obj)
  if (keys.length === 1) {
    const k = keys[0]
    const v = obj[k]
    if (k === "and" && Array.isArray(v)) {
      return { kind: "and", items: v.flatMap(filterChild) }
    }
    if (k === "or" && Array.isArray(v)) {
      return { kind: "or", items: v.flatMap(filterChild) }
    }
    if (k === "not") {
      const inner = parseFilters(v)
      if (inner) return { kind: "not", item: inner }
      return undefined
    }
  }
  // Multi-key object — treat as implicit `and` over each key's filter.
  const children: BaseFilterNode[] = []
  for (const k of keys) {
    if (k === "and" || k === "or" || k === "not") {
      const inner = parseFilters({ [k]: obj[k] })
      if (inner) children.push(inner)
    }
  }
  if (children.length === 1) return children[0]
  if (children.length > 1) return { kind: "and", items: children }
  return undefined
}

function filterChild(item: unknown): BaseFilterNode[] {
  if (typeof item === "string") {
    const trimmed = item.trim()
    if (trimmed.startsWith("!")) return [{ kind: "not", item: { kind: "expr", src: trimmed.slice(1).trim() } }]
    return [{ kind: "expr", src: trimmed }]
  }
  if (item && typeof item === "object") {
    const inner = filterFromObject(item as Record<string, unknown>)
    return inner ? [inner] : []
  }
  return []
}

function parseProperties(raw: unknown): Record<string, BasePropertyDef> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, BasePropertyDef> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const def = value as { displayName?: unknown }
    out[key] = {
      key,
      displayName: typeof def.displayName === "string" ? def.displayName : undefined,
    }
  }
  return out
}

function parseViews(raw: unknown): BaseView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []
    const v = entry as Record<string, unknown>
    const type = (typeof v.type === "string" ? v.type : "table") as BaseViewType
    const name = typeof v.name === "string" ? v.name : type
    const view: BaseView = {
      type,
      name,
      filters: parseFilters(v.filters),
      order: Array.isArray(v.order) ? (v.order as string[]) : undefined,
      limit: typeof v.limit === "number" ? v.limit : undefined,
    }
    if (v.groupBy && typeof v.groupBy === "object" && !Array.isArray(v.groupBy)) {
      const g = v.groupBy as { property?: string; direction?: "ASC" | "DESC" }
      if (g.property) view.groupBy = { property: g.property, direction: g.direction }
    } else if (typeof v.groupBy === "string") {
      view.groupBy = v.groupBy
    }
    if (Array.isArray(v.sort)) {
      view.sort = (v.sort as Array<{ property?: string; direction?: "ASC" | "DESC" }>)
        .filter((s) => s && typeof s.property === "string")
        .map((s) => ({ property: s.property!, direction: s.direction }))
    }
    return [view]
  })
}

export function combineFilters(
  a: BaseFilterNode | undefined,
  b: BaseFilterNode | undefined,
): BaseFilterNode | undefined {
  if (!a) return b
  if (!b) return a
  return { kind: "and", items: [a, b] }
}

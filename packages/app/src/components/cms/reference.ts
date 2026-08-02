import type { StoreFact, StoreLink } from "@/context/trellis-store"
import { matchesType, type PropDef } from "@/pages/session/database-panel-utils"

import { DISPLAY_KEYS } from "@/components/cms/display"

export const REFERENCE_DISPLAY_KEYS = DISPLAY_KEYS

const REF_ID_RE = /^[a-z][a-z0-9_]*:[a-z0-9-]+/i

export function looksLikeRef(value: unknown) {
  if (typeof value !== "string") return false
  const part = value.split(",")[0]?.trim()
  return !!part && REF_ID_RE.test(part)
}

export function parseRefs(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinRefs(ids: string[]) {
  return ids.join(", ")
}

export function labelOf(id: string, facts: Map<string, StoreFact[]>): string {
  const list = facts.get(id) ?? []
  for (const k of REFERENCE_DISPLAY_KEYS) {
    const f = list.find((fact) => fact.a === k)
    if (f && typeof f.v === "string" && f.v.trim()) return f.v
  }
  return id.includes(":") ? id.split(":").slice(1).join(":") : id
}

type RefSchema = { key: string; label?: string; type?: string; target?: string }

export function referenceCols(
  cols: string[],
  schema: Map<string, RefSchema>,
  raw: (id: string, key: string) => StoreFact["v"] | undefined,
  entries: { id: string }[],
): Map<string, PropDef> {
  const result = new Map<string, PropDef>()
  for (const col of cols) {
    const def = schema.get(col)
    if (def?.type === "reference") {
      result.set(col, { key: col, label: def.label ?? col, type: "reference", target: def.target })
      continue
    }
    if (def?.type && def.type !== "text") continue
    const hit = entries.some((entry) => looksLikeRef(raw(entry.id, col)))
    if (hit) result.set(col, { key: col, label: def?.label ?? col, type: "reference", target: def?.target })
  }
  return result
}

export function refMulti(
  col: string,
  raw: (id: string, key: string) => StoreFact["v"] | undefined,
  entries: { id: string }[],
) {
  return entries.some((entry) => {
    const v = raw(entry.id, col)
    return typeof v === "string" && v.includes(",")
  })
}

export type Backlink = {
  id: string
  via: string
}

export function backlinkIndex(facts: StoreFact[], links: StoreLink[]) {
  const byTarget = new Map<string, Map<string, Backlink>>()

  const add = (target: string, source: string, via: string) => {
    if (!target || !source || target === source) return
    let sources = byTarget.get(target)
    if (!sources) {
      sources = new Map()
      byTarget.set(target, sources)
    }
    const prev = sources.get(source)
    if (!prev) sources.set(source, { id: source, via })
    if (prev && prev.via !== via) sources.set(source, { id: source, via: `${prev.via}, ${via}` })
  }

  for (const fact of facts) {
    if (typeof fact.v !== "string") continue
    for (const refId of parseRefs(fact.v)) {
      if (!looksLikeRef(refId)) continue
      add(refId, fact.e, fact.a)
    }
  }

  for (const link of links) add(link.e2, link.e1, link.a)

  const out = new Map<string, Backlink[]>()
  for (const [target, sources] of byTarget) {
    out.set(
      target,
      Array.from(sources.values()).sort((a, b) => a.id.localeCompare(b.id)),
    )
  }
  return out
}

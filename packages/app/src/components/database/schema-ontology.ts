import type { StoreFact } from "@/context/trellis-store"
import { useTrellisStore } from "@/context/trellis-store"
import type { PropDef } from "@/pages/session/database-panel-utils"
import type { EntityTheme } from "@/lib/entity-theme"

export function parseSchemaProps(raw: string | number | boolean | undefined): PropDef[] {
  if (typeof raw !== "string") return []
  try {
    return JSON.parse(raw) as PropDef[]
  } catch {
    return []
  }
}

export function schemaMetaFromFacts(facts: StoreFact[], key: string): Partial<EntityTheme> {
  const text = (raw: string | number | boolean | undefined) => (typeof raw === "string" ? raw : undefined)
  return {
    label: text(facts.find((f) => f.a === "label")?.v) || key,
    description: text(facts.find((f) => f.a === "description")?.v),
    color: text(facts.find((f) => f.a === "color")?.v),
    icon: text(facts.find((f) => f.a === "icon")?.v),
  }
}

type Prev = {
  defs: PropDef[]
  meta: Partial<EntityTheme>
  cms?: boolean
}

function retractFacts(key: string, prev: Prev): StoreFact[] {
  const id = `schema:${key}`
  return [
    { e: id, a: "type", v: "TypeSchema" },
    { e: id, a: "label", v: prev.meta.label ?? key },
    { e: id, a: "props", v: JSON.stringify(prev.defs) },
    ...(prev.meta.description ? [{ e: id, a: "description", v: prev.meta.description }] : []),
    ...(prev.meta.color ? [{ e: id, a: "color", v: prev.meta.color }] : []),
    ...(prev.meta.icon ? [{ e: id, a: "icon", v: prev.meta.icon }] : []),
    ...(prev.cms ? [{ e: id, a: "cms", v: true }] : []),
  ]
}

function assertFacts(key: string, defs: PropDef[], meta: EntityTheme, cms?: boolean): StoreFact[] {
  const id = `schema:${key}`
  return [
    { e: id, a: "type", v: "TypeSchema" },
    { e: id, a: "label", v: meta.label?.trim() || key },
    { e: id, a: "props", v: JSON.stringify(defs) },
    { e: id, a: "color", v: meta.color },
    { e: id, a: "icon", v: meta.icon },
    ...(meta.description ? [{ e: id, a: "description", v: meta.description }] : []),
    ...(cms ? [{ e: id, a: "cms", v: true }] : []),
  ]
}

type Store = ReturnType<typeof useTrellisStore>

export async function saveSchemaOntology(
  store: Store,
  key: string,
  defs: PropDef[],
  meta: EntityTheme,
  prev: Prev & { hasSchema: boolean },
  opts?: { cms?: boolean },
) {
  const facts = assertFacts(key, defs, meta, opts?.cms)
  if (!prev.hasSchema) return store.assert(facts)
  const retracted = await store.retract(retractFacts(key, prev))
  if (!retracted) return false
  return store.assert(facts)
}

export async function deleteSchemaOntology(store: Store, key: string, prev: Prev) {
  await store.retract(retractFacts(key, prev))
}

import { BUILTIN_PROJECTION_IDS } from "./registry"
import type { AffordanceSource, ProjectionDefinition, ProjectionIcon, ProjectionLayout, ProjectionQuery } from "./types"

const PROJECTION_LAYOUTS = new Set<ProjectionLayout>([
  "cards",
  "list",
  "table",
  "kanban",
  "canvas",
  "calendar",
  "utility",
])

const PROJECTION_ICONS = new Set<ProjectionIcon>([
  "notes",
  "content",
  "posts",
  "media",
  "records",
  "catalog",
  "products",
  "metrics",
  "levels",
  "entities",
  "decks",
  "slides",
  "scenes",
  "scripts",
  "articles",
  "links",
  "shotlist",
  "orders",
  "themes",
  "audio",
  "sprites",
  "whiteboards",
  "calendar",
  "bookmarks",
  "contacts",
  "moodboards",
  "voicememos",
  "places",
  "clock",
  "journal",
  "cron",
  "music",
  "mail",
  "messages",
  "feeds",
  "books",
  "camera",
])

const PROJECTION_DOMAINS = new Set<NonNullable<ProjectionDefinition["domain"]>>([
  "general",
  "web",
  "app",
  "game",
  "media",
  "commerce",
  "data",
  "writing",
  "audio",
])

const CUSTOM_ID = /^[a-z][a-z0-9-]*$/

/** Layouts supported for workspace-defined affordances (no bespoke renderers). */
const WORKSPACE_LAYOUTS = new Set<ProjectionLayout>(["cards", "list", "table", "kanban"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map(parseString).filter((entry): entry is string => !!entry)
  return items.length > 0 ? items : undefined
}

function parseQuery(value: unknown): ProjectionQuery | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined

  switch (value.kind) {
    case "store": {
      const type = parseString(value.type)
      const tags = parseStringArray(value.tags)
      if (!type && !tags) return undefined
      return { kind: "store", ...(type ? { type } : {}), ...(tags ? { tags } : {}) }
    }
    case "cms": {
      const collections = parseStringArray(value.collections)
      const match = value.match === "prefix" || value.match === "exact" ? value.match : undefined
      if (!collections && !match) return undefined
      return {
        kind: "cms",
        ...(collections ? { collections } : {}),
        ...(match ? { match } : {}),
      }
    }
    case "assets": {
      const category = parseStringArray(value.category)
      if (!category) return undefined
      return { kind: "assets", category }
    }
    case "files": {
      const extensions = parseStringArray(value.extensions)
      if (!extensions) return undefined
      return { kind: "files", extensions }
    }
    case "trellis":
      if (value.view === "calendar") return { kind: "trellis", view: "calendar" }
      return undefined
    default:
      return undefined
  }
}

function parseCreate(value: unknown): ProjectionDefinition["create"] | undefined {
  if (!isRecord(value)) return undefined
  const label = parseString(value.label)
  if (!label) return undefined
  const entityType = parseString(value.entityType)
  const collection = parseString(value.collection)
  return {
    label,
    ...(entityType ? { entityType } : {}),
    ...(collection ? { collection } : {}),
  }
}

export function parseCustomProjection(
  raw: unknown,
  source: AffordanceSource = "workspace",
): ProjectionDefinition | undefined {
  if (!isRecord(raw)) return undefined

  const id = parseString(raw.id)
  if (!id || !CUSTOM_ID.test(id)) return undefined
  if (BUILTIN_PROJECTION_IDS.has(id)) return undefined

  const label = parseString(raw.label)
  const description = parseString(raw.description) ?? label
  if (!label || !description) return undefined

  const layout = parseString(raw.layout)
  if (!layout || !PROJECTION_LAYOUTS.has(layout as ProjectionLayout)) return undefined
  if (source === "workspace" && !WORKSPACE_LAYOUTS.has(layout as ProjectionLayout)) return undefined

  const icon = parseString(raw.icon)
  if (!icon || !PROJECTION_ICONS.has(icon as ProjectionIcon)) return undefined

  const query = parseQuery(raw.query)
  if (!query) return undefined

  const domain = parseString(raw.domain)
  const create = parseCreate(raw.create)

  return {
    id,
    label,
    description,
    layout: layout as ProjectionLayout,
    query,
    icon: icon as ProjectionIcon,
    source,
    ...(domain && PROJECTION_DOMAINS.has(domain as NonNullable<ProjectionDefinition["domain"]>)
      ? { domain: domain as NonNullable<ProjectionDefinition["domain"]> }
      : {}),
    ...(create ? { create } : {}),
    ...(raw.stub === true ? { stub: true } : {}),
    ...(raw.comingSoon === true ? { comingSoon: true } : {}),
    ...(parseString(raw.createdBy) ? { createdBy: parseString(raw.createdBy) } : {}),
    ...(parseString(raw.createdAt) ? { createdAt: parseString(raw.createdAt) } : {}),
  }
}

export function configuredCustomProjections(config: unknown): ProjectionDefinition[] {
  const root = config && typeof config === "object" ? (config as Record<string, unknown>) : undefined
  const projections = root?.projections
  if (!projections || typeof projections !== "object") return []

  const custom = (projections as Record<string, unknown>).custom
  if (!Array.isArray(custom)) return []

  const seen = new Set<string>()
  const parsed: ProjectionDefinition[] = []

  for (const entry of custom) {
    const projection = parseCustomProjection(entry, "workspace")
    if (!projection || seen.has(projection.id)) continue
    seen.add(projection.id)
    parsed.push(projection)
  }

  return parsed
}

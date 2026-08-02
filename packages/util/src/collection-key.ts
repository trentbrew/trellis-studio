/** Machine key for a CMS collection (normalized entity type). */
export const COLLECTION_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

const SYSTEM = [
  "issue",
  "agent",
  "project",
  "memory",
  "note",
  "mcp",
  "sprite",
  "workunit",
  "cycle",
  "epic",
  "roadmap",
  "suggestion",
  "file",
  "directory",
  "op",
  "branch",
  "decision",
  "session",
  "typeschema",
] as const

const CUSTOM = [
  "phase",
  "risk",
  "mitigationstrategy",
  "checkpoint",
  "acceptancecriteria",
  "criterion",
] as const

const DESIGN = [
  "asset",
  "icon",
  "font",
  "colorpalette",
  "brand",
  "designcomponent",
  "designtoken",
] as const

const META = ["schema", "field"] as const

const ALIASES = ["dir", "filenode", "directorynode", "milestone", "thing"] as const

/** Graph/projection-owned types — not CMS collections (Calendar, brand config, metrics, …). */
const PROJECTION = [
  "calendar_event",
  "computehost",
  "entities",
  "entity",
  "metric",
  "metrics",
  "process",
  "projectbrandconfig",
] as const

export type ReservedCollectionKind = "system" | "custom" | "design" | "meta" | "alias" | "projection"

const KIND_BY_KEY = new Map<string, ReservedCollectionKind>([
  ...SYSTEM.map((k) => [k, "system"] as const),
  ...CUSTOM.map((k) => [k, "custom"] as const),
  ...DESIGN.map((k) => [k, "design"] as const),
  ...META.map((k) => [k, "meta"] as const),
  ...ALIASES.map((k) => [k, "alias"] as const),
  ...PROJECTION.map((k) => [k, "projection"] as const),
])

export const RESERVED_COLLECTION_KEYS = new Set(KIND_BY_KEY.keys())

const SUGGESTIONS: Record<string, string> = {
  project: "portfolio",
  projects: "portfolio",
  issue: "articles",
  issues: "articles",
  note: "notes",
  notes: "notes",
  memory: "memories",
  memories: "memories",
  file: "files",
  files: "files",
  asset: "assets",
  assets: "assets",
  agent: "agents",
  agents: "agents",
}

export function normalizeCollectionKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "_")
}

export function reservedCollectionKind(key: string): ReservedCollectionKind | undefined {
  return KIND_BY_KEY.get(normalizeCollectionKey(key))
}

export function isReservedCollectionKey(key: string) {
  return RESERVED_COLLECTION_KEYS.has(normalizeCollectionKey(key))
}

export function suggestCollectionKey(key: string) {
  return SUGGESTIONS[normalizeCollectionKey(key)]
}

export function validateCollectionKey(
  raw: string,
  opts?: { exists?: boolean },
): string | null {
  const key = normalizeCollectionKey(raw)
  if (!key) return "Collection name is required"
  if (!COLLECTION_KEY_RE.test(key)) return "Use letters, digits, and underscores; start with a letter"
  const kind = reservedCollectionKind(key)
  if (kind) {
    const alt = suggestCollectionKey(key)
    const hint = alt ? ` Try "${alt}" instead (label can stay human-readable).` : " Pick a different key; the label can stay human-readable."
    return `"${key}" is a reserved ${kind} type.${hint}`
  }
  if (opts?.exists) return `Collection "${key}" already exists`
  return null
}

export function formatReservedCollectionError(raw: string) {
  return validateCollectionKey(raw) ?? `Collection key "${normalizeCollectionKey(raw)}" is reserved`
}

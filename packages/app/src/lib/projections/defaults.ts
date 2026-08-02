import { MAX_PROJECTION_PINS } from "./types"

export const PROJECTION_DEFAULTS = {
  all: ["whiteboards", "calendar", "journal", "cron"],
  website: ["whiteboards", "calendar", "journal", "cron", "content", "posts", "media"],
  app: ["whiteboards", "calendar", "journal", "cron", "records", "content"],
  game: ["whiteboards", "calendar", "journal", "cron", "levels", "entities", "media"],
  slides: ["whiteboards", "calendar", "journal", "cron", "decks", "slides", "scripts"],
  video: ["whiteboards", "calendar", "journal", "cron", "scenes", "scripts", "media"],
  dashboard: ["whiteboards", "calendar", "journal", "cron", "metrics", "records", "content"],
  docs: ["whiteboards", "calendar", "journal", "cron", "articles", "content", "posts"],
  store: ["whiteboards", "calendar", "journal", "cron", "catalog", "products", "media"],
  audio: ["whiteboards", "calendar", "journal", "cron", "audio", "scripts", "media"],
  productivity: ["whiteboards", "calendar", "journal", "cron", "records", "content"],
} as const

export type ProjectionWorkspaceType = keyof typeof PROJECTION_DEFAULTS

const WORKSPACE_ALIASES: Record<string, ProjectionWorkspaceType> = {
  marketing: "website",
  landing: "website",
  product: "app",
  saas: "app",
  tool: "app",
  gamedev: "game",
  "game-dev": "game",
  presentation: "slides",
  deck: "slides",
  writing: "docs",
  film: "video",
  youtube: "video",
  production: "video",
  "video-editing": "video",
  data: "dashboard",
  analytics: "dashboard",
  metrics: "dashboard",
  documentation: "docs",
  wiki: "docs",
  ecommerce: "store",
  shop: "store",
  commerce: "store",
  daw: "audio",
  music: "audio",
  sound: "audio",
  tasks: "productivity",
  productivity: "productivity",
}

export function normalizeProjectionWorkspaceType(value: unknown): ProjectionWorkspaceType | undefined {
  if (typeof value !== "string") return undefined
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
  if (!key) return undefined
  if (key in PROJECTION_DEFAULTS) return key as ProjectionWorkspaceType
  return WORKSPACE_ALIASES[key]
}

export function projectionWorkspaceTypeFromConfig(config: unknown): ProjectionWorkspaceType | undefined {
  const root = config && typeof config === "object" ? (config as Record<string, unknown>) : undefined
  const projections = root?.projections
  if (!projections || typeof projections !== "object") return undefined
  return normalizeProjectionWorkspaceType((projections as Record<string, unknown>).workspaceType)
}

export function configuredProjectionPins(config: unknown): string[] | undefined {
  const root = config && typeof config === "object" ? (config as Record<string, unknown>) : undefined
  const projections = root?.projections
  if (!projections || typeof projections !== "object") return undefined
  const pinned = (projections as Record<string, unknown>).pinned
  if (!Array.isArray(pinned)) return undefined
  return pinned.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}

export function defaultProjectionPins(type: ProjectionWorkspaceType | undefined): string[] {
  const base = PROJECTION_DEFAULTS[type ?? "app"] ?? PROJECTION_DEFAULTS.app
  return ["whiteboards", ...base.filter((id) => id !== "whiteboards")].slice(0, MAX_PROJECTION_PINS)
}

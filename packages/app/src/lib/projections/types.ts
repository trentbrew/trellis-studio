export type ProjectionLayout = "cards" | "list" | "table" | "kanban" | "canvas" | "calendar" | "utility"

export type ProjectionQuery =
  | { kind: "store"; type?: string; tags?: string[] }
  | { kind: "cms"; collections?: string[]; match?: "prefix" | "exact" }
  | { kind: "assets"; category?: string[] }
  | { kind: "files"; extensions?: string[] }
  | { kind: "trellis"; view: "calendar" }

export type ProjectionIcon =
  | "notes"
  | "content"
  | "posts"
  | "media"
  | "records"
  | "catalog"
  | "products"
  | "metrics"
  | "levels"
  | "entities"
  | "decks"
  | "slides"
  | "scenes"
  | "scripts"
  | "articles"
  | "links"
  | "shotlist"
  | "orders"
  | "themes"
  | "audio"
  | "sprites"
  | "whiteboards"
  | "calendar"
  | "bookmarks"
  | "contacts"
  | "moodboards"
  | "voicememos"
  | "places"
  | "clock"
  | "journal"
  | "cron"
  | "music"
  | "mail"
  | "messages"
  | "feeds"
  | "books"
  | "camera"

export type AffordanceSource = "builtin" | "workspace" | "agent"

export type ProjectionDefinition = {
  id: string
  label: string
  description: string
  layout: ProjectionLayout
  query: ProjectionQuery
  icon: ProjectionIcon
  domain?: "general" | "web" | "app" | "game" | "media" | "commerce" | "data" | "writing" | "audio"
  create?: { label: string; entityType?: string; collection?: string }
  stub?: boolean
  /** Affordance is registered but not yet implemented — renders a placeholder shell. */
  comingSoon?: boolean
  /** Where this affordance was defined — omitted on raw registry entries; set when merged. */
  source?: AffordanceSource
  createdBy?: string
  createdAt?: string
}

export const MAX_PROJECTION_PINS = 8
export const DEFAULT_PROJECTION_PINS: string[] = ["whiteboards"]

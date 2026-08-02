import type { JSX } from "solid-js"
import type { DetailTab, DetailTabItem } from "./tabs"

// Adapter registry (TRL-208): the single source of truth for how each entity
// type renders in the universal entity surface. An adapter declares the default
// left-pane preview renderer and which inspector sections the right sidebar /
// panel tabs expose. Surface and panel consult this instead of hardcoding
// `type === "file"` style checks.

export type InspectorSection = DetailTab
export type EntityAdapterCtx = { id: string; type: string | undefined }

export type Fact = { a: string; v: unknown }
export type ResolveCtx = { id: string; type: string | undefined; facts: readonly Fact[] }

// A field resolver is either an ordered list of fact keys to try, or a function
// computing the value from the full context (id + facts).
export type FieldResolver = string[] | ((ctx: ResolveCtx) => string | undefined)

export type EntityAdapter = {
  /** Left-pane preview renderer. Omit to fall back to the built-in EntityPreview. */
  preview?: (ctx: EntityAdapterCtx) => JSX.Element
  /** Inspector sections (panel tabs / split sidebar), in display order. */
  inspector: InspectorSection[]
  /** Initial inspector tab. Defaults to the first inspector section. */
  defaultTab?: DetailTab
  /** Header title resolver. Falls back to generic name keys, then the id leaf. */
  title?: FieldResolver
  /** Header subtitle resolver. Falls back to generic description keys. */
  subtitle?: FieldResolver
  /** Header meta resolver. No generic fallback. */
  meta?: FieldResolver
}

// Canonical tab metadata. Adapters reference sections by id; renderers resolve
// labels/icons here so the vocabulary stays in one place.
export const TAB_ITEMS = {
  preview: { id: "preview", label: "Preview", icon: "eye" },
  details: { id: "details", label: "Details", icon: "info" },
  activity: { id: "activity", label: "Activity", icon: "history" },
  overview: { id: "overview", label: "Overview", icon: "info" },
  history: { id: "history", label: "History", icon: "history" },
  decisions: { id: "decisions", label: "Decisions", icon: "brain" },
  relationships: { id: "relationships", label: "Relationships", icon: "git-branch" },
} satisfies Record<DetailTab, DetailTabItem>

export function tabItems(ids: DetailTab[]): DetailTabItem[] {
  return ids.map((id) => TAB_ITEMS[id])
}

// File-like entities lead with the preview pane; everything else leads with
// properties (details). These mirror the previous DEFAULT_TABS behavior.
const FILE_ADAPTER: EntityAdapter = {
  inspector: ["preview", "details", "activity"],
  defaultTab: "preview",
  title: (ctx) => leaf(ctx.id),
}

const DEFAULT_ADAPTER: EntityAdapter = {
  inspector: ["details", "activity"],
  defaultTab: "details",
}

const REGISTRY: Record<string, EntityAdapter> = {
  file: FILE_ADAPTER,
  directory: FILE_ADAPTER,
}

export function registerEntityAdapter(type: string, adapter: EntityAdapter) {
  REGISTRY[type] = adapter
}

export function entityAdapter(type: string | undefined): EntityAdapter {
  return (type && REGISTRY[type]) || DEFAULT_ADAPTER
}

/** Inspector sections for a type, with `preview` stripped for split layout
 * (the preview lives in the dedicated left pane there). */
export function inspectorSections(type: string | undefined, layout: "panel" | "split"): DetailTab[] {
  const sections = entityAdapter(type).inspector
  return layout === "split" ? sections.filter((id) => id !== "preview") : sections
}

/** Default tab for a type within a layout, honoring the split preview split-out. */
export function defaultTab(type: string | undefined, layout: "panel" | "split"): DetailTab {
  const sections = inspectorSections(type, layout)
  const preferred = entityAdapter(type).defaultTab
  if (preferred && sections.includes(preferred)) return preferred
  return sections[0] ?? "details"
}

// Generic field-key fallbacks, applied when an adapter does not declare its own
// title/subtitle resolver. Mirrors the previous bespoke lookups in the dialog.
const TITLE_KEYS = ["title", "name", "message", "estimatedIntent", "url"]
const SUBTITLE_KEYS = ["description", "purpose", "summary"]

function text(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (v == null) return undefined
  return JSON.stringify(v)
}

function pick(facts: readonly Fact[], keys: string[]): string | undefined {
  for (const key of keys) {
    const hit = facts.find((fact) => fact.a === key && text(fact.v) !== undefined)
    if (hit) return text(hit.v)
  }
  return undefined
}

function leaf(id: string): string {
  const path = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id
  return path.split("/").pop() || path
}

function resolve(field: FieldResolver | undefined, ctx: ResolveCtx, fallback?: string[]): string | undefined {
  if (typeof field === "function") return field(ctx)
  if (Array.isArray(field)) return pick(ctx.facts, field)
  return fallback ? pick(ctx.facts, fallback) : undefined
}

export function resolveTitle(ctx: ResolveCtx): string {
  return resolve(entityAdapter(ctx.type).title, ctx, TITLE_KEYS) ?? leaf(ctx.id)
}

export function resolveSubtitle(ctx: ResolveCtx): string | undefined {
  return resolve(entityAdapter(ctx.type).subtitle, ctx, SUBTITLE_KEYS)
}

export function resolveMeta(ctx: ResolveCtx): string | undefined {
  return resolve(entityAdapter(ctx.type).meta, ctx)
}

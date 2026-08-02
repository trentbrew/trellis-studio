/** Default on-disk locations for Trellis Studio whiteboards (Filegraph RFC-002 aligned). */

import { WHITEBOARD_EXT } from "./ontology"

export type WhiteboardPathIntent = "durable" | "sketch"

export type MaterializedKind = "whiteboard-sketch" | "whiteboard-durable"

export type MaterializedPathRule = {
  kind: MaterializedKind
  /** Directory relative to workspace root (mac-compat). */
  dir: string
  ext: string
  /** Store entity prefix when registered. */
  entityPrefix?: string
  /** Runtime scratch — not a versioned product artifact. */
  gitignored?: boolean
}

export const LEGACY_WHITEBOARD_DIR = "whiteboards"

export const MATERIALIZED_PATHS: Record<MaterializedKind, MaterializedPathRule> = {
  "whiteboard-durable": {
    kind: "whiteboard-durable",
    dir: "@canvases",
    ext: WHITEBOARD_EXT,
    entityPrefix: "whiteboard",
  },
  "whiteboard-sketch": {
    kind: "whiteboard-sketch",
    dir: ".trellis/sketch",
    ext: WHITEBOARD_EXT,
    gitignored: true,
  },
}

export function slugifyWhiteboardTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  )
}

export function whiteboardPathForIntent(slug: string, intent: WhiteboardPathIntent = "durable"): string {
  const rule =
    intent === "sketch" ? MATERIALIZED_PATHS["whiteboard-sketch"] : MATERIALIZED_PATHS["whiteboard-durable"]
  return `${rule.dir}/${slug}${rule.ext}`
}

export function defaultWhiteboardPath(title = "Untitled", intent: WhiteboardPathIntent = "durable"): string {
  return whiteboardPathForIntent(slugifyWhiteboardTitle(title), intent)
}

export function dedupeWhiteboardPath(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let n = 1
  let next = base.replace(/\.whiteboard$/i, `-${n}.whiteboard`)
  while (existing.has(next)) {
    n += 1
    next = base.replace(/\.whiteboard$/i, `-${n}.whiteboard`)
  }
  return next
}

export function legacyWhiteboardDirs(): string[] {
  return [MATERIALIZED_PATHS["whiteboard-durable"].dir, LEGACY_WHITEBOARD_DIR]
}

export function allWhiteboardSearchDirs(includeSketch = false): string[] {
  const dirs = [...legacyWhiteboardDirs()]
  if (includeSketch) dirs.push(MATERIALIZED_PATHS["whiteboard-sketch"].dir)
  return dirs
}

export function whiteboardEntityId(slug: string): string {
  return `whiteboard:${slug}`
}

export function slugFromWhiteboardPath(path: string): string {
  const name = path.split("/").pop() ?? path
  return name.replace(/\.whiteboard$/i, "") || "untitled"
}

export function isSketchWhiteboardPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  return normalized.startsWith(".trellis/sketch/") || normalized.includes("/.trellis/sketch/")
}

export function isKnownWhiteboardLocation(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  if (!normalized.toLowerCase().endsWith(WHITEBOARD_EXT)) return false
  for (const dir of allWhiteboardSearchDirs(true)) {
    if (normalized.startsWith(`${dir}/`)) return true
  }
  return false
}

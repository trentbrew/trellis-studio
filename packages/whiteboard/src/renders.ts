import type { WhiteboardDocument } from "./document"
import { slugFromWhiteboardPath } from "./paths"

export const WHITEBOARD_RENDERS_DIR = ".trellis/renders"

export type WhiteboardRenderMeta = {
  version: 1
  whiteboardPath: string
  elementsKey: string
  updatedAt: string
}

export type WhiteboardPreviewInfo = {
  pngPath: string
  metaPath: string
  elementsKey: string
  updatedAt: string
  /** PNG missing or elementsKey no longer matches the .whiteboard file. */
  stale: boolean
}

export function whiteboardRenderPaths(whiteboardPath: string): { png: string; meta: string } {
  const slug = slugFromWhiteboardPath(whiteboardPath)
  const base = `${WHITEBOARD_RENDERS_DIR}/${slug}`
  return { png: `${base}.png`, meta: `${base}.meta.json` }
}

/** Stable signature of visible elements — matches Studio autosave key. */
export function sceneElementsKey(elements: readonly Record<string, unknown>[]): string {
  const live = elements.filter((el) => el.isDeleted !== true)
  return `${live.length}:${live.map((el) => String(el?.id ?? "")).join(",")}`
}

export function hasVisibleElements(doc: WhiteboardDocument): boolean {
  return doc.elements.some((el) => el.isDeleted !== true)
}

/** Freehand and embedded images need a visual preview for agents. */
export function needsVisualPreview(doc: WhiteboardDocument): boolean {
  return doc.elements.some((el) => {
    if (el.isDeleted === true) return false
    const type = typeof el.type === "string" ? el.type : ""
    return type === "freedraw" || type === "image"
  })
}

export function parseWhiteboardRenderMeta(raw: string): WhiteboardRenderMeta | null {
  try {
    const data = JSON.parse(raw) as Partial<WhiteboardRenderMeta>
    if (data.version !== 1) return null
    if (typeof data.whiteboardPath !== "string") return null
    if (typeof data.elementsKey !== "string") return null
    if (typeof data.updatedAt !== "string") return null
    return {
      version: 1,
      whiteboardPath: data.whiteboardPath,
      elementsKey: data.elementsKey,
      updatedAt: data.updatedAt,
    }
  } catch {
    return null
  }
}

export function buildWhiteboardPreviewInfo(
  whiteboardPath: string,
  doc: WhiteboardDocument,
  meta: WhiteboardRenderMeta | null,
  pngExists: boolean,
): WhiteboardPreviewInfo | undefined {
  const paths = whiteboardRenderPaths(whiteboardPath)
  const currentKey = sceneElementsKey(doc.elements)
  if (!meta) {
    if (!pngExists) return undefined
    return {
      pngPath: paths.png,
      metaPath: paths.meta,
      elementsKey: currentKey,
      updatedAt: "unknown",
      stale: true,
    }
  }
  return {
    pngPath: paths.png,
    metaPath: paths.meta,
    elementsKey: meta.elementsKey,
    updatedAt: meta.updatedAt,
    stale: !pngExists || meta.elementsKey !== currentKey,
  }
}

export function serializeWhiteboardRenderMeta(meta: WhiteboardRenderMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`
}

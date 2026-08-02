import { readTrellisMeta } from "./bindings"
import { cloneElementsForInsert } from "./elements"
import {
  emptyWhiteboard,
  parseWhiteboard,
  serializeWhiteboard,
  type WhiteboardDocument,
} from "./document"
import { getCorpusEntry, listCorpusEntries } from "./corpus"
import { parseBinding } from "./ontology"
import type { CorpusKind } from "./ontology"
import type { WhiteboardPreviewInfo } from "./renders"

export type DescribeWhiteboardOptions = {
  path?: string
  preview?: WhiteboardPreviewInfo
}

export function describeWhiteboard(
  doc: WhiteboardDocument,
  options: DescribeWhiteboardOptions = {},
): string {
  const lines: string[] = []
  if (options.path) lines.push(`# ${options.path}`, "")

  const elements = doc.elements.filter((e) => e.isDeleted !== true)
  lines.push(`**Elements:** ${elements.length}`, "")

  const byCorpus = new Map<string, { labels: string[]; binds: Set<string>; count: number }>()
  const byType = new Map<string, number>()
  const bound = new Set<string>()

  for (const el of elements) {
    const type = typeof el.type === "string" ? el.type : "unknown"
    const meta = readTrellisMeta(el)
    if (!meta?.corpusId) byType.set(type, (byType.get(type) ?? 0) + 1)
    if (meta?.bind) bound.add(meta.bind)
    if (meta?.corpusId) {
      const row = byCorpus.get(meta.corpusId) ?? { labels: [], binds: new Set(), count: 0 }
      row.count += 1
      if (meta.label) row.labels.push(meta.label)
      if (meta.bind) row.binds.add(meta.bind)
      byCorpus.set(meta.corpusId, row)
    }
  }

  if (byCorpus.size) {
    lines.push("## Corpus figures", "")
    for (const [id, row] of [...byCorpus.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const labelPart = row.labels.length ? ` — ${[...new Set(row.labels)].join(", ")}` : ""
      lines.push(`- **${id}** × ${row.count}${labelPart}`)
      if (row.binds.size) {
        for (const b of row.binds) lines.push(`  - binds:${b}`)
      }
    }
    lines.push("")
  }

  if (bound.size) {
    lines.push("## Bindings", "")
    for (const b of [...bound].sort()) lines.push(`- binds:${b}`)
    lines.push("")
  }

  const untagged = [...byType.entries()].filter(([t]) => t !== "unknown")
  if (untagged.length) {
    lines.push("## Primitives (untagged)", "")
    for (const [type, count] of untagged.sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- ${type} × ${count}`)
    }
    lines.push("")
  }

  if (doc.appState && Object.keys(doc.appState).length > 2) {
    const bg = doc.appState.viewBackgroundColor
    if (bg) lines.push(`Background: \`${String(bg)}\``, "")
  }

  if (options.preview) {
    lines.push("## Visual preview", "")
    if (options.preview.stale) {
      lines.push(
        `- Render sidecar \`${options.preview.pngPath}\` is **stale** (saved ${options.preview.updatedAt}).`,
        "- Open the board in Studio or re-save to refresh the PNG.",
        "",
      )
    } else {
      lines.push(
        `- PNG render: \`${options.preview.pngPath}\` (matches current scene).`,
        "- For freehand strokes and sketches, **Read this PNG** (or use media analysis) — JSON coordinates are not human-readable.",
        "",
      )
    }
  }

  return lines.join("\n").trim()
}

export type ApplyTemplateOptions = {
  /** When true, replace the document; otherwise merge elements. */
  replace?: boolean
}

export function applyTemplate(
  doc: WhiteboardDocument,
  templateId: string,
  options: ApplyTemplateOptions = {},
): WhiteboardDocument {
  const entry = getCorpusEntry(templateId)
  if (!entry || entry.kind !== "template") {
    throw new Error(`Unknown template: ${templateId}. Use list_catalog to see template.* ids.`)
  }

  const inserted = cloneElementsForInsert(entry.elements, {
    offsetX: 0,
    offsetY: 0,
    meta: { corpusId: entry.id },
  })

  if (options.replace) {
    return {
      type: "excalidraw",
      version: doc.version,
      elements: inserted,
      appState: { ...emptyWhiteboard().appState, ...entry.appState, ...doc.appState },
      files: doc.files ?? {},
    }
  }

  return {
    ...doc,
    elements: [...doc.elements, ...inserted],
    appState: entry.appState ? { ...doc.appState, ...entry.appState } : doc.appState,
  }
}

export type InsertFigureOptions = {
  x: number
  y: number
  label?: string
  bind?: string
}

export function insertFigure(
  doc: WhiteboardDocument,
  figureId: string,
  options: InsertFigureOptions,
): WhiteboardDocument {
  const entry = getCorpusEntry(figureId)
  if (!entry || (entry.kind !== "figure" && entry.kind !== "primitive" && entry.kind !== "layout")) {
    throw new Error(
      `Unknown figure: ${figureId}. Use list_catalog for figure.*, primitive.*, or layout.* ids.`,
    )
  }

  const bind = options.bind ? parseBinding(options.bind) : undefined
  const inserted = cloneElementsForInsert(entry.elements, {
    offsetX: options.x,
    offsetY: options.y,
    label: options.label,
    meta: {
      corpusId: entry.id,
      bind,
      label: options.label,
    },
  })

  return {
    ...doc,
    elements: [...doc.elements, ...inserted],
  }
}

export function applyTemplateToFile(
  raw: string,
  templateId: string,
  options?: ApplyTemplateOptions,
): string {
  const doc = parseWhiteboard(raw)
  return serializeWhiteboard(applyTemplate(doc, templateId, options))
}

export function insertFigureToFile(
  raw: string,
  figureId: string,
  options: InsertFigureOptions,
): string {
  const doc = parseWhiteboard(raw)
  return serializeWhiteboard(insertFigure(doc, figureId, options))
}

export function describeWhiteboardFile(
  raw: string,
  path?: string,
  preview?: WhiteboardPreviewInfo,
): string {
  return describeWhiteboard(parseWhiteboard(raw), { path, preview })
}

export function listCorpusByKind(kind: CorpusKind): string {
  return listCorpusEntries(kind)
    .map((e) => `${e.id} (v${e.version}) — ${e.description}`)
    .join("\n")
}

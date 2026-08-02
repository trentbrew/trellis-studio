/**
 * Mermaid → whiteboard helpers.
 *
 * Agents (Node) write a lightweight **pending** placeholder that carries the
 * mermaid source in `customData.trellis`. The Studio host (browser) renders the
 * source to real Excalidraw elements via `@excalidraw/mermaid-to-excalidraw`
 * (which needs the DOM) and replaces the placeholder. The source is retained on
 * the generated group so the diagram stays re-generatable.
 */

import { writeTrellisMeta, readTrellisMeta } from "./bindings"
import { parseWhiteboard, serializeWhiteboard, type WhiteboardDocument } from "./document"
import { baseElement, randomElementId } from "./elements"
import { repairElementIndices } from "./indices"
import {
  boundsForElements,
  resolveMermaidPlacement,
  scaleElementsFromOrigin,
  suggestNextMermaidPosition,
  suggestReadabilityScale,
} from "./layout"
import { MERMAID_CORPUS_ID, parseBinding } from "./ontology"

export { suggestNextMermaidPosition } from "./layout"

export const MERMAID_PLACEHOLDER_WIDTH = 360
export const MERMAID_PLACEHOLDER_HEIGHT = 220

export type InsertMermaidOptions = {
  mermaid: string
  x: number
  y: number
  /** Graph binding (`issue:42`, `entity:decision-7`, or `binds:…`). */
  bind?: string
  /** Optional label retained on the generated group. */
  label?: string
}

/** Dashed placeholder element the agent writes; the host expands it on load. */
export function createMermaidPlaceholder(options: InsertMermaidOptions): Record<string, unknown> {
  const element = baseElement("rectangle", {
    x: options.x,
    y: options.y,
    width: MERMAID_PLACEHOLDER_WIDTH,
    height: MERMAID_PLACEHOLDER_HEIGHT,
    strokeColor: "#868e96",
    backgroundColor: "transparent",
    strokeStyle: "dashed",
    roundness: { type: 3 },
  })
  return writeTrellisMeta(element, {
    corpusId: MERMAID_CORPUS_ID,
    mermaid: options.mermaid,
    mermaidStatus: "pending",
    bind: options.bind ? parseBinding(options.bind) : undefined,
    label: options.label,
  })
}

export function insertMermaid(doc: WhiteboardDocument, options: InsertMermaidOptions): WhiteboardDocument {
  return { ...doc, elements: [...doc.elements, createMermaidPlaceholder(options)] }
}

export function insertMermaidToFile(raw: string, options: InsertMermaidOptions): string {
  return serializeWhiteboard(insertMermaid(parseWhiteboard(raw), options))
}

/** A placeholder still awaiting host-side expansion. */
export function isPendingMermaidElement(element: Record<string, unknown>): boolean {
  const meta = readTrellisMeta(element)
  return typeof meta?.mermaid === "string" && meta.mermaidStatus === "pending"
}

export function documentHasPendingMermaid(doc: WhiteboardDocument): boolean {
  return doc.elements.some((el) => isPendingMermaidElement(el))
}

export type TagMermaidGeneratedOptions = {
  /** Original mermaid source (retained on the group representative). */
  source: string
  /** Top-left target position (the placeholder's x/y). */
  x: number
  y: number
  bind?: string
  label?: string
}

/**
 * Offset converted Excalidraw elements to the placeholder origin and tag them as
 * one mermaid group. Internal id references (arrow bindings, bound text) are kept
 * intact — only positions, group membership, and `customData.trellis` change.
 */
export function tagMermaidGenerated(
  generated: readonly Record<string, unknown>[],
  options: TagMermaidGeneratedOptions,
): Record<string, unknown>[] {
  let minX = Infinity
  let minY = Infinity
  for (const el of generated) {
    if (typeof el.x === "number") minX = Math.min(minX, el.x)
    if (typeof el.y === "number") minY = Math.min(minY, el.y)
  }
  if (!Number.isFinite(minX)) minX = 0
  if (!Number.isFinite(minY)) minY = 0

  const dx = options.x - minX
  const dy = options.y - minY
  const groupId = `mermaid_${Date.now().toString(36)}_${randomElementId().slice(-6)}`

  return generated.map((raw, index) => {
    const el: Record<string, unknown> = { ...raw }
    if (typeof el.x === "number") el.x = (el.x as number) + dx
    if (typeof el.y === "number") el.y = (el.y as number) + dy
    el.frameId = el.frameId ?? null
    const existing = Array.isArray(el.groupIds) ? (el.groupIds as unknown[]).map(String) : []
    el.groupIds = [...existing, groupId]
    return writeTrellisMeta(el, {
      corpusId: MERMAID_CORPUS_ID,
      mermaidGroupId: groupId,
      // Keep the source + binding on the first element so the diagram is re-generatable
      // without stamping the same binding onto every node.
      ...(index === 0
        ? {
            mermaid: options.source,
            mermaidStatus: "expanded" as const,
            bind: options.bind,
            label: options.label,
          }
        : {}),
    })
  })
}

/** Flag a placeholder whose mermaid source failed to parse so the host stops retrying. */
export function markMermaidError(
  element: Record<string, unknown>,
  message: string,
): Record<string, unknown> {
  return writeTrellisMeta(element, { mermaidStatus: "error", mermaidError: message })
}

export type MermaidRenderFn = (source: string) => Promise<{
  elements: readonly Record<string, unknown>[]
  files?: Record<string, unknown>
}>

export type ExpandMermaidResult = {
  doc: WhiteboardDocument
  /** How many placeholders were expanded into shape groups. */
  expanded: number
  errors: string[]
}

/**
 * Replace pending mermaid placeholders with rendered Excalidraw elements.
 * Hosts pass a browser render function; tests pass a stub.
 */
export async function expandMermaidInDocument(
  doc: WhiteboardDocument,
  render: MermaidRenderFn,
): Promise<ExpandMermaidResult> {
  let elements = [...doc.elements]
  let files = { ...(doc.files ?? {}) }
  let expanded = 0
  const errors: string[] = []

  const pending = elements
    .filter((el) => isPendingMermaidElement(el))
    .sort((a, b) => {
      const ay = typeof a.y === "number" ? a.y : 0
      const by = typeof b.y === "number" ? b.y : 0
      if (ay !== by) return ay - by
      const ax = typeof a.x === "number" ? a.x : 0
      const bx = typeof b.x === "number" ? b.x : 0
      return ax - bx
    })

  let occupied = boundsForElements(elements, (el) => !isPendingMermaidElement(el))

  for (const placeholder of pending) {
    const meta = readTrellisMeta(placeholder)
    const source = meta?.mermaid
    if (!source) {
      elements = elements.map((el) =>
        el === placeholder ? markMermaidError(el, "Missing mermaid source on placeholder") : el,
      )
      errors.push("Missing mermaid source on placeholder")
      continue
    }
    try {
      const { elements: generated, files: renderedFiles } = await render(source)
      if (generated.length === 0) {
        elements = elements.map((el) =>
          el === placeholder ? markMermaidError(el, "Mermaid produced no elements") : el,
        )
        errors.push("Mermaid produced no elements")
        continue
      }
      let tagged = tagMermaidGenerated(generated, {
        source,
        x: Number(placeholder.x) || 0,
        y: Number(placeholder.y) || 0,
        bind: meta?.bind,
        label: meta?.label,
      })
      const scale = suggestReadabilityScale(tagged.length)
      const groupBounds = boundsForElements(tagged)
      if (scale > 1 && groupBounds) {
        tagged = scaleElementsFromOrigin(tagged, scale, {
          x: groupBounds.minX,
          y: groupBounds.minY,
        })
      }
      const placed = resolveMermaidPlacement(placeholder, tagged, occupied)
      tagged = placed.elements
      occupied = placed.placed
      elements = elements.filter((el) => el !== placeholder).concat(tagged)
      if (renderedFiles && Object.keys(renderedFiles).length) {
        files = { ...files, ...renderedFiles }
      }
      expanded += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      elements = elements.map((el) => (el === placeholder ? markMermaidError(el, message) : el))
      errors.push(message)
    }
  }

  return {
    doc: { ...doc, elements: repairElementIndices(elements), files },
    expanded,
    errors,
  }
}

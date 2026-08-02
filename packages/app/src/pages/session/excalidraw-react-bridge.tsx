/**
 * React + Excalidraw entry loaded as a separate chunk from Solid.
 * Static imports let Vite inject `index.css`; dynamic @vite-ignore imports do not.
 */
import { normalizeTextElements } from "@opencode-ai/whiteboard/browser"
import { normalizeEmbeddableElements } from "@/lib/whiteboard/embed-link"
import { Excalidraw, convertToExcalidrawElements, exportToBlob } from "@excalidraw/excalidraw"
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw"
import "@excalidraw/excalidraw/index.css"
import React from "react"
import { createRoot } from "react-dom/client"

/** Resize autoResize text boxes when loading agent-updated scenes. */
export function normalizeWhiteboardElements(
  elements: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return normalizeEmbeddableElements(normalizeTextElements(elements))
}

/**
 * Serialize mermaid parses. mermaid (and the copy bundled in mermaid-to-excalidraw)
 * is not concurrent-safe: parallel first-calls race to register diagram types and
 * throw "Diagram <type> already registered". A single in-flight chain avoids that.
 */
let mermaidQueue: Promise<unknown> = Promise.resolve()

async function parseMermaidSafely(definition: string) {
  // Studio ships two mermaid versions (tiptap markdown uses 11.x; this bundles 10.x).
  // The registry can throw "already registered" on the first parse of a session; the
  // diagrams are registered by the throwing call, so an immediate retry succeeds.
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await parseMermaidToExcalidraw(definition, { themeVariables: { fontSize: "18px" } })
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      if (!/already registered/i.test(message)) throw err
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }
  throw lastErr
}

/**
 * Render mermaid syntax to full Excalidraw elements. Runs in the browser because
 * mermaid measures layout against the DOM. Returns skeleton-free, ready-to-insert
 * elements plus any image files the diagram produced.
 */
export async function mermaidToExcalidrawElements(definition: string): Promise<{
  elements: Record<string, unknown>[]
  files: Record<string, unknown>
}> {
  const run = mermaidQueue.then(() => parseMermaidSafely(definition))
  // Keep the chain alive even if this parse rejects, so later diagrams still run.
  mermaidQueue = run.then(
    () => undefined,
    () => undefined,
  )
  const { elements, files } = await run
  const full = convertToExcalidrawElements(elements as never) as unknown as Record<string, unknown>[]
  return {
    elements: normalizeWhiteboardElements(full),
    files: (files as Record<string, unknown> | undefined) ?? {},
  }
}

export { Excalidraw, React, createRoot, exportToBlob }

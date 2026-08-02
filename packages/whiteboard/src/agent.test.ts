import { describe, expect, test } from "bun:test"
import {
  applyTemplate,
  describeWhiteboard,
  emptyWhiteboard,
  insertFigure,
  parseWhiteboard,
  resetCorpusCache,
  serializeWhiteboard,
} from "./index"
import { readTrellisMeta } from "./bindings"

describe("whiteboard agent", () => {
  test("loads corpus and applies template", () => {
    resetCorpusCache()
    const doc = applyTemplate(emptyWhiteboard(), "template.flow-diagram", { replace: true })
    expect(doc.elements.length).toBeGreaterThan(4)
    const tagged = doc.elements.filter((e) => readTrellisMeta(e)?.corpusId === "template.flow-diagram")
    expect(tagged.length).toBe(doc.elements.length)
  })

  test("insertFigure adds labeled figure with bind", () => {
    resetCorpusCache()
    let doc = emptyWhiteboard()
    doc = insertFigure(doc, "figure.mindmap-node", {
      x: 100,
      y: 200,
      label: "Auth",
      bind: "issue:42",
    })
    expect(doc.elements.length).toBe(2)
    const text = doc.elements.find((e) => e.type === "text")
    expect(text?.text).toBe("Auth")
    const meta = readTrellisMeta(doc.elements[0]!)
    expect(meta?.corpusId).toBe("figure.mindmap-node")
    expect(meta?.bind).toBe("issue:42")
  })

  test("describe summarizes corpus and bindings", () => {
    resetCorpusCache()
    let doc = emptyWhiteboard()
    doc = insertFigure(doc, "figure.api-endpoint", { x: 0, y: 0, label: "GET /health", bind: "entity:api-1" })
    const summary = describeWhiteboard(doc, { path: "whiteboards/api.whiteboard" })
    expect(summary).toContain("figure.api-endpoint")
    expect(summary).toContain("binds:entity:api-1")
    expect(summary).toContain("GET /health")
  })

  test("describe includes fresh visual preview path", () => {
    const doc = parseWhiteboard(
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [{ id: "a", type: "freedraw", isDeleted: false }],
      }),
    )
    const summary = describeWhiteboard(doc, {
      path: "@canvases/sketch.whiteboard",
      preview: {
        pngPath: ".trellis/renders/sketch.png",
        metaPath: ".trellis/renders/sketch.meta.json",
        elementsKey: "1:a",
        updatedAt: "2026-06-01T00:00:00.000Z",
        stale: false,
      },
    })
    expect(summary).toContain("Visual preview")
    expect(summary).toContain(".trellis/renders/sketch.png")
    expect(summary).toContain("Read this PNG")
  })

  test("round-trips through serialize", () => {
    resetCorpusCache()
    const raw = serializeWhiteboard(applyTemplate(emptyWhiteboard(), "template.sprint-retro", { replace: true }))
    const parsed = parseWhiteboard(raw)
    expect(parsed.elements.length).toBeGreaterThan(0)
  })
})

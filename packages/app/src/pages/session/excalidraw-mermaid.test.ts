import { describe, expect, test } from "bun:test"
import { expandMermaidInDocument, insertMermaid, isPendingMermaidElement } from "@opencode-ai/whiteboard/browser"
import { emptyWhiteboard } from "@/lib/whiteboard/schema"

/** Host-side expand logic (real @excalidraw/mermaid-to-excalidraw needs a full browser; see whiteboard mermaid.test.ts). */
describe("excalidraw mermaid host helpers", () => {
  test("expandMermaidInDocument removes pending placeholders when render succeeds", async () => {
    const doc = insertMermaid(emptyWhiteboard(), {
      mermaid: "flowchart TD\n  A[Client] --> B[Sync]",
      x: 100,
      y: 120,
      label: "CRDT",
    })
    expect(doc.elements.some((el) => isPendingMermaidElement(el))).toBe(true)

    const { doc: expanded, expanded: count, errors } = await expandMermaidInDocument(doc, async () => ({
      elements: [
        { id: "n1", type: "rectangle", x: 0, y: 0, width: 120, height: 48, groupIds: [] },
        { id: "n2", type: "rectangle", x: 0, y: 80, width: 120, height: 48, groupIds: [] },
        { id: "a1", type: "arrow", x: 60, y: 48, width: 0, height: 32, groupIds: [] },
      ],
    }))
    expect(errors).toEqual([])
    expect(count).toBe(1)
    expect(expanded.elements.length).toBe(3)
    expect(expanded.elements.some((el) => isPendingMermaidElement(el))).toBe(false)
  })
})

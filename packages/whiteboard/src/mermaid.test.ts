import { describe, expect, test } from "bun:test"
import { readTrellisMeta } from "./bindings"
import { emptyWhiteboard, parseWhiteboard, serializeWhiteboard } from "./document"
import {
  expandMermaidInDocument,
  insertMermaid,
  isPendingMermaidElement,
} from "./mermaid"

describe("expandMermaidInDocument", () => {
  test("expands pending placeholders and removes them from the scene", async () => {
    const base = insertMermaid(emptyWhiteboard(), {
      mermaid: "flowchart TD\n  A --> B",
      x: 50,
      y: 80,
    })
    const { doc, expanded, errors } = await expandMermaidInDocument(base, async () => ({
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 80, height: 40, groupIds: [] },
        { id: "b", type: "rectangle", x: 0, y: 100, width: 80, height: 40, groupIds: [] },
      ],
    }))
    expect(errors).toEqual([])
    expect(expanded).toBe(1)
    expect(doc.elements.some((el) => isPendingMermaidElement(el))).toBe(false)
    expect(doc.elements.length).toBe(2)
    const lead = readTrellisMeta(doc.elements[0]!)
    expect(lead?.mermaidStatus).toBe("expanded")
    expect(lead?.mermaid).toContain("flowchart TD")
    expect(doc.elements[0]!.x).toBe(50)
    expect(doc.elements[0]!.y).toBe(80)
  })

  test("records errors when render returns no elements", async () => {
    const base = insertMermaid(emptyWhiteboard(), {
      mermaid: "flowchart TD\n  A --> B",
      x: 0,
      y: 0,
    })
    const { doc, expanded, errors } = await expandMermaidInDocument(base, async () => ({
      elements: [],
    }))
    expect(expanded).toBe(0)
    expect(errors).toContain("Mermaid produced no elements")
    expect(readTrellisMeta(doc.elements[0]!)?.mermaidStatus).toBe("error")
  })

  test("round-trips through file serialization", async () => {
    const raw = serializeWhiteboard(
      insertMermaid(emptyWhiteboard(), { mermaid: "flowchart LR\n  X --> Y", x: 10, y: 20 }),
    )
    const { doc } = await expandMermaidInDocument(parseWhiteboard(raw), async () => ({
      elements: [{ id: "x", type: "ellipse", x: 5, y: 5, width: 40, height: 40, groupIds: [] }],
    }))
    const again = parseWhiteboard(serializeWhiteboard(doc))
    expect(again.elements.length).toBe(1)
    expect(readTrellisMeta(again.elements[0]!)?.mermaidStatus).toBe("expanded")
  })
})

import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  applyTemplateToFile,
  describeWhiteboardFile,
  emptyWhiteboard,
  insertFigureToFile,
  insertMermaidToFile,
  isPendingMermaidElement,
  parseWhiteboard,
  readTrellisMeta,
  resetCorpusCache,
  serializeWhiteboard,
  tagMermaidGenerated,
} from "@opencode-ai/whiteboard"

describe("whiteboard corpus (integration)", () => {
  test("template.sprint-retro produces elements", () => {
    resetCorpusCache()
    const raw = applyTemplateToFile(serializeWhiteboard(emptyWhiteboard()), "template.sprint-retro", {
      replace: true,
    })
    expect(describeWhiteboardFile(raw)).toContain("template.sprint-retro")
  })

  test("insert_figure file helper", () => {
    resetCorpusCache()
    const base = serializeWhiteboard(emptyWhiteboard())
    const raw = insertFigureToFile(base, "figure.mindmap-node", {
      x: 10,
      y: 20,
      label: "Node A",
      bind: "issue:1",
    })
    expect(describeWhiteboardFile(raw)).toContain("binds:issue:1")
    expect(describeWhiteboardFile(raw)).toContain("Node A")
  })
})

describe("whiteboard mermaid", () => {
  test("insert_mermaid writes a pending placeholder carrying the source", () => {
    const base = serializeWhiteboard(emptyWhiteboard())
    const raw = insertMermaidToFile(base, {
      mermaid: "flowchart TD\n  A --> B",
      x: 40,
      y: 60,
      bind: "issue:7",
      label: "Auth flow",
    })
    const doc = parseWhiteboard(raw)
    const placeholder = doc.elements.find((el) => isPendingMermaidElement(el))
    expect(placeholder).toBeDefined()
    const meta = readTrellisMeta(placeholder!)
    expect(meta?.mermaid).toContain("flowchart TD")
    expect(meta?.mermaidStatus).toBe("pending")
    expect(meta?.bind).toBe("issue:7")
    expect(placeholder!.x).toBe(40)
    expect(placeholder!.y).toBe(60)
  })

  test("tagMermaidGenerated offsets, groups, and retains the source", () => {
    const generated = [
      { id: "n1", type: "rectangle", x: 10, y: 10, width: 100, height: 40, groupIds: [] },
      { id: "n2", type: "rectangle", x: 10, y: 90, width: 100, height: 40, groupIds: [] },
    ]
    const tagged = tagMermaidGenerated(generated, {
      source: "flowchart TD\n  A --> B",
      x: 200,
      y: 300,
      bind: "issue:7",
    })
    // First element lands at the target origin (min x/y of the source set).
    expect(tagged[0].x).toBe(200)
    expect(tagged[0].y).toBe(300)
    expect(tagged[1].y).toBe(380)
    const groupId = (tagged[0].groupIds as string[])[0]
    expect(groupId).toBeTruthy()
    expect((tagged[1].groupIds as string[]).includes(groupId)).toBe(true)
    const meta0 = readTrellisMeta(tagged[0])
    expect(meta0?.mermaidStatus).toBe("expanded")
    expect(meta0?.mermaid).toContain("flowchart TD")
    expect(meta0?.bind).toBe("issue:7")
    // Non-representative elements stay unbound but share the group.
    expect(readTrellisMeta(tagged[1])?.mermaidGroupId).toBe(groupId)
    expect(readTrellisMeta(tagged[1])?.mermaid).toBeUndefined()
  })
})

describe("whiteboard tool file IO", () => {
  test("writes valid whiteboard json to disk", () => {
    resetCorpusCache()
    const dir = join(tmpdir(), `wb-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, "test.whiteboard")
    try {
      writeFileSync(file, serializeWhiteboard(emptyWhiteboard()))
      const next = applyTemplateToFile(
        serializeWhiteboard(emptyWhiteboard()),
        "template.flow-diagram",
        { replace: true },
      )
      writeFileSync(file, next)
      const summary = describeWhiteboardFile(next, "test.whiteboard")
      expect(summary).toContain("template.flow-diagram")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

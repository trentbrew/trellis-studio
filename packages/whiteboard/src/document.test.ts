import { describe, expect, test } from "bun:test"
import {
  emptyWhiteboard,
  inspectWhiteboardRaw,
  parseWhiteboard,
  sanitizeAppStateForStorage,
  serializeWhiteboard,
} from "./document"

describe("inspectWhiteboardRaw", () => {
  test("empty file is empty", () => {
    expect(inspectWhiteboardRaw("")).toEqual({ status: "empty" })
    expect(inspectWhiteboardRaw("   \n")).toEqual({ status: "empty" })
  })

  test("valid excalidraw document", () => {
    const doc = emptyWhiteboard()
    const raw = serializeWhiteboard(doc)
    const result = inspectWhiteboardRaw(raw)
    expect(result.status).toBe("valid")
    if (result.status === "valid") {
      expect(result.doc.type).toBe("excalidraw")
    }
  })

  test("invalid json", () => {
    const result = inspectWhiteboardRaw("{ not json")
    expect(result.status).toBe("invalid")
    if (result.status === "invalid") {
      expect(result.kind).toBe("json")
    }
  })

  test("invalid schema", () => {
    const result = inspectWhiteboardRaw(JSON.stringify({ type: "diagram", elements: [] }))
    expect(result.status).toBe("invalid")
    if (result.status === "invalid") {
      expect(result.kind).toBe("schema")
    }
  })

  test("parseWhiteboard still falls back to empty scene", () => {
    expect(parseWhiteboard("{")).toEqual(emptyWhiteboard())
  })
})

describe("sanitizeAppStateForStorage", () => {
  test("drops openSidebar so Excalidraw does not reserve dock width", () => {
    const sanitized = sanitizeAppStateForStorage({
      openSidebar: { name: "library" },
      gridSize: 24,
    })
    expect(sanitized.openSidebar).toBeNull()
    expect(sanitized.gridSize).toBe(24)
  })
})

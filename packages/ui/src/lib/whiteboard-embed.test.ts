import { describe, expect, test } from "bun:test"
import { isWhiteboardEmbedPath } from "./whiteboard-embed"

describe("isWhiteboardEmbedPath", () => {
  test("detects whiteboard paths", () => {
    expect(isWhiteboardEmbedPath("whiteboards/plan.whiteboard")).toBe(true)
    expect(isWhiteboardEmbedPath("./diagram.whiteboard")).toBe(true)
  })

  test("rejects non-whiteboard paths", () => {
    expect(isWhiteboardEmbedPath("images/diagram.png")).toBe(false)
    expect(isWhiteboardEmbedPath("")).toBe(false)
  })
})

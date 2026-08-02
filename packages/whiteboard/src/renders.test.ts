import { describe, expect, test } from "bun:test"
import { emptyWhiteboard, parseWhiteboard } from "./document"
import {
  buildWhiteboardPreviewInfo,
  sceneElementsKey,
  whiteboardRenderPaths,
} from "./renders"

describe("whiteboard renders", () => {
  test("maps whiteboard path to sidecar paths", () => {
    expect(whiteboardRenderPaths("@canvases/agent-lanes.whiteboard")).toEqual({
      png: ".trellis/renders/agent-lanes.png",
      meta: ".trellis/renders/agent-lanes.meta.json",
    })
  })

  test("detects stale preview when elements change", () => {
    const doc = parseWhiteboard(
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [{ id: "a", type: "freedraw", isDeleted: false }],
      }),
    )
    const key = sceneElementsKey(doc.elements)
    const preview = buildWhiteboardPreviewInfo("@canvases/x.whiteboard", doc, {
      version: 1,
      whiteboardPath: "@canvases/x.whiteboard",
      elementsKey: "0:",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }, true)
    expect(preview?.stale).toBe(true)
    expect(preview?.pngPath).toBe(".trellis/renders/x.png")

    const fresh = buildWhiteboardPreviewInfo("@canvases/x.whiteboard", doc, {
      version: 1,
      whiteboardPath: "@canvases/x.whiteboard",
      elementsKey: key,
      updatedAt: "2026-06-01T00:00:00.000Z",
    }, true)
    expect(fresh?.stale).toBe(false)
  })

  test("empty board has empty elements key", () => {
    expect(sceneElementsKey(emptyWhiteboard().elements)).toBe("0:")
  })
})

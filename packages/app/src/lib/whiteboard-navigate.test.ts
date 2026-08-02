import { describe, expect, test } from "bun:test"
import { whiteboardProjectionParams } from "./whiteboard-navigate"

describe("whiteboard-navigate", () => {
  test("sets projection lens and clears stale rail params", () => {
    const next = whiteboardProjectionParams("@canvases/hateoas-diagram.whiteboard", {
      view: "assets",
      section: "assets",
      asset: "dev/favicon.ico",
      cmsEntry: "bookmark:1",
    })
    expect(next).toEqual({
      view: "projection",
      lens: "whiteboards",
      whiteboard: "@canvases/hateoas-diagram.whiteboard",
    })
  })
})

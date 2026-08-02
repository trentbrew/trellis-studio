import { describe, expect, test } from "bun:test"
import { resolveFocus } from "./registry"
import { whiteboardProjectionParams } from "../whiteboard-navigate"

describe("focus registry", () => {
  test("prefers whiteboard when board path is in the url", () => {
    const focus = resolveFocus({
      view: "projection",
      searchParams: whiteboardProjectionParams("@canvases/hateoas-diagram.whiteboard"),
      session: { id: "ses_1", laneID: "lane_a" },
    })
    expect(focus?.surface).toBe("whiteboard")
    expect(focus?.label).toBe("Whiteboard · hateoas-diagram")
    expect(focus?.key).toBe("@canvases/hateoas-diagram.whiteboard")
  })

  test("projection lens without board path uses rail label", () => {
    const focus = resolveFocus({
      view: "projection",
      searchParams: { view: "projection", lens: "whiteboards" },
      session: { id: "ses_1", laneID: "lane_a" },
    })
    expect(focus?.surface).toBe("projection")
    expect(focus?.label).toBe("Projection · Whiteboards")
  })

  test("cms beats stale whiteboard file tab context", () => {
    const focus = resolveFocus({
      view: "cms",
      activeFileTab: "notes/agent-lanes.whiteboard",
      searchParams: { view: "cms", cmsCollection: "bookmarks" },
      session: { id: "ses_1", laneID: "lane_a" },
    })
    expect(focus?.surface).toBe("cms")
    expect(focus?.label).toBe("CMS · Bookmarks")
  })

  test("uses file provider for non-whiteboard paths on code view", () => {
    const focus = resolveFocus({
      view: "code",
      activeFileTab: "src/app.ts",
      session: { id: "ses_1", laneID: "lane_a", laneForkKind: "child" },
    })
    expect(focus?.surface).toBe("file")
    expect(focus?.key).toBe("src/app.ts")
    expect(focus?.summary).toBe("Child lane")
  })

  test("falls back to shell view with lane digest", () => {
    const focus = resolveFocus({
      view: "graph",
      session: { id: "ses_1", laneID: "lane_b", laneForkKind: "sibling" },
    })
    expect(focus?.surface).toBe("graph")
    expect(focus?.summary).toBe("Forked lane")
  })

  test("lane-only session still produces focus on code view", () => {
    const focus = resolveFocus({
      view: "code",
      session: { id: "ses_1", laneID: "lane_c" },
    })
    expect(focus?.surface).toBe("shell")
    expect(focus?.payload.lane?.id).toBe("lane_c")
  })
})
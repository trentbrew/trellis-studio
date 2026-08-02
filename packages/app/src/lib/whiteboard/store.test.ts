import { describe, expect, test } from "bun:test"
import {
  findWhiteboardEntityId,
  listWhiteboardsFromStore,
  mergeWhiteboardPaths,
} from "./store-model"

describe("whiteboard store model", () => {
  test("listWhiteboardsFromStore reads path and title facts", () => {
    const entities = [{ id: "whiteboard:plan", type: "whiteboard" }]
    const facts = [
      { e: "whiteboard:plan", a: "type", v: "whiteboard" },
      { e: "whiteboard:plan", a: "path", v: "@canvases/plan.whiteboard" },
      { e: "whiteboard:plan", a: "title", v: "Plan" },
    ]
    expect(listWhiteboardsFromStore(entities, facts)).toEqual([
      { id: "whiteboard:plan", path: "@canvases/plan.whiteboard", title: "Plan" },
    ])
  })

  test("mergeWhiteboardPaths dedupes store and filesystem paths", () => {
    const merged = mergeWhiteboardPaths(
      ["whiteboards/legacy.whiteboard", "@canvases/plan.whiteboard"],
      [{ id: "whiteboard:plan", path: "@canvases/plan.whiteboard", title: "Plan" }],
    )
    expect(merged).toEqual(["@canvases/plan.whiteboard", "whiteboards/legacy.whiteboard"])
  })

  test("findWhiteboardEntityId resolves by path fact", () => {
    const facts = [{ e: "whiteboard:plan", a: "path", v: "@canvases/plan.whiteboard" }]
    expect(findWhiteboardEntityId("@canvases/plan.whiteboard", facts)).toBe("whiteboard:plan")
  })
})

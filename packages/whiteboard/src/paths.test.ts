import { describe, expect, test } from "bun:test"
import {
  dedupeWhiteboardPath,
  defaultEntityMarkdownPath,
  defaultWhiteboardPath,
  entityIdFromMarkdownPath,
  isEntityMarkdownPath,
  isKnownWhiteboardLocation,
  isSketchWhiteboardPath,
  legacyWhiteboardDirs,
  slugifyWhiteboardTitle,
  whiteboardEntityId,
  whiteboardPathForIntent,
} from "./paths"

describe("materialized whiteboard paths", () => {
  test("slugifyWhiteboardTitle normalizes titles", () => {
    expect(slugifyWhiteboardTitle("Agent Lanes")).toBe("agent-lanes")
    expect(slugifyWhiteboardTitle("---")).toBe("untitled")
  })

  test("defaultWhiteboardPath uses @canvases for durable boards", () => {
    expect(defaultWhiteboardPath()).toBe("@canvases/untitled.whiteboard")
    expect(defaultWhiteboardPath("Plan")).toBe("@canvases/plan.whiteboard")
  })

  test("defaultWhiteboardPath uses .trellis/sketch for sketch intent", () => {
    expect(defaultWhiteboardPath("Scratch", "sketch")).toBe(".trellis/sketch/scratch.whiteboard")
  })

  test("dedupeWhiteboardPath appends numeric suffix", () => {
    const existing = new Set(["@canvases/untitled.whiteboard", "@canvases/untitled-1.whiteboard"])
    expect(dedupeWhiteboardPath("@canvases/untitled.whiteboard", existing)).toBe("@canvases/untitled-2.whiteboard")
  })

  test("legacyWhiteboardDirs includes @canvases and whiteboards", () => {
    expect(legacyWhiteboardDirs()).toEqual(["@canvases", "whiteboards"])
  })

  test("whiteboardEntityId uses slug prefix", () => {
    expect(whiteboardEntityId("agent-lanes")).toBe("whiteboard:agent-lanes")
  })

  test("isSketchWhiteboardPath detects sketch tier", () => {
    expect(isSketchWhiteboardPath(".trellis/sketch/agent-lanes.whiteboard")).toBe(true)
    expect(isSketchWhiteboardPath("@canvases/plan.whiteboard")).toBe(false)
  })

  test("isKnownWhiteboardLocation accepts canonical dirs", () => {
    expect(isKnownWhiteboardLocation("@canvases/plan.whiteboard")).toBe(true)
    expect(isKnownWhiteboardLocation("whiteboards/plan.whiteboard")).toBe(true)
    expect(isKnownWhiteboardLocation(".trellis/sketch/plan.whiteboard")).toBe(true)
    expect(isKnownWhiteboardLocation("src/plan.whiteboard")).toBe(false)
  })

  test("whiteboardPathForIntent builds under rule dir", () => {
    expect(whiteboardPathForIntent("roadmap", "durable")).toBe("@canvases/roadmap.whiteboard")
    expect(whiteboardPathForIntent("roadmap", "sketch")).toBe(".trellis/sketch/roadmap.whiteboard")
  })

  test("defaultEntityMarkdownPath uses @entities namespace", () => {
    expect(defaultEntityMarkdownPath("artifact:jd")).toBe("@entities/artifact/jd.md")
  })

  test("entityIdFromMarkdownPath reverses default path", () => {
    expect(entityIdFromMarkdownPath("@entities/person/ada.md")).toBe("person:ada")
    expect(isEntityMarkdownPath("@entities/person/ada.md")).toBe(true)
    expect(isEntityMarkdownPath("jd.md")).toBe(false)
  })
})

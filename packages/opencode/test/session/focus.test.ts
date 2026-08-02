import { describe, expect, test } from "bun:test"
import { SessionFocus } from "../../src/session/focus"

describe("SessionFocus", () => {
  test("validates and formats focus block", () => {
    const focus = SessionFocus.validate({
      version: 1,
      surface: "shell",
      label: "Session",
      key: "ses_1",
      summary: "Child lane",
      payload: {
        lane: {
          id: "lane-1",
          forkKind: "child",
          parentLaneId: "lane-0",
        },
      },
      capturedAt: new Date().toISOString(),
    })
    expect(focus).toBeTruthy()
    const block = SessionFocus.formatBlock(focus!)
    expect(block).toContain("[FOCUS v1]")
    expect(block).toContain("Child lane")
    expect(block).toContain("lane-1")
    expect(block).toContain("[/FOCUS]")
  })

  test("rejects oversized payload", () => {
    const focus = SessionFocus.validate({
      version: 1,
      surface: "file",
      label: "File",
      key: "big",
      payload: { blob: "x".repeat(SessionFocus.MAX_BYTES) },
      capturedAt: new Date().toISOString(),
    })
    expect(focus).toBeUndefined()
  })
})

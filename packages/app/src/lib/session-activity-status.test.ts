import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Message, Part, ToolPart, UserMessage } from "@opencode-ai/sdk/v2/client"
import { deriveSessionActivitySnapshot, formatElapsed } from "./session-activity-status"

const user = (id: string, created: number): UserMessage =>
  ({
    id,
    role: "user",
    time: { created },
  }) as UserMessage

const assistant = (id: string, parentID: string, created: number, completed?: number): AssistantMessage =>
  ({
    id,
    role: "assistant",
    parentID,
    time: { created, completed },
  }) as AssistantMessage

const tool = (id: string, messageID: string, toolName: string, state: ToolPart["state"]): ToolPart =>
  ({
    id,
    messageID,
    type: "tool",
    tool: toolName,
    state,
  }) as ToolPart

describe("deriveSessionActivitySnapshot", () => {
  test("shows active read tool with whiteboard subtitle", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", "u1", 110)]
    const parts: Record<string, Part[]> = {
      a1: [
        tool("p1", "a1", "read", {
          status: "running",
          input: { filePath: "/proj/@canvases/untitled-2.whiteboard" },
          time: { start: 120 },
        }),
      ],
    }

    const snapshot = deriveSessionActivitySnapshot({
      status: { type: "busy" },
      messages,
      partsByMessage: parts,
      now: 5000,
    })

    expect(snapshot?.primary).toBe("Reading file")
    expect(snapshot?.secondary).toBe("whiteboard · untitled-2")
    expect(snapshot?.elapsedMs).toBe(4890)
  })

  test("shows running title from server metadata", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", "u1", 110)]
    const parts: Record<string, Part[]> = {
      a1: [
        tool("p1", "a1", "read", {
          status: "running",
          input: { filePath: "/proj/@canvases/untitled-2.whiteboard" },
          title: "untitled-2.whiteboard — analyzing visual preview",
          time: { start: 120 },
        }),
      ],
    }

    const snapshot = deriveSessionActivitySnapshot({
      status: { type: "busy" },
      messages,
      partsByMessage: parts,
    })

    expect(snapshot?.primary).toBe("untitled-2.whiteboard — analyzing visual preview")
  })

  test("shows retry detail", () => {
    const snapshot = deriveSessionActivitySnapshot({
      status: {
        type: "retry",
        attempt: 2,
        message: "Gemini API 503",
        next: 10_000,
      },
      messages: [user("u1", 100), assistant("a1", "u1", 110)],
      now: 7000,
    })

    expect(snapshot?.tone).toBe("retry")
    expect(snapshot?.primary).toBe("Backing off before retry")
    expect(snapshot?.detail).toContain("Attempt 2")
    expect(snapshot?.detail).toContain("Retry in 3s")
  })

  test("shows tool error even while waiting", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", "u1", 110)]
    const parts: Record<string, Part[]> = {
      a1: [
        tool("p1", "a1", "read", {
          status: "error",
          input: { filePath: "/proj/foo.png" },
          error: "Media analysis failed: 503",
          time: { start: 120, end: 500 },
        }),
      ],
    }

    const snapshot = deriveSessionActivitySnapshot({
      status: { type: "busy" },
      messages,
      partsByMessage: parts,
    })

    expect(snapshot?.primary).toBe("Waiting for model")
    expect(snapshot?.steps.some((step) => step.status === "error")).toBe(true)
  })
})

describe("formatElapsed", () => {
  test("formats seconds and minutes", () => {
    expect(formatElapsed(4500)).toBe("4s")
    expect(formatElapsed(65_000)).toBe("1m 5s")
  })
})

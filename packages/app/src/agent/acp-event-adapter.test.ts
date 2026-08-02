import { describe, expect, test } from "bun:test"
import { sessionUpdateSamples as samples } from "./fixtures/session-update-samples"
import { collectAssistantText, sessionUpdateToParts } from "./acp-event-adapter"

describe("acp-event-adapter", () => {
  test("maps agent_message_chunk to assistant text parts", () => {
    const parts = sessionUpdateToParts(samples[0]!)
    expect(parts).toEqual([{ kind: "text", role: "assistant", text: "Hello ", delta: true }])
  })

  test("collectAssistantText merges streaming chunks", () => {
    const text = collectAssistantText(samples)
    expect(text).toBe("Hello world")
  })

  test("maps tool_call_update", () => {
    const parts = sessionUpdateToParts(samples[3]!)
    expect(parts[0]?.kind).toBe("tool")
    if (parts[0]?.kind === "tool") {
      expect(parts[0].toolCallId).toBe("call_1")
      expect(parts[0].status).toBe("in_progress")
    }
  })
})

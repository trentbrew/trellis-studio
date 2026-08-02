import { describe, expect, test } from "bun:test"
import type { AssistantMessage, Message, UserMessage } from "@opencode-ai/sdk/v2/client"
import { isSessionStatusStale, isSessionWorking } from "./session-working"

const user = (id: string, created: number): UserMessage =>
  ({
    id,
    role: "user",
    time: { created },
  }) as UserMessage

const assistant = (
  id: string,
  created: number,
  completed?: number,
  error?: AssistantMessage["error"],
): AssistantMessage =>
  ({
    id,
    role: "assistant",
    time: { created, completed },
    error,
  }) as AssistantMessage

describe("isSessionWorking", () => {
  test("idle with no messages", () => {
    expect(isSessionWorking({ type: "idle" }, [])).toBe(false)
  })

  test("busy while waiting for first assistant message", () => {
    const messages: Message[] = [user("u1", 100)]
    expect(isSessionWorking({ type: "busy" }, messages)).toBe(true)
  })

  test("busy while assistant message is incomplete", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110)]
    expect(isSessionWorking({ type: "busy" }, messages)).toBe(true)
  })

  test("not working when assistant errored without completed timestamp", () => {
    const messages: Message[] = [
      user("u1", 100),
      assistant("a1", 110, undefined, {
        name: "APIError",
        data: { message: "Request contains an invalid argument.", isRetryable: false },
      }),
    ]
    expect(isSessionWorking({ type: "busy" }, messages)).toBe(false)
    expect(isSessionWorking({ type: "retry", attempt: 1, message: "x", next: 200 }, messages)).toBe(true)
  })

  test("not working when assistant message completed even if status is stale busy", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110, 150)]
    expect(isSessionWorking({ type: "busy" }, messages)).toBe(false)
  })

  test("retry is always working", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110, 150)]
    expect(isSessionWorking({ type: "retry", attempt: 1, message: "x", next: 200 }, messages)).toBe(true)
  })

  test("busy after a new user message before assistant responds", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110, 150), user("u2", 200)]
    expect(isSessionWorking({ type: "busy" }, messages)).toBe(true)
  })
})

describe("isSessionStatusStale", () => {
  test("detects stale busy status after completion", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110, 150)]
    expect(isSessionStatusStale({ type: "busy" }, messages)).toBe(true)
  })

  test("ignores idle status", () => {
    const messages: Message[] = [user("u1", 100), assistant("a1", 110, 150)]
    expect(isSessionStatusStale({ type: "idle" }, messages)).toBe(false)
  })
})

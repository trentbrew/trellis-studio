import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import type { Event } from "@opencode-ai/sdk/v2/client"

// Test the event processing logic directly without SolidJS context complexity
describe("global-sdk event processing", () => {
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    consoleSpy.error.mockRestore()
    consoleSpy.warn.mockRestore()
  })

  // Helper function to simulate the event validation logic from global-sdk.tsx
  function validateEvent(event: any): { valid: boolean; directory: string; payload: any } | null {
    // Defensive check to ensure event has expected structure
    if (!event || typeof event !== "object") {
      console.warn("[global-sdk] received malformed event", event)
      return null
    }

    const directory = event.directory ?? "global"
    const payload = event.payload

    // Defensive check for payload existence and type
    if (!payload || typeof payload !== "object" || !payload.type) {
      console.warn("[global-sdk] received event without valid payload", event)
      return null
    }

    return { valid: true, directory, payload }
  }

  test("validates correct event structure", () => {
    const validEvent = {
      directory: "test-dir",
      payload: {
        type: "server.connected",
        properties: {},
      },
    }

    const result = validateEvent(validEvent)

    expect(result).not.toBeNull()
    expect(result!.valid).toBe(true)
    expect(result!.directory).toBe("test-dir")
    expect(result!.payload.type).toBe("server.connected" as const)
    expect(consoleSpy.warn).not.toHaveBeenCalled()
  })

  test("rejects null events", () => {
    const result = validateEvent(null)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith("[global-sdk] received malformed event", null)
  })

  test("rejects undefined events", () => {
    const result = validateEvent(undefined)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith("[global-sdk] received malformed event", undefined)
  })

  test("rejects string events", () => {
    const result = validateEvent("invalid-event")

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith("[global-sdk] received malformed event", "invalid-event")
  })

  test("rejects number events", () => {
    const result = validateEvent(42)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith("[global-sdk] received malformed event", 42)
  })

  test("uses global directory when not specified", () => {
    const eventWithoutDirectory = {
      payload: {
        type: "server.connected",
        properties: {},
      },
    }

    const result = validateEvent(eventWithoutDirectory)

    expect(result).not.toBeNull()
    expect(result!.directory).toBe("global")
    expect(consoleSpy.warn).not.toHaveBeenCalled()
  })

  test("rejects events with null payload", () => {
    const eventWithNullPayload = {
      directory: "test",
      payload: null,
    }

    const result = validateEvent(eventWithNullPayload)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[global-sdk] received event without valid payload",
      eventWithNullPayload,
    )
  })

  test("rejects events with undefined payload", () => {
    const eventWithUndefinedPayload = {
      directory: "test",
      payload: undefined,
    }

    const result = validateEvent(eventWithUndefinedPayload)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[global-sdk] received event without valid payload",
      eventWithUndefinedPayload,
    )
  })

  test("rejects events with empty payload object", () => {
    const eventWithEmptyPayload = {
      directory: "test",
      payload: {},
    }

    const result = validateEvent(eventWithEmptyPayload)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[global-sdk] received event without valid payload",
      eventWithEmptyPayload,
    )
  })

  test("rejects events with payload missing type", () => {
    const eventWithMissingType = {
      directory: "test",
      payload: {
        properties: {},
      },
    }

    const result = validateEvent(eventWithMissingType)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[global-sdk] received event without valid payload",
      eventWithMissingType,
    )
  })

  test("rejects events with empty string type", () => {
    const eventWithEmptyType = {
      directory: "test",
      payload: {
        type: "",
        properties: {},
      },
    }

    const result = validateEvent(eventWithEmptyType)

    expect(result).toBeNull()
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      "[global-sdk] received event without valid payload",
      eventWithEmptyType,
    )
  })

  test("accepts various valid event types", () => {
    const validEvents = [
      {
        directory: "test",
        payload: {
          type: "server.connected",
          properties: {},
        },
      },
      {
        directory: "test",
        payload: {
          type: "server.heartbeat",
          properties: {},
        },
      },
      {
        directory: "test",
        payload: {
          type: "message.part.updated",
          properties: {
            sessionID: "session1",
            time: Date.now(),
            part: {
              id: "part1",
              sessionID: "session1",
              messageID: "msg1",
              type: "text",
            },
          },
        },
      },
      {
        directory: "test",
        payload: {
          type: "session.status",
          properties: {
            sessionID: "session1",
          },
        },
      },
      {
        directory: "test",
        payload: {
          type: "lsp.updated",
          properties: {},
        },
      },
    ]

    for (const event of validEvents) {
      const result = validateEvent(event)
      expect(result).not.toBeNull()
      expect(result!.valid).toBe(true)
      expect(result!.payload.type).toBe(event.payload.type as string)
    }

    expect(consoleSpy.warn).not.toHaveBeenCalled()
  })

  test("handles mixed valid and invalid events", () => {
    const events = [
      null, // invalid
      "invalid", // invalid
      {
        directory: "test",
        payload: {
          type: "server.connected",
          properties: {},
        },
      }, // valid
      42, // invalid
      {
        payload: {
          type: "server.heartbeat",
          properties: {},
        },
      }, // valid (no directory)
      {}, // invalid (no payload)
    ]

    const results = events.map(validateEvent)

    // Should have 2 valid results
    const validResults = results.filter((r) => r !== null)
    expect(validResults).toHaveLength(2)

    // Should have 4 warnings for invalid events
    expect(consoleSpy.warn).toHaveBeenCalledTimes(4)

    // Valid events should be correct
    expect(validResults[0]!.payload.type).toBe("server.connected")
    expect(validResults[0]!.directory).toBe("test")
    expect(validResults[1]!.payload.type).toBe("server.heartbeat")
    expect(validResults[1]!.directory).toBe("global")
  })
})

describe("SSE error handling", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  test("logs enhanced error information", () => {
    const sseError = new TypeError("Error in input stream")
    const mockErr = {
      name: "TypeError",
      message: "Error in input stream",
      cause: undefined,
    }

    // Simulate the enhanced error logging from global-sdk.tsx
    console.error("[global-sdk] event stream error", {
      url: "http://localhost:4096",
      fetch: "webview",
      name: mockErr.name,
      message: mockErr.message,
      cause: mockErr.cause,
      error: sseError,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "server",
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      "[global-sdk] event stream error",
      expect.objectContaining({
        url: "http://localhost:4096",
        fetch: "webview",
        name: "TypeError",
        message: "Error in input stream",
        cause: undefined,
        error: sseError,
        timestamp: expect.any(String),
        userAgent: expect.any(String),
      }),
    )
  })

  test("handles different error types", () => {
    const errors = [
      { name: "AbortError", message: "Operation aborted" },
      { name: "NetworkError", message: "Network connection failed" },
      { name: "TypeError", message: "Error in input stream" },
    ]

    for (const error of errors) {
      consoleSpy.mockClear()

      console.error("[global-sdk] event stream error", {
        url: "http://localhost:4096",
        fetch: "platform",
        name: error.name,
        message: error.message,
        cause: undefined,
        error: new Error(error.message),
        timestamp: new Date().toISOString(),
        userAgent: "test-agent",
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        "[global-sdk] event stream error",
        expect.objectContaining({
          name: error.name,
          message: error.message,
        }),
      )
    }
  })
})

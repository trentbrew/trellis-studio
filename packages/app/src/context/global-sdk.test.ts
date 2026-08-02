import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { createRoot, createSignal, createEffect } from "solid-js"
import type { Event } from "@opencode-ai/sdk/v2/client"
import { createSdkForServer } from "@/utils/server"
import { useGlobalSDK, GlobalSDKProvider } from "./global-sdk"

// Mock dependencies
const mockCreateSdkForServer = vi.fn()
vi.mock("@/utils/server", () => ({
  createSdkForServer: mockCreateSdkForServer,
}))

vi.mock("@/context/language", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock("@/context/platform", () => ({
  usePlatform: () => ({
    fetch: global.fetch,
  }),
}))

vi.mock("@/context/server", () => ({
  useServer: () => ({
    current: {
      http: {
        url: "http://localhost:4096",
        username: "test",
        password: "test",
      },
    },
  }),
}))

// Mock event stream
function createMockEventStream(events: Array<any>) {
  let index = 0
  return {
    stream: (async function* () {
      for (const event of events) {
        yield event
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    })(),
  }
}

function createMockSdk() {
  const mockSdk = {
    global: {
      event: vi.fn(),
    },
  }
  return mockSdk
}

describe("global-sdk event stream", () => {
  let mockSdk: any
  let mockEvents: Array<{ directory?: string; payload?: Event }>
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockEvents = []
    mockSdk = createMockSdk()
    consoleSpy = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    }

    mockCreateSdkForServer.mockReturnValue(mockSdk)
  })

  afterEach(() => {
    consoleSpy.error.mockRestore()
    consoleSpy.warn.mockRestore()
  })

  test("handles valid events correctly", async () => {
    const validEvent = {
      directory: "test-dir",
      payload: {
        type: "server.connected",
        properties: {},
      } as Event,
    }

    mockSdk.global.event.mockResolvedValue(createMockEventStream([validEvent]))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      // Start the event stream
      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(consoleSpy.warn).not.toHaveBeenCalled()
          expect(consoleSpy.error).not.toHaveBeenCalled()
          dispose()
          resolve()
        }, 10)
      })
    })
  })

  test("handles malformed events gracefully", async () => {
    const malformedEvents = [
      null,
      undefined,
      "string-event",
      42,
      {},
      { directory: "test" }, // missing payload
      { payload: { type: "test" } }, // missing directory (should use "global")
      { directory: "test", payload: null }, // null payload
      { directory: "test", payload: {} }, // missing type
      { directory: "test", payload: { properties: {} } }, // missing type
    ]

    mockSdk.global.event.mockResolvedValue(createMockEventStream(malformedEvents))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should have warned about malformed events
          expect(consoleSpy.warn).toHaveBeenCalledTimes(8)

          // Should not have crashed
          expect(consoleSpy.error).not.toHaveBeenCalled()

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("handles events with undefined payload", async () => {
    const eventsWithUndefinedPayload = [
      { directory: "test", payload: undefined },
      { directory: "test", payload: null },
      { directory: "test", payload: {} as any },
    ]

    mockSdk.global.event.mockResolvedValue(createMockEventStream(eventsWithUndefinedPayload))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(consoleSpy.warn).toHaveBeenCalledTimes(3)
          expect(consoleSpy.warn).toHaveBeenCalledWith(
            "[global-sdk] received event without valid payload",
            expect.any(Object),
          )

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("handles events with missing type in payload", async () => {
    const eventsWithMissingType = [
      { directory: "test", payload: { properties: {} } as any },
      { directory: "test", payload: { type: "", properties: {} } as any },
    ]

    mockSdk.global.event.mockResolvedValue(createMockEventStream(eventsWithMissingType))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(consoleSpy.warn).toHaveBeenCalledTimes(2)
          expect(consoleSpy.warn).toHaveBeenCalledWith(
            "[global-sdk] received event without valid payload",
            expect.any(Object),
          )

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("processes valid events and skips invalid ones", async () => {
    const mixedEvents = [
      null, // invalid
      {
        directory: "test",
        payload: {
          type: "server.connected",
          properties: {},
        },
      }, // valid
      "invalid", // invalid
      {
        directory: "test2",
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
      }, // valid
    ]

    mockSdk.global.event.mockResolvedValue(createMockEventStream(mixedEvents))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should have warned about 2 invalid events
          expect(consoleSpy.warn).toHaveBeenCalledTimes(2)

          // Should not have errored
          expect(consoleSpy.error).not.toHaveBeenCalled()

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("handles SSE errors with enhanced logging", async () => {
    const sseError = new TypeError("Error in input stream")
    const mockError = {
      name: "TypeError",
      message: "Error in input stream",
      cause: undefined,
    }

    mockSdk.global.event.mockImplementation(() => {
      throw sseError
    })

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(consoleSpy.error).toHaveBeenCalledWith(
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

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("uses platform fetch when available", async () => {
    const platformFetch = vi.fn()

    // Mock platform fetch
    mockCreateSdkForServer.mockImplementation((opts) => {
      const mockSdk = createMockSdk()
      return mockSdk
    })

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      // The SDK should be created with platform fetch
      expect(mockCreateSdkForServer).toHaveBeenCalledWith(
        expect.objectContaining({
          fetch: platformFetch,
        }),
      )

      dispose()
    })
  })

  test("handles event coalescing correctly", async () => {
    const events = [
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
      }, // Should coalesce with previous
      {
        directory: "test",
        payload: {
          type: "server.heartbeat",
          properties: {},
        },
      }, // Different type, should not coalesce
    ]

    mockSdk.global.event.mockResolvedValue(createMockEventStream(events))

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should not have any warnings or errors
          expect(consoleSpy.warn).not.toHaveBeenCalled()
          expect(consoleSpy.error).not.toHaveBeenCalled()

          dispose()
          resolve()
        }, 50)
      })
    })
  })

  test("handles aborted signal gracefully", async () => {
    const abortController = new AbortController()

    mockSdk.global.event.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      // Simulate immediate abort
      setTimeout(() => abortController.abort(), 1)

      return createMockEventStream([
        {
          directory: "test",
          payload: {
            type: "server.connected",
            properties: {},
          },
        },
      ])
    })

    await createRoot((dispose) => {
      const sdk = useGlobalSDK()

      const streamPromise = sdk.event.start()

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Should handle abort without errors
          expect(consoleSpy.error).not.toHaveBeenCalled()

          dispose()
          resolve()
        }, 50)
      })
    })
  })
})

import { describe, expect, test } from "bun:test"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { cmsMutationSucceeded, completedToolLooksSuccessful } from "./tool-mutation-succeeded"

function cmsPart(input: {
  action: string
  title: string
  metadata?: Record<string, unknown>
}): ToolPart {
  return {
    type: "tool",
    id: "part-1",
    sessionID: "s1",
    messageID: "msg-1",
    callID: "call-1",
    tool: "cms",
    state: {
      status: "completed",
      input: { action: input.action },
      output: "",
      title: input.title,
      metadata: input.metadata ?? {},
      time: { start: 0, end: 1 },
    },
  }
}

describe("completedToolLooksSuccessful", () => {
  test("rejects validation failures", () => {
    expect(
      completedToolLooksSuccessful(
        cmsPart({ action: "create_entry", title: "Validation failed", metadata: { collection: "blog_post" } }),
      ),
    ).toBe(false)
  })

  test("accepts successful creates", () => {
    expect(
      completedToolLooksSuccessful(
        cmsPart({ action: "create_entry", title: "Created blog_post:abc", metadata: { id: "blog_post:abc" } }),
      ),
    ).toBe(true)
  })
})

describe("cmsMutationSucceeded", () => {
  test("create_entry requires metadata id", () => {
    expect(
      cmsMutationSucceeded(
        cmsPart({
          action: "create_entry",
          title: "No entry created",
          metadata: { ok: false, collection: "blog_post" },
        }),
        "create_entry",
      ),
    ).toBe(false)
  })

  test("metadata.ok overrides optimistic titles", () => {
    expect(
      cmsMutationSucceeded(
        cmsPart({
          action: "create_entry",
          title: "Created blog_post:abc",
          metadata: { ok: false, id: "blog_post:abc", collection: "blog_post" },
        }),
        "create_entry",
      ),
    ).toBe(false)
  })

  test("create_collection accepts existing collection", () => {
    expect(
      cmsMutationSucceeded(cmsPart({ action: "create_collection", title: "Exists", metadata: { key: "blog_post" } }), "create_collection"),
    ).toBe(true)
  })
})

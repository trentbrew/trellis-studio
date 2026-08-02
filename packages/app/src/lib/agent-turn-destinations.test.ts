import { describe, expect, test } from "bun:test"
import type { Message, Part, ToolPart } from "@opencode-ai/sdk/v2"
import { extractTurnDestinations } from "./agent-turn-destinations"

type ToolPartFixtureInput =
  Pick<ToolPart, "callID" | "tool" | "state"> & Partial<Pick<ToolPart, "id" | "sessionID">>

function toolPart(messageID: string, part: ToolPartFixtureInput): ToolPart {
  return {
    type: "tool",
    id: part.id ?? `part-${part.callID}`,
    sessionID: part.sessionID ?? "s1",
    messageID,
    callID: part.callID,
    tool: part.tool,
    state: part.state,
  }
}

describe("extractTurnDestinations", () => {
  test("skips failed cms create_entry but keeps file and collection actions", () => {
    const userMessageId = "user-1"
    const assistantId = "assistant-1"
    const messages: Message[] = [
      { id: userMessageId, role: "user", sessionID: "s1", time: { created: 1 }, agent: "build", model: { providerID: "p", modelID: "m" } },
      {
        id: assistantId,
        role: "assistant",
        parentID: userMessageId,
        sessionID: "s1",
        time: { created: 2 },
        agent: "build",
        mode: "build",
        modelID: "m",
        providerID: "p",
        path: { cwd: "/", root: "/" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    ]

    const partsByMessage: Record<string, Part[] | undefined> = {
      [assistantId]: [
        toolPart(assistantId, {
          callID: "c1",
          tool: "cms",
          state: {
            status: "completed",
            input: { action: "create_collection", collection: "blog_post" },
            output: "",
            title: "Created collection blog_post",
            metadata: { key: "blog_post" },
            time: { start: 0, end: 1 },
          },
        }),
        toolPart(assistantId, {
          callID: "c2",
          tool: "cms",
          state: {
            status: "completed",
            input: { action: "create_entry", collection: "blog_post", values: {} },
            output: "",
            title: "Validation failed",
            metadata: { ok: false, collection: "blog_post", errors: ["name is required"] },
            time: { start: 0, end: 1 },
          },
        }),
        toolPart(assistantId, {
          callID: "c3",
          tool: "write",
          state: {
            status: "completed",
            input: { filePath: "crdt-blog-post.md" },
            output: "",
            title: "crdt-blog-post.md",
            metadata: { filePath: "crdt-blog-post.md" },
            time: { start: 0, end: 1 },
          },
        }),
      ],
    }

    const destinations = extractTurnDestinations({ userMessageId, messages, partsByMessage })
    expect(destinations.map((d) => d.label)).toEqual([
      "Open blog_post collection",
      "Entry not saved to blog_post",
      "Open crdt-blog-post.md",
    ])
    expect(destinations.find((d) => d.kind === "notice")?.description).toBe("Validation failed")
  })
})

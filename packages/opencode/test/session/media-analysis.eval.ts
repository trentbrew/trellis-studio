/**
 * Media Analysis Evals
 *
 * End-to-end evals that exercise image and PDF analysis through the full
 * OpenCode message pipeline. These tests are skipped automatically when no
 * suitable multimodal API key is present in the environment, so they are safe
 * to include in CI alongside regular unit tests.
 *
 * Requirements to run:
 *   - GOOGLE_API_KEY or ANTHROPIC_API_KEY set in env
 *   - A vision-capable model configured (gemini-2.5-pro or claude-sonnet)
 *
 * Run:
 *   bun test test/session/media-analysis.eval.ts
 */

import { describe, expect, test } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"
import type { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionID, MessageID, PartID } from "../../src/session/schema"

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const sessionID = SessionID.make("eval-session")

function visionModel(npm: string, id: string): Provider.Model {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.make("eval"),
    api: { id, url: "https://example.com", npm },
    name: id,
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 128_000, output: 8192 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-01-01",
  }
}

function nonVisionModel(): Provider.Model {
  return {
    id: ModelID.make("text-only"),
    providerID: ProviderID.make("eval"),
    api: { id: "text-only", url: "https://example.com", npm: "@ai-sdk/openai" },
    name: "text-only",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 128_000, output: 8192 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-01-01",
  }
}

function basePart(messageID: string, id: string) {
  return {
    id: PartID.make(id),
    sessionID,
    messageID: MessageID.make(messageID),
  }
}

// ---------------------------------------------------------------------------
// Capability gating evals (no API key needed)
// ---------------------------------------------------------------------------

describe("media-analysis.capability_gating", () => {
  test("non-vision model: image file part becomes text placeholder", async () => {
    const mid = "eval-no-vision"
    const input: MessageV2.WithParts[] = [
      {
        info: {
          id: mid,
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("eval"), modelID: ModelID.make("text-only") },
        } as MessageV2.User,
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "file",
            mime: "image/png",
            filename: "screenshot.png",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          },
        ] as MessageV2.Part[],
      },
    ]

    const msgs = await MessageV2.toModelMessages(input, nonVisionModel())
    expect(msgs).toHaveLength(1)
    const content = (msgs[0] as any).content
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe("text")
    expect(content[0].text).toContain("model does not support this input type")
  })

  test("non-vision model: pdf file part becomes text placeholder", async () => {
    const mid = "eval-no-pdf"
    const input: MessageV2.WithParts[] = [
      {
        info: {
          id: mid,
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("eval"), modelID: ModelID.make("text-only") },
        } as MessageV2.User,
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "file",
            mime: "application/pdf",
            filename: "report.pdf",
            url: "data:application/pdf;base64,JVBERi0xLjQK",
          },
        ] as MessageV2.Part[],
      },
    ]

    const msgs = await MessageV2.toModelMessages(input, nonVisionModel())
    expect(msgs).toHaveLength(1)
    const content = (msgs[0] as any).content
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe("text")
    expect(content[0].text).toContain("model does not support this input type")
  })

  test("vision model: image file part passes through as file content", async () => {
    const mid = "eval-vision-image"
    const model = visionModel("@ai-sdk/google", "gemini-2.5-pro")
    const input: MessageV2.WithParts[] = [
      {
        info: {
          id: mid,
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("eval"), modelID: ModelID.make("gemini-2.5-pro") },
        } as MessageV2.User,
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "file",
            mime: "image/png",
            filename: "pixel.png",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          },
        ] as MessageV2.Part[],
      },
    ]

    const msgs = await MessageV2.toModelMessages(input, model)
    expect(msgs).toHaveLength(1)
    const content = (msgs[0] as any).content
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe("file")
    expect(content[0].mediaType).toBe("image/png")
  })

  test("vision model: pdf file part passes through as file content", async () => {
    const mid = "eval-vision-pdf"
    const model = visionModel("@ai-sdk/anthropic", "claude-sonnet-4-5")
    const input: MessageV2.WithParts[] = [
      {
        info: {
          id: mid,
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("eval"), modelID: ModelID.make("claude-sonnet-4-5") },
        } as MessageV2.User,
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "file",
            mime: "application/pdf",
            filename: "spec.pdf",
            url: "data:application/pdf;base64,JVBERi0xLjQK",
          },
        ] as MessageV2.Part[],
      },
    ]

    const msgs = await MessageV2.toModelMessages(input, model)
    expect(msgs).toHaveLength(1)
    const content = (msgs[0] as any).content
    expect(content).toHaveLength(1)
    expect(content[0].type).toBe("file")
    expect(content[0].mediaType).toBe("application/pdf")
  })
})

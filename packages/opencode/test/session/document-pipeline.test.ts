import { describe, expect, test } from "bun:test"
import { ProviderTransform } from "../../src/provider/transform"
import { MessageV2 } from "../../src/session/message-v2"
import type { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionID, MessageID, PartID } from "../../src/session/schema"

const sessionID = SessionID.make("session")
const providerID = ProviderID.make("test")

// Model that supports PDF natively (like Claude)
const pdfModel: Provider.Model = {
  id: ModelID.make("claude-test"),
  providerID,
  api: { id: "claude-test", url: "https://example.com", npm: "@ai-sdk/anthropic" },
  name: "Claude Test",
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
  limit: { context: 200000, input: 100000, output: 8192 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
} as Provider.Model

// Model that does NOT support PDF (like Big Pickle / text-only)
const textModel: Provider.Model = {
  ...pdfModel,
  id: ModelID.make("text-only"),
  api: { id: "text-only", url: "https://example.com", npm: "@ai-sdk/openai" },
  name: "Text Only",
  capabilities: {
    ...pdfModel.capabilities,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
  },
} as Provider.Model

function basePart(messageID: string, id: string) {
  return {
    id: PartID.make(id),
    sessionID,
    messageID: MessageID.make(messageID),
  }
}

function userInfo(id: string): MessageV2.User {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: 0 },
    agent: "user",
    model: { providerID, modelID: ModelID.make("test") },
    tools: {},
    mode: "",
  } as unknown as MessageV2.User
}

// --- Tests for the unsupportedParts transform ---

describe("ProviderTransform.message — unsupportedParts for documents", () => {
  test("passes PDF through when model supports pdf input", () => {
    const msgs = ProviderTransform.message(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            {
              type: "file",
              data: "data:application/pdf;base64,AAAA",
              mediaType: "application/pdf",
              filename: "doc.pdf",
            },
          ],
        },
      ],
      pdfModel,
      {},
    )
    const parts = msgs[0].content as any[]
    expect(parts).toHaveLength(2)
    expect(parts[1].type).toBe("file")
    expect(parts[1].mediaType).toBe("application/pdf")
  })

  test("replaces PDF with error when model lacks pdf input", () => {
    const msgs = ProviderTransform.message(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            {
              type: "file",
              data: "data:application/pdf;base64,AAAA",
              mediaType: "application/pdf",
              filename: "doc.pdf",
            },
          ],
        },
      ],
      textModel,
      {},
    )
    const parts = msgs[0].content as any[]
    expect(parts).toHaveLength(2)
    expect(parts[0].type).toBe("text")
    expect(parts[0].text).toBe("describe this")
    expect(parts[1].type).toBe("text")
    expect(parts[1].text).toContain("ERROR")
    expect(parts[1].text).toContain("doc.pdf")
    expect(parts[1].text).toContain("does not support pdf input")
  })

  test("passes image through when model supports image input", () => {
    const msgs = ProviderTransform.message(
      [
        {
          role: "user",
          content: [{ type: "file", data: "data:image/png;base64,AA", mediaType: "image/png", filename: "img.png" }],
        },
      ],
      pdfModel,
      {},
    )
    const parts = msgs[0].content as any[]
    expect(parts[0].type).toBe("file")
  })

  test("replaces image with error when model lacks image input", () => {
    const msgs = ProviderTransform.message(
      [
        {
          role: "user",
          content: [{ type: "file", data: "data:image/png;base64,AA", mediaType: "image/png", filename: "img.png" }],
        },
      ],
      textModel,
      {},
    )
    const parts = msgs[0].content as any[]
    expect(parts[0].type).toBe("text")
    expect(parts[0].text).toContain("ERROR")
    expect(parts[0].text).toContain("does not support image input")
  })
})

// --- Tests for toModelMessages with document parts ---

describe("MessageV2.toModelMessages — document handling", () => {
  test("PDF file part preserved as file for pdf-capable model", async () => {
    const mid = "m-pdf"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          { ...basePart(mid, "p1"), type: "text", text: "read this" },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/pdf",
            filename: "report.pdf",
            url: "data:application/pdf;base64,QUJD",
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, pdfModel)
    expect(result).toHaveLength(1)
    const parts = result[0].content as any[]
    expect(parts).toHaveLength(2)
    expect(parts[0]).toStrictEqual({ type: "text", text: "read this" })
    expect(parts[1].type).toBe("file")
    expect(parts[1].mediaType).toBe("application/pdf")
    expect(parts[1].filename).toBe("report.pdf")
  })

  test("PDF file part preserved for text-only model (unsupportedParts handles downstream)", async () => {
    const mid = "m-pdf-text"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          { ...basePart(mid, "p1"), type: "text", text: "read this" },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/pdf",
            filename: "report.pdf",
            url: "data:application/pdf;base64,QUJD",
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, textModel)
    expect(result).toHaveLength(1)
    const parts = result[0].content as any[]
    // toModelMessages preserves the file part; unsupportedParts in ProviderTransform.message replaces it
    expect(parts.some((p: any) => p.type === "file" && p.mediaType === "application/pdf")).toBe(true)
  })

  test("extracted document text arrives as synthetic text part", async () => {
    const mid = "m-doc-text"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "text",
            text: 'Called the Read tool with the following input: {"filePath":"report.pdf"}',
            synthetic: true,
          },
          {
            ...basePart(mid, "p2"),
            type: "text",
            text: "Document: report.pdf (3 pages)\n\nExtracted text content here...",
            synthetic: true,
          },
          {
            ...basePart(mid, "p3"),
            type: "file",
            mime: "application/pdf",
            filename: "report.pdf",
            url: "data:application/pdf;base64,QUJD",
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, textModel)
    expect(result).toHaveLength(1)
    const parts = result[0].content as any[]
    // Should contain the synthetic text parts AND the file part
    const texts = parts.filter((p: any) => p.type === "text")
    expect(texts.length).toBeGreaterThanOrEqual(2)
    expect(texts.some((t: any) => t.text.includes("Document: report.pdf"))).toBe(true)
    expect(texts.some((t: any) => t.text.includes("Extracted text content"))).toBe(true)
    expect(parts.some((p: any) => p.type === "file" && p.mediaType === "application/pdf")).toBe(true)
  })

  test("extracted document text arrives without resending ignored PDF binary", async () => {
    const mid = "m-doc-ignored"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "text",
            text: "Document: report.pdf\n\nExtracted text content here...",
            synthetic: true,
          },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/pdf",
            filename: "report.pdf",
            url: "data:application/pdf;base64,QUJD",
            ignored: true,
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, textModel)
    expect(result).toHaveLength(1)
    const parts = result[0].content as any[]
    expect(parts.some((p: any) => p.type === "text" && p.text.includes("Extracted text content"))).toBe(true)
    expect(parts.some((p: any) => p.type === "file")).toBe(false)
  })

  test("extracted spreadsheet text arrives without resending ignored XLSX binary", async () => {
    const mid = "m-xlsx-text"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          {
            ...basePart(mid, "p1"),
            type: "text",
            text: "Document: budget.xlsx (2 pages)\n\nItem,Cost\nRent,1000",
            synthetic: true,
          },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename: "budget.xlsx",
            url: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,QUJD",
            ignored: true,
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, textModel)
    expect(result).toHaveLength(1)
    const parts = result[0].content as any[]
    expect(parts).toEqual([{ type: "text", text: "Document: budget.xlsx (2 pages)\n\nItem,Cost\nRent,1000" }])
  })

  test("text/plain and directory file parts are excluded from model messages", async () => {
    const mid = "m-excluded"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          { ...basePart(mid, "p1"), type: "text", text: "hi" },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "text/plain",
            filename: "readme.txt",
            url: "file:///tmp/readme.txt",
          },
          {
            ...basePart(mid, "p3"),
            type: "file",
            mime: "application/x-directory",
            filename: "src",
            url: "file:///tmp/src",
          },
        ] as MessageV2.Part[],
      },
    ]
    const result = await MessageV2.toModelMessages(input, textModel)
    const parts = result[0].content as any[]
    // text/plain and directory are converted to nothing (excluded)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toStrictEqual({ type: "text", text: "hi" })
  })
})

// --- Regression: the critical data: URL fallthrough bug ---

describe("Regression: data: URL file parts must not be silently dropped", () => {
  test("PDF file part in model messages is not lost (simulates the fixed data: case)", async () => {
    // This test verifies the fix: previously the data: case in prompt.ts
    // used `break` which silently dropped the file part. After the fix,
    // the file part is returned. Here we verify the downstream behavior.
    const mid = "m-regression"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          { ...basePart(mid, "p1"), type: "text", text: "please describe this pdf" },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/pdf",
            filename: "guide.pdf",
            url: "data:application/pdf;base64,JVBERi0xLjQ=",
          },
        ] as MessageV2.Part[],
      },
    ]

    // For text-only model: file part should still be present in model messages
    const result = await MessageV2.toModelMessages(input, textModel)
    const parts = result[0].content as any[]
    expect(parts.length).toBe(2)
    expect(parts[0].type).toBe("text")
    expect(parts[0].text).toBe("please describe this pdf")
    // The file part should be present (not dropped)
    expect(parts[1].type).toBe("file")
    expect(parts[1].mediaType).toBe("application/pdf")

    // After ProviderTransform.message, unsupportedParts replaces it with an error
    const transformed = ProviderTransform.message(result, textModel, {})
    const tparts = transformed[0].content as any[]
    expect(tparts[1].type).toBe("text")
    expect(tparts[1].text).toContain("ERROR")
    expect(tparts[1].text).toContain("guide.pdf")
  })

  test("PDF file part with native support is not dropped", async () => {
    const mid = "m-native"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(mid),
        parts: [
          { ...basePart(mid, "p1"), type: "text", text: "describe" },
          {
            ...basePart(mid, "p2"),
            type: "file",
            mime: "application/pdf",
            filename: "native.pdf",
            url: "data:application/pdf;base64,JVBERi0=",
          },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, pdfModel)
    const parts = result[0].content as any[]
    expect(parts[1].type).toBe("file")

    // After transform, file part should still be present for pdf-capable model
    const transformed = ProviderTransform.message(result, pdfModel, {})
    const tparts = transformed[0].content as any[]
    expect(tparts[1].type).toBe("file")
    expect(tparts[1].mediaType).toBe("application/pdf")
  })
})

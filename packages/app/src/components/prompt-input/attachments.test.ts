import { describe, expect, test } from "bun:test"
import { attachmentMime } from "./files"
import { pasteMode } from "./paste"

describe("attachmentMime", () => {
  test("keeps PDFs when the browser reports the mime", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" })
    expect(await attachmentMime(file)).toBe("application/pdf")
  })

  test("normalizes structured text types to text/plain", async () => {
    const file = new File(['{"ok":true}\n'], "data.json", { type: "application/json" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("accepts text files even with a misleading browser mime", async () => {
    const file = new File(["export const x = 1\n"], "main.ts", { type: "video/mp2t" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("accepts DOCX with correct mime", async () => {
    const file = new File([Uint8Array.of(0x50, 0x4b)], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    expect(await attachmentMime(file)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  })

  test("accepts XLSX with correct mime", async () => {
    const file = new File([Uint8Array.of(0x50, 0x4b)], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    expect(await attachmentMime(file)).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  test("accepts PPTX with correct mime", async () => {
    const file = new File([Uint8Array.of(0x50, 0x4b)], "slides.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    })
    expect(await attachmentMime(file)).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation")
  })

  test("accepts DOCX by extension when mime is octet-stream", async () => {
    const file = new File([Uint8Array.of(0x50, 0x4b)], "report.docx", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  })

  test("accepts audio uploads", async () => {
    const file = new File([Uint8Array.of(1, 2, 3)], "voice.m4a", { type: "audio/x-m4a" })
    expect(await attachmentMime(file)).toBe("audio/mp4")
  })

  test("accepts video uploads", async () => {
    const file = new File([Uint8Array.of(1, 2, 3)], "clip.mov", { type: "video/quicktime" })
    expect(await attachmentMime(file)).toBe("video/quicktime")
  })

  test("rejects binary files", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBeUndefined()
  })
})

describe("pasteMode", () => {
  test("uses native paste for short single-line text", () => {
    expect(pasteMode("hello world")).toBe("native")
  })

  test("uses manual paste for multiline text", () => {
    expect(
      pasteMode(`{
  "ok": true
}`),
    ).toBe("manual")
    expect(pasteMode("a\r\nb")).toBe("manual")
  })

  test("uses manual paste for large text", () => {
    expect(pasteMode("x".repeat(8000))).toBe("manual")
  })
})

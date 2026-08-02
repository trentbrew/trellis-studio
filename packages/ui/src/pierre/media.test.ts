import { describe, expect, test } from "bun:test"
import { dataUrlFromMediaValue, mediaKindFromPath, normalizeMimeType } from "./media"

describe("media", () => {
  test("detects common audio files", () => {
    for (const file of ["track.mp3", "track.wav", "track.oga", "track.weba", "track.wma", "track.aiff", "track.midi"]) {
      expect(mediaKindFromPath(file)).toBe("audio")
    }
  })

  test("normalizes audio mime aliases", () => {
    expect(normalizeMimeType("audio/x-aac")).toBe("audio/aac")
    expect(normalizeMimeType("audio/x-m4a")).toBe("audio/mp4")
  })

  test("builds audio data urls from file content", () => {
    expect(dataUrlFromMediaValue({ content: "YWJj", encoding: "base64", mimeType: "audio/mpeg" }, "audio")).toBe(
      "data:audio/mpeg;base64,YWJj",
    )
  })
})

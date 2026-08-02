import { describe, expect, test } from "bun:test"
import { formatMediaTime, trackLabel, type MediaTrack } from "./media-player"

describe("formatMediaTime", () => {
  test("formats minutes and seconds", () => {
    expect(formatMediaTime(0)).toBe("0:00")
    expect(formatMediaTime(5)).toBe("0:05")
    expect(formatMediaTime(65)).toBe("1:05")
    expect(formatMediaTime(605)).toBe("10:05")
  })

  test("handles invalid values", () => {
    expect(formatMediaTime(Number.NaN)).toBe("0:00")
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe("0:00")
  })
})

describe("trackLabel", () => {
  test("prefers title", () => {
    const track: MediaTrack = { src: "/a.mp3", title: "Theme", path: ".trellis/media/theme.mp3" }
    expect(trackLabel(track)).toBe("Theme")
  })

  test("falls back to filename", () => {
    const track: MediaTrack = { src: "/a.mp3", title: "  ", path: ".trellis/media/theme.mp3" }
    expect(trackLabel(track)).toBe("theme.mp3")
  })

  test("returns undefined without track", () => {
    expect(trackLabel(undefined)).toBeUndefined()
  })
})

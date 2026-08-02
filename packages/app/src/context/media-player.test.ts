import { describe, expect, test } from "bun:test"
import { formatMediaTime, trackLabel } from "@/lib/media-player"

describe("media player context helpers", () => {
  test("formatMediaTime supports seek UI labels", () => {
    expect(formatMediaTime(125)).toBe("2:05")
  })

  test("trackLabel supports now-playing badge", () => {
    expect(
      trackLabel({
        src: "http://localhost/file/raw?path=theme.mp3",
        title: "Main Theme",
        path: ".trellis/media/theme.mp3",
      }),
    ).toBe("Main Theme")
  })
})

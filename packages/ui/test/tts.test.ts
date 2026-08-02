import { describe, expect, test } from "bun:test"
import { onTtsState, playTts, stopTts, ttsState } from "../src/utils/tts"

describe("tts player", () => {
  test("stopTts clears state", () => {
    stopTts()
    expect(ttsState()).toBe("idle")
  })

  test("playTts rejects empty text", async () => {
    stopTts()
    const ok = await playTts("http://localhost:4096", "   ")
    expect(ok).toBe(false)
    expect(ttsState()).toBe("idle")
  })

  test("onTtsState notifies subscribers", () => {
    stopTts()
    let seen = ttsState()
    const off = onTtsState((next) => {
      seen = next
    })
    stopTts()
    expect(seen).toBe("idle")
    off()
  })
})

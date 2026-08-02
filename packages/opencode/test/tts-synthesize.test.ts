import { describe, expect, test } from "bun:test"
import {
  chunkText,
  pcmToWav,
  prepareSpeechText,
  stripMarkdown,
} from "../src/tts/synthesize"

describe("tts synthesize helpers", () => {
  test("stripMarkdown removes code and links", () => {
    const text = "# Title\n\nRead [`foo.ts`](./foo.ts) and:\n\n```ts\nconst x = 1\n```\n\nDone."
    expect(stripMarkdown(text)).toBe("Title Read foo.ts and: Done.")
  })

  test("prepareSpeechText caps long input", () => {
    const text = "a".repeat(10_000)
    expect(prepareSpeechText(text).length).toBe(8_000)
  })

  test("chunkText splits long text", () => {
    const text = "word ".repeat(500)
    const chunks = chunkText(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(" ").length).toBeGreaterThan(1000)
  })

  test("pcmToWav wraps PCM with a RIFF header", () => {
    const pcm = new Uint8Array([0, 1, 2, 3])
    const wav = pcmToWav(pcm)
    expect(wav.byteLength).toBe(48)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF")
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE")
  })
})

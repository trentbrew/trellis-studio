import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import path from "path"
import { saveSpeechAsset } from "../src/tts/save-asset"
import { tmpdir } from "./fixture/fixture"

describe("tts save asset", () => {
  test("writes speech audio under .trellis/media and dedupes by text hash", async () => {
    await using tmp = await tmpdir()
    const body = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const input = {
      result: { body, mime: "audio/mpeg" as const, provider: "edge" as const },
      text: "Hello from the read-aloud button.",
    }

    const first = await saveSpeechAsset(input, tmp.path)
    expect(first?.path.startsWith(".trellis/media/speech-")).toBe(true)
    expect(first?.category).toBe("audio")
    expect(first?.kind).toBe("speech")
    expect(first?.audioContentType).toBe("speech")
    expect(first?.transcript).toBe("Hello from the read-aloud button.")
    expect(existsSync(path.join(tmp.path, first!.path))).toBe(true)

    const cache = JSON.parse(await readFile(path.join(tmp.path, ".trellis/media/descriptions.json"), "utf8")) as Record<
      string,
      { transcript?: string }
    >
    expect(cache[first!.path]?.transcript).toBe(input.text)

    const second = await saveSpeechAsset(input, tmp.path)
    expect(second?.path).toBe(first?.path)
    expect(second?.size).toBe(first?.size)
  })
})

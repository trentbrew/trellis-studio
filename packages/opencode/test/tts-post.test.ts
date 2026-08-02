import { describe, expect, test } from "bun:test"
import { TtsRoutes } from "../src/server/routes/tts"

describe("tts speak", () => {
  test("POST handles long text that exceeds GET URL limits", async () => {
    const prev = process.env.TTS_PROVIDER
    process.env.TTS_PROVIDER = "edge"
    try {
      const app = TtsRoutes()
      const text = "hello " + "world ".repeat(5000)
      const res = await app.request("/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      expect(res.status).toBe(200)
      const type = res.headers.get("content-type")
      expect(type === "audio/mpeg" || type === "audio/wav").toBe(true)
      const buf = await res.arrayBuffer()
      expect(buf.byteLength).toBeGreaterThan(1000)
    } finally {
      if (prev === undefined) delete process.env.TTS_PROVIDER
      else process.env.TTS_PROVIDER = prev
    }
  }, 120_000)
})

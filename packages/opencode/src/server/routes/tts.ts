import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { lazy } from "../../util/lazy"
import { Instance } from "../../project/instance"
import { Trellis } from "../../trellis"
import { saveSpeechAsset } from "../../tts/save-asset"
import { synthesizeSpeech } from "../../tts/synthesize"
import { Log } from "../../util/log"
import { errors } from "../error"

const log = Log.create({ service: "tts" })

const SpeakInput = z.object({
  text: z.string().trim().min(1),
  voice: z.string().trim().optional(),
  rate: z.string().optional(),
  pitch: z.string().optional(),
})

const audio = (
  body: Uint8Array,
  mime: "audio/mpeg" | "audio/wav",
  provider: "gemini" | "edge",
  assetPath?: string,
) =>
  new Response(body as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
      "Content-Length": String(body.byteLength),
      "X-TTS-Provider": provider,
      ...(assetPath ? { "X-TTS-Asset-Path": assetPath } : {}),
    },
  })

async function speak(input: z.infer<typeof SpeakInput>) {
  const timer = log.time("speak request")
  try {
    const result = await synthesizeSpeech(input)
    timer.stop()
    log.info("speak request complete", {
      provider: result.provider,
      mime: result.mime,
      bytes: result.body.byteLength,
    })
    await Trellis.init(Instance.directory).catch(() => undefined)
    const saved = await saveSpeechAsset({ result, text: input.text, voice: input.voice }).catch((err) => {
      log.warn("speech asset save failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      return undefined
    })
    if (saved) {
      log.debug("speech asset saved", { path: saved.path, size: saved.size })
    }
    return audio(result.body, result.mime, result.provider, saved?.path)
  } catch (err) {
    timer.stop()
    const message = err instanceof Error ? err.message : "Speech synthesis failed"
    log.error("speak request failed", { error: message })
    throw err
  }
}

export const TtsRoutes = lazy(() =>
  new Hono()
    .post(
      "/speak",
      describeRoute({
        summary: "Synthesize speech",
        description:
          "Returns audio synthesized from the given text. Uses Gemini TTS when a Gemini API key is configured, otherwise Microsoft Edge Read Aloud.",
        operationId: "tts.speak",
        responses: {
          200: { description: "Audio stream (audio/mpeg or audio/wav)" },
          ...errors(400),
        },
      }),
      validator("json", SpeakInput),
      async (c) => {
        const input = c.req.valid("json")
        try {
          return await speak(input)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Speech synthesis failed"
          return c.json({ error: message }, 503)
        }
      },
    )
    .get(
      "/speak",
      describeRoute({
        summary: "Synthesize speech (query)",
        description:
          "Returns audio synthesized from the given text. Prefer POST for long text that exceeds URL limits.",
        operationId: "tts.speak.query",
        responses: {
          200: { description: "Audio stream (audio/mpeg or audio/wav)" },
          ...errors(400),
        },
      }),
      async (c) => {
        const text = c.req.query("text")?.trim()
        if (!text) return c.json({ error: "Missing text" }, 400 as any)
        const parsed = SpeakInput.safeParse({
          text,
          voice: c.req.query("voice")?.trim(),
          rate: c.req.query("rate"),
          pitch: c.req.query("pitch"),
        })
        if (!parsed.success) return c.json({ error: "Invalid input" }, 400 as any)
        try {
          return await speak(parsed.data)
        } catch (err) {
          const message = err instanceof Error ? err.message : "Speech synthesis failed"
          return c.json({ error: message }, 503)
        }
      },
    )
    .get(
      "/voices",
      describeRoute({
        summary: "List available voices",
        description: "Returns the list of neural voices exposed by the Edge Read Aloud endpoint.",
        operationId: "tts.voices",
        responses: { 200: { description: "Voice list" } },
      }),
      async (c) => {
        const { MsEdgeTTS } = await import("msedge-tts")
        const tts = new MsEdgeTTS()
        const voices = await tts.getVoices()
        return c.json(voices)
      },
    ),
)

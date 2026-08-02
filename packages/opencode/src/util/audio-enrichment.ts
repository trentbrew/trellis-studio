import { MediaAnalysis } from "@/util/media-analysis"
import { MusicAI } from "@/util/music-ai"
import { Log } from "@/util/log"
import path from "path"

export namespace AudioEnrichment {
  const log = Log.create({ service: "audio-enrichment" })

  export type ContentType = "speech" | "music" | "sfx" | "misc"

  export type Analysis = {
    contentType: ContentType
    confidence?: number
    bpm?: number
    key?: string
    genre?: string[]
    mood?: string[]
    subgenre?: string[]
    energy?: string
    instruments?: string[]
    timeSignature?: string
    musicalEra?: string
    voicePresence?: string
    emotionalProfile?: string
    enrichers?: Array<{ provider: string; model?: string; at: string }>
  }

  export type Result = {
    kind?: ContentType
    description?: string
    tone?: string
    tags?: string[]
    transcript?: string
    audioAnalysis?: Analysis
    analysisSource?: string
    analysisModel?: string
  }

  export async function enrich(input: {
    abs: string
    rel: string
    bytes: Buffer
    mime: string
  }): Promise<Result> {
    const filename = path.basename(input.rel)
    const classified = await classify(input.bytes, input.mime, filename)
    log.info("audio classified", { filename, contentType: classified.contentType, confidence: classified.confidence })

    const at = new Date().toISOString()
    if (classified.contentType === "speech") {
      const speech = await enrichSpeech(input.bytes, input.mime, filename)
      return {
        kind: "speech",
        ...speech,
        audioAnalysis: {
          contentType: "speech",
          confidence: classified.confidence,
          enrichers: [{ provider: speech.analysisSource ?? "gemini", model: speech.analysisModel, at }],
        },
      }
    }

    if (classified.contentType === "music") {
      const music = await enrichMusic(input.bytes, input.mime, filename)
      return {
        kind: "music",
        description: music.description,
        tone: music.tone,
        tags: music.tags,
        audioAnalysis: {
          contentType: "music",
          confidence: classified.confidence,
          bpm: music.analysis?.bpm,
          key: music.analysis?.key,
          genre: music.analysis?.genre,
          mood: music.analysis?.mood,
          subgenre: music.analysis?.subgenre,
          energy: music.analysis?.energy,
          instruments: music.analysis?.instruments,
          timeSignature: music.analysis?.timeSignature,
          musicalEra: music.analysis?.musicalEra,
          voicePresence: music.analysis?.voicePresence,
          emotionalProfile: music.analysis?.emotionalProfile,
          enrichers: music.enrichers,
        },
        analysisSource: music.analysisSource,
        analysisModel: music.analysisModel,
      }
    }

    if (classified.contentType === "sfx") {
      const sfx = await enrichSfx(input.bytes, input.mime, filename)
      return {
        kind: "sfx",
        ...sfx,
        audioAnalysis: {
          contentType: "sfx",
          confidence: classified.confidence,
          enrichers: [{ provider: sfx.analysisSource ?? "gemini", model: sfx.analysisModel, at }],
        },
      }
    }

    const misc = await enrichMisc(input.bytes, input.mime, filename)
    return {
      kind: "misc",
      ...misc,
      audioAnalysis: {
        contentType: "misc",
        confidence: classified.confidence,
        enrichers: [{ provider: misc.analysisSource ?? "gemini", model: misc.analysisModel, at }],
      },
    }
  }

  async function classify(bytes: Buffer, mime: string, filename: string) {
    const heuristic = classifyHeuristic(filename)
    if (heuristic) return heuristic

    const prompt = [
      "Classify this audio file for a design/CMS asset library.",
      `Filename: ${filename}.`,
      'Return only compact JSON with keys: "contentType", "confidence", "reasoning".',
      '"contentType" must be one of: "speech", "music", "sfx", "misc".',
      '"speech" = voice memos, podcasts, interviews, narration, meetings.',
      '"music" = songs, instrumentals, beats, scored tracks with musical structure.',
      '"sfx" = short sound effects, UI sounds, foley, alerts, one-shot noises.',
      '"misc" = ambient beds, mixed content, or unclear audio.',
      '"confidence" is a number from 0 to 1.',
    ].join(" ")

    const result = await MediaAnalysis.analyze({ bytes, mime, filename, prompt })
    const parsed = parseJson(result.text)
    const contentType = normalizeContentType(parsed?.contentType) ?? "misc"
    const confidence = parseConfidence(parsed?.confidence)
    return { contentType, confidence }
  }

  function classifyHeuristic(filename: string) {
    const name = filename.toLowerCase()
    if (/(voice[-_ ]?memo|recording|podcast|interview|meeting|narration|yapping|voicemail)/.test(name)) {
      return { contentType: "speech" as const, confidence: 0.85 }
    }
    if (/(sfx|sound[-_ ]?effect|foley|ui[-_ ]?sound|alert|beep|click|whoosh)/.test(name)) {
      return { contentType: "sfx" as const, confidence: 0.8 }
    }
    if (/(beat|song|track|instrumental|music|mix|demo|master|stem)/.test(name)) {
      return { contentType: "music" as const, confidence: 0.75 }
    }
    return undefined
  }

  async function enrichSpeech(bytes: Buffer, mime: string, filename: string) {
    const prompt = [
      "Transcribe this spoken audio for a CMS asset library.",
      `Filename: ${filename}.`,
      'Return only compact JSON with keys: "description", "tone", "tags", "transcript".',
      '"transcript" must be the full verbatim spoken content, preserving meaning and paragraph breaks.',
      '"description" should be 1-3 sentences summarizing what is said.',
      '"tone" should describe speaking style and mood.',
      '"tags" should be 4-10 lowercase semantic tags about topics and format.',
    ].join(" ")

    const result = await MediaAnalysis.analyze({ bytes, mime, filename, prompt })
    const parsed = parseJson(result.text)
    return {
      description: clean(parsed?.description) ?? summarize(result.text),
      tone: clean(parsed?.tone),
      tags: cleanList(parsed?.tags, 12),
      transcript: clean(parsed?.transcript) ?? (parsed ? undefined : result.text.trim()),
      analysisSource: result.source,
      analysisModel: result.model,
    }
  }

  async function enrichMusic(bytes: Buffer, mime: string, filename: string) {
    const at = new Date().toISOString()
    const enrichers: Analysis["enrichers"] = []
    let musicMeta: MusicAI.MusicMetadata | undefined
    try {
      musicMeta = await MusicAI.analyze(bytes, mime, filename)
      if (musicMeta) enrichers.push({ provider: "music.ai", at })
    } catch (err) {
      log.warn("music.ai enrichment failed", { err })
    }

    const prompt = [
      "Describe this music track for a design/CMS asset library.",
      `Filename: ${filename}.`,
      musicMeta
        ? `Known analysis: BPM=${musicMeta.bpm ?? "unknown"}, key=${musicMeta.key ?? "unknown"}, genre=${musicMeta.genre?.join(", ") ?? "unknown"}.`
        : "",
      'Return only compact JSON with keys: "description", "tone", "tags".',
      "Do not include a transcript.",
      '"description" should be 1-3 sentences about style, mood, and use cases.',
      '"tone" should describe sonic mood and energy.',
      '"tags" should include genre, instrumentation, and mood tags.',
    ]
      .filter(Boolean)
      .join(" ")

    const result = await MediaAnalysis.analyze({ bytes, mime, filename, prompt })
    enrichers.push({ provider: result.source, model: result.model, at })
    const parsed = parseJson(result.text)
    const tags = mergeTags(cleanList(parsed?.tags, 12), musicMeta?.genre, musicMeta?.mood, musicMeta?.instruments)

    return {
      description: clean(parsed?.description) ?? summarize(result.text),
      tone: clean(parsed?.tone) ?? musicMeta?.energy,
      tags,
      analysis: musicMeta,
      enrichers,
      analysisSource: musicMeta ? "music.ai+gemini" : result.source,
      analysisModel: result.model,
    }
  }

  async function enrichSfx(bytes: Buffer, mime: string, filename: string) {
    const prompt = [
      "Describe this sound effect for a design/CMS asset library.",
      `Filename: ${filename}.`,
      'Return only compact JSON with keys: "description", "tone", "tags".',
      "Do not include a transcript.",
      '"description" should describe the sound, duration feel, and suitable use cases.',
      '"tone" should describe texture and intensity.',
      '"tags" should be lowercase semantic tags for search.',
    ].join(" ")

    const result = await MediaAnalysis.analyze({ bytes, mime, filename, prompt })
    const parsed = parseJson(result.text)
    return {
      description: clean(parsed?.description) ?? summarize(result.text),
      tone: clean(parsed?.tone),
      tags: cleanList(parsed?.tags, 12),
      analysisSource: result.source,
      analysisModel: result.model,
    }
  }

  async function enrichMisc(bytes: Buffer, mime: string, filename: string) {
    const prompt = [
      "Describe this audio asset for a design/CMS asset library.",
      `Filename: ${filename}.`,
      'Return only compact JSON with keys: "description", "tone", "tags".',
      "Only include transcript if there is clearly important spoken content.",
      '"description" should be 1-3 concise sentences.',
      '"tone" should describe mood or sonic character.',
      '"tags" should be 4-10 lowercase semantic tags.',
    ].join(" ")

    const result = await MediaAnalysis.analyze({ bytes, mime, filename, prompt })
    const parsed = parseJson(result.text)
    return {
      description: clean(parsed?.description) ?? summarize(result.text),
      tone: clean(parsed?.tone),
      tags: cleanList(parsed?.tags, 12),
      transcript: clean(parsed?.transcript),
      analysisSource: result.source,
      analysisModel: result.model,
    }
  }

  function parseJson(text: string) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    const raw = fenced ?? text
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) return undefined
    try {
      return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  function normalizeContentType(value: unknown): ContentType | undefined {
    if (typeof value !== "string") return undefined
    const next = value.trim().toLowerCase()
    if (next === "speech" || next === "voice" || next === "voice_memo" || next === "voice-memo") return "speech"
    if (next === "music") return "music"
    if (next === "sfx" || next === "sound_effect" || next === "sound-effect") return "sfx"
    if (next === "misc" || next === "ambient" || next === "other") return "misc"
    return undefined
  }

  function parseConfidence(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(1, value))
    if (typeof value === "string") {
      const next = Number(value)
      if (Number.isFinite(next)) return Math.max(0, Math.min(1, next))
    }
    return undefined
  }

  function clean(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined
  }

  function cleanList(value: unknown, limit: number) {
    const input = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",").map((item) => item.trim())
        : []
    return input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit)
  }

  function mergeTags(...groups: Array<string[] | undefined>) {
    const seen = new Set<string>()
    const out: string[] = []
    for (const group of groups) {
      for (const tag of group ?? []) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(tag)
      }
    }
    return out.length ? out.slice(0, 12) : undefined
  }

  function summarize(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return undefined
    return trimmed.length > 400 ? `${trimmed.slice(0, 397)}...` : trimmed
  }
}

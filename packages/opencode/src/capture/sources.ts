import { Config } from "../config/config"
import * as SourceEntity from "../file/source-entity"
import { urls } from "./prompt"
import { Log } from "../util/log"

const log = Log.create({ service: "capture.sources" })

const RESEARCH_TOOLS = new Set(["websearch", "webfetch", "deep_research", "codesearch"])

export type SourceCapture = {
  url: string
  title?: string
  snippet?: string
}

export function collect(input: {
  tool: string
  args?: Record<string, unknown>
  result?: { output?: string; metadata?: Record<string, unknown>; title?: string }
}): SourceCapture[] {
  const out: SourceCapture[] = []
  const seen = new Set<string>()

  const push = (item: SourceCapture) => {
    try {
      const url = SourceEntity.normalizeUrl(item.url)
      if (seen.has(url)) return
      seen.add(url)
      out.push({ ...item, url })
    } catch {
      // skip invalid URLs
    }
  }

  const metadata = input.result?.metadata
  const listed = metadata?.sources
  if (Array.isArray(listed)) {
    for (const entry of listed) {
      if (typeof entry === "string") push({ url: entry })
      else if (entry && typeof entry === "object" && typeof (entry as { url?: string }).url === "string") {
        const row = entry as { url: string; title?: string; snippet?: string }
        push({ url: row.url, title: row.title, snippet: row.snippet })
      }
    }
  }

  if (input.tool === "webfetch" && typeof input.args?.url === "string") {
    const title =
      typeof input.result?.title === "string"
        ? input.result.title.replace(/\s*\([^)]*\)\s*$/, "").trim()
        : undefined
    push({ url: input.args.url, title: title || undefined })
  }

  if (input.result?.output) {
    for (const url of urls(input.result.output)) push({ url })
  }

  return out
}

export async function fromToolResult(input: {
  tool: string
  sessionID: string
  messageID: string
  callID?: string
  args?: Record<string, unknown>
  result?: { output?: string; metadata?: Record<string, unknown>; title?: string }
  dir: string
  agent?: string
}) {
  if (!RESEARCH_TOOLS.has(input.tool)) return []

  const cfg = await Config.get()
  if (cfg.capture?.researchSources === false) return []

  const items = collect(input)
  if (!items.length) return []

  const saved: SourceEntity.SourceRecord[] = []
  for (const item of items) {
    try {
      saved.push(
        await SourceEntity.upsert({
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          tool: input.tool,
          sessionID: input.sessionID,
          messageID: input.messageID,
          callID: input.callID,
        }, input.dir),
      )
    } catch (err) {
      log.warn("source capture failed", { url: item.url, error: String(err) })
    }
  }
  return saved
}

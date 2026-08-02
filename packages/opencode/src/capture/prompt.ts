import { Config } from "../config/config"
import * as LinkAsset from "../file/link-asset"
import { Memory } from "../trellis/memory"
import { Log } from "../util/log"

const log = Log.create({ service: "capture.prompt" })

const urlPattern = /https?:\/\/[^\s)\]>"]+/g

const rememberPattern =
  /(?:^|[\n\r]|\.\s*)(?:please\s+)?(?:remember|don't forget|do not forget|keep in mind|note that|for future reference)[:\s—-]+(.+?)(?:[\n\r]|$)/gi

const skipUrl = (raw: string) => {
  try {
    const url = new URL(raw)
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true
    if (url.protocol !== "http:" && url.protocol !== "https:") return true
    return false
  } catch {
    return true
  }
}

export function urls(text: string) {
  return (text.match(urlPattern) ?? [])
    .map((item) => item.replace(/[),.]+$/, ""))
    .filter((item, index, all) => all.indexOf(item) === index)
    .filter((item) => !skipUrl(item))
}

export function explicitMemory(text: string) {
  const out: Array<{ title: string; content: string }> = []
  for (const match of text.matchAll(rememberPattern)) {
    const content = match[1]?.trim()
    if (!content || content.length < 8) continue
    const title = content.split(/[.!?]/)[0]?.trim().slice(0, 80) || "User preference"
    out.push({ title, content })
  }
  return out
}

export async function fromMessage(input: {
  text: string
  sessionID: string
  dir: string
  captureLinks?: boolean
}) {
  const cfg = await Config.get()
  const capture = cfg.capture
  const links = input.captureLinks ?? capture?.links !== false

  if (links) {
    for (const href of urls(input.text)) {
      try {
        if (await LinkAsset.exists(href, input.dir)) continue
        await LinkAsset.create({ url: href }, input.dir)
      } catch (err) {
        log.warn("link capture failed", { url: href, error: String(err) })
      }
    }
  }

  if (capture?.explicitMemory !== false) {
    for (const item of explicitMemory(input.text)) {
      try {
        Memory.remember(
          {
            title: item.title,
            content: item.content,
            scope: "user",
            source: "prompt",
            sessionID: input.sessionID,
          },
          input.dir,
        )
      } catch (err) {
        log.warn("memory capture failed", { title: item.title, error: String(err) })
      }
    }
  }
}

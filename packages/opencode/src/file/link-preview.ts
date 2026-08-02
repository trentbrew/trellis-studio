export type LinkPreview = {
  url: string
  title?: string
  description?: string
  favicon?: string
  image?: string
}

const MAX_HTML = 512 * 1024
const TIMEOUT_MS = 12_000

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

function resolveUrl(base: string, href?: string) {
  if (!href?.trim()) return undefined
  try {
    return new URL(href.trim(), base).href
  } catch {
    return undefined
  }
}

function metaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }
  return undefined
}

function titleTag(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeEntities(match[1].trim()) : undefined
}

function linkHref(html: string, ...rels: string[]) {
  for (const rel of rels) {
    const pattern = new RegExp(
      `<link[^>]+rel=["'](?:[^"']*\\s+)?${rel}(?:\\s+[^"']*)?["'][^>]+href=["']([^"']+)["']`,
      "i",
    )
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
    const alt = new RegExp(
      `<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:[^"']*\\s+)?${rel}(?:\\s+[^"']*)?["']`,
      "i",
    )
    const altMatch = html.match(alt)
    if (altMatch?.[1]) return altMatch[1].trim()
  }
  return undefined
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function defaults(parsed: URL, preview: LinkPreview): LinkPreview {
  return {
    ...preview,
    favicon: preview.favicon ?? resolveUrl(parsed.href, "/favicon.ico"),
  }
}

export async function fetchLinkPreview(input: string): Promise<LinkPreview> {
  const parsed = new URL(input)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid url")
  }

  const preview: LinkPreview = { url: parsed.href }

  try {
    const res = await fetch(parsed.href, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: FETCH_HEADERS,
      redirect: "follow",
    })
    if (!res.ok) return defaults(parsed, preview)

    const type = res.headers.get("content-type") ?? ""
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return defaults(parsed, preview)
    }

    const html = (await res.text()).slice(0, MAX_HTML)
    preview.title =
      metaContent(html, "og:title") ?? metaContent(html, "twitter:title") ?? titleTag(html) ?? undefined
    preview.description =
      metaContent(html, "og:description") ?? metaContent(html, "description") ?? undefined
    preview.image = resolveUrl(
      parsed.href,
      metaContent(html, "og:image") ??
        metaContent(html, "twitter:image") ??
        metaContent(html, "twitter:image:src"),
    )
    preview.favicon = resolveUrl(
      parsed.href,
      linkHref(html, "apple-touch-icon", "icon", "shortcut icon") ?? "/favicon.ico",
    )
  } catch {
    // fall through to defaults
  }

  return defaults(parsed, preview)
}

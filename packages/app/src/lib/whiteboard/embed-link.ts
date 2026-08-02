/** Normalize iframe/embeddable links before Excalidraw renders them. */

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"])

const SPOTIFY_EMBED_TYPES = new Set([
  "track",
  "album",
  "playlist",
  "episode",
  "show",
  "artist",
  "audiobook",
])

export function spotifyEmbedUrl(raw: string): string | undefined {
  const link = raw.trim()
  if (!link) return undefined

  const uriMatch = link.match(/^spotify:([a-z]+):([a-zA-Z0-9]+)/i)
  if (uriMatch) {
    const type = uriMatch[1]?.toLowerCase()
    const id = uriMatch[2]
    if (type && id && SPOTIFY_EMBED_TYPES.has(type)) {
      return `https://open.spotify.com/embed/${type}/${id}`
    }
  }

  try {
    const url = new URL(link.includes("://") ? link : `https://${link}`)
    const host = url.hostname.replace(/^www\./, "")

    if (host === "embed.spotify.com") {
      const uri = url.searchParams.get("uri")
      return uri ? spotifyEmbedUrl(uri) : undefined
    }

    if (host !== "open.spotify.com") return undefined

    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length === 0) return undefined

    if (parts[0] === "embed" && parts.length >= 3) {
      const type = parts[1]?.toLowerCase()
      const id = parts[2]
      if (type && id && SPOTIFY_EMBED_TYPES.has(type)) return link
    }

    let index = 0
    if (parts[0]?.startsWith("intl-")) index = 1

    const type = parts[index]?.toLowerCase()
    const id = parts[index + 1]
    if (!type || !id || !SPOTIFY_EMBED_TYPES.has(type)) return undefined

    return `https://open.spotify.com/embed/${type}/${id}`
  } catch {
    return undefined
  }
}

export function youtubeVideoId(raw: string): string | undefined {
  const link = raw.trim()
  if (!link) return undefined
  try {
    const url = new URL(link.includes("://") ? link : `https://${link}`)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split(/[/?#]/)[0]
      return id || undefined
    }
    if (!YOUTUBE_HOSTS.has(host)) return undefined
    if (url.pathname === "/" || url.pathname === "") return undefined
    if (url.pathname.startsWith("/watch")) return url.searchParams.get("v") ?? undefined
    if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2]
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2]
    if (url.pathname.startsWith("/live/")) return url.pathname.split("/")[2]
    return undefined
  } catch {
    return undefined
  }
}

function vimeoVideoId(raw: string): string | undefined {
  const link = raw.trim()
  if (!link) return undefined
  try {
    const url = new URL(link.includes("://") ? link : `https://${link}`)
    const host = url.hostname.replace(/^www\./, "")
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return undefined
    const parts = url.pathname.split("/").filter(Boolean)
    const id = parts[parts.length - 1]
    return id && /^\d+$/.test(id) ? id : undefined
  } catch {
    return undefined
  }
}

/** Convert watch/share URLs into iframe-safe embed URLs. */
export function normalizeEmbeddableLink(raw: string): string {
  const link = raw.trim()
  if (!link) return link
  const yt = youtubeVideoId(link)
  if (yt) return `https://www.youtube.com/embed/${yt}?enablejsapi=1`
  const vimeo = vimeoVideoId(link)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}?api=1`
  const spotify = spotifyEmbedUrl(link)
  if (spotify) return spotify
  return link
}

export function isEmbeddableElement(el: Record<string, unknown>): boolean {
  return el.type === "embeddable" || el.type === "iframe"
}

export function embedLinkNeedsNormalize(link: string): boolean {
  const trimmed = link.trim()
  if (!trimmed) return false
  return normalizeEmbeddableLink(trimmed) !== trimmed
}

export function normalizeEmbeddableElements(
  elements: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  let changed = false
  const next = elements.map((el) => {
    if (!isEmbeddableElement(el)) return el
    const link = typeof el.link === "string" ? el.link : ""
    if (!link || !embedLinkNeedsNormalize(link)) return el
    changed = true
    return { ...el, link: normalizeEmbeddableLink(link) }
  })
  return changed ? next : (elements as Record<string, unknown>[])
}

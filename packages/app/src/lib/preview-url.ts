export const EVENT = "oc-preview-open"

export type PreviewDetail = {
  url: string
  name?: string
}

const proto = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const host = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|[^/\s]+\.local)(?::\d+)?(?:[/?#].*)?$/i
const pair =
  /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*|\[[^\]\s]+]):\d{1,5}(?:[/?#].*)?$/i
const site = /^www\.[^\s/]+(?:[/?#].*)?$/i

export const clean = (value: string) => {
  const next = value.trim()
  if (!next) return ""
  if (next.startsWith("//")) return `https:${next}`
  if (host.test(next) || pair.test(next)) return `http://${next}`
  if (proto.test(next)) return next
  return `https://${next}`
}

export const web = (value: string) => {
  const next = value.trim()
  return /^https?:\/\//i.test(next) || next.startsWith("//") || host.test(next) || pair.test(next) || site.test(next)
}

export const title = (value: string) => {
  const next = clean(value)
  if (!next) return "New Tab"
  try {
    const url = new URL(next)
    return url.hostname || url.href
  } catch {
    return next
  }
}

export const port = (value: string) => {
  try {
    const next = new URL(clean(value))
    const num = Number(next.port)
    return Number.isFinite(num) && num > 0 ? num : undefined
  } catch {
    return undefined
  }
}

export const local = (value: string) => {
  const href = clean(value)
  if (!URL.canParse(href)) return false
  const url = new URL(href)
  return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(url.hostname) || url.hostname.endsWith(".local")
}

export const same = (a: string, b: string) => {
  try {
    return new URL(clean(a)).origin === new URL(clean(b)).origin
  } catch {
    return false
  }
}

export const route = (value: string, base: string) => {
  try {
    const url = new URL(clean(value))
    const root = new URL(clean(base))
    if (url.origin !== root.origin) return ""
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return ""
  }
}

export const browse = (value: string, name?: string) => {
  if (!web(value) || typeof window === "undefined") return false
  const url = clean(value)
  window.dispatchEvent(new CustomEvent<PreviewDetail>(EVENT, { detail: { url, name } }))
  return true
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"])

/**
 * Map a `localhost:<port>` URL onto the sandbox's public host when the IDE is
 * served from a cloud sandbox.
 *
 * Cloud sandboxes serve Studio from `<studioPort>-<id>.<domain>` (e.g. e2b
 * `3333-abc123.e2b.app`). A dev server the agent starts on `localhost:<port>`
 * lives *inside* the sandbox — it is unreachable at `localhost` from the user's
 * browser, but exposed publicly at `<port>-<id>.<domain>`. Rewriting onto that
 * host makes previews load and yields a shareable public URL.
 *
 * Returns `undefined` when not in a cloud sandbox (host has no `<digits>-`
 * prefix) or the URL isn't local, so local/desktop runs keep using `localhost`.
 */
export const cloudLocalPreviewUrl = (
  value: string,
  loc: { hostname: string; protocol: string } | undefined = typeof location === "undefined" ? undefined : location,
): string | undefined => {
  if (!loc || !/^\d+-/.test(loc.hostname)) return undefined
  let url: URL
  try {
    url = new URL(clean(value))
  } catch {
    return undefined
  }
  if (!LOCAL_HOSTS.has(url.hostname) && !url.hostname.endsWith(".local")) return undefined
  const mappedPort = url.port || "80"
  const host = loc.hostname.replace(/^\d+-/, `${mappedPort}-`)
  return `${loc.protocol}//${host}${url.pathname}${url.search}${url.hash}`
}

export const frame = (value: string, api: string, dir: string) => {
  const href = clean(value)
  if (!href) return ""
  if (local(href)) return cloudLocalPreviewUrl(href) ?? href
  const root = api.replace(/\/$/, "")
  return `${root}/preview/browse?url=${encodeURIComponent(href)}&directory=${encodeURIComponent(dir)}`
}

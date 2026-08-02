export type LinkPreviewData = {
  url: string
  title?: string
  description?: string
  favicon?: string
  image?: string
}

const cache = new Map<string, LinkPreviewData>()
const inflight = new Map<string, Promise<LinkPreviewData | undefined>>()

export function faviconForUrl(url: string, size = 32) {
  try {
    const host = new URL(url).hostname
    if (!host) return undefined
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
  } catch {
    return undefined
  }
}

export function getCachedLinkPreview(url: string) {
  return cache.get(url)
}

export function seedLinkPreview(data: LinkPreviewData) {
  const existing = cache.get(data.url)
  cache.set(data.url, { ...existing, ...data })
}

export async function loadLinkPreview(
  fetcher: (path: string) => Promise<Response>,
  baseUrl: string,
  directory: string,
  url: string,
): Promise<LinkPreviewData | undefined> {
  const hit = cache.get(url)
  if (hit) return hit

  const pending = inflight.get(url)
  if (pending) return pending

  const task = (async () => {
    try {
      const params = new URLSearchParams({ url, directory })
      const res = await fetcher(`${baseUrl}/file/media/link/preview?${params}`)
      if (!res.ok) return undefined
      const data = (await res.json()) as LinkPreviewData
      cache.set(url, data)
      return data
    } catch {
      return undefined
    } finally {
      inflight.delete(url)
    }
  })()

  inflight.set(url, task)
  return task
}

export async function prefetchLinkPreviews(
  fetcher: (path: string) => Promise<Response>,
  baseUrl: string,
  directory: string,
  urls: string[],
) {
  const unique = [...new Set(urls.filter(Boolean))]
  await Promise.allSettled(unique.map((url) => loadLinkPreview(fetcher, baseUrl, directory, url)))
}

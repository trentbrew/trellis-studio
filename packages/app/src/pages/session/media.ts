function withDirectory(url: string, dir?: string) {
  if (!dir) return url
  try {
    const next = new URL(url)
    if (!next.searchParams.has("directory")) {
      next.searchParams.set("directory", dir)
    }
    return next.toString()
  } catch {
    return url
  }
}

export const media = (base: string, src: string, dir?: string) => {
  if (/^(?:https?|data|blob):/i.test(src)) return src

  const mediaPath = (() => {
    if (src.startsWith("/file/media/")) return src
    if (!/(^|[\\/])\.trellis[\\/]media[\\/]/.test(src)) return
    const file = src.split(/[\\/]/).pop()
    if (!file) return
    return `/file/media/${encodeURIComponent(file)}`
  })()

  if (mediaPath) {
    try {
      return withDirectory(new URL(mediaPath, base).toString(), dir)
    } catch {
      return mediaPath
    }
  }

  if (dir && !/^[/\\]/.test(src)) {
    try {
      return withDirectory(
        new URL(`/file/raw?path=${encodeURIComponent(src)}`, base).toString(),
        dir,
      )
    } catch {}
  }

  return src
}

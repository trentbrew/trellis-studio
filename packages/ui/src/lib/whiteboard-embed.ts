/** True when a markdown image/link href points at a Trellis `.whiteboard` file. */
export function isWhiteboardEmbedPath(href: string | null | undefined): boolean {
  if (!href) return false
  const path = href.split("#")[0]?.split("?")[0]?.trim() ?? ""
  return path.toLowerCase().endsWith(".whiteboard")
}

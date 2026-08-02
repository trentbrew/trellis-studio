import type { MountWhiteboardEmbedFn } from "@opencode-ai/ui/markdown"
import { mountWhiteboardMarkdownEmbed } from "./markdown-embed"

export function createWhiteboardEmbedMount(options: {
  fetchFile: (path: string) => Promise<string | undefined>
  onOpen?: (path: string) => void
}): MountWhiteboardEmbedFn {
  return (el, path, label) =>
    mountWhiteboardMarkdownEmbed(el, {
      path,
      label,
      fetchContent: () => options.fetchFile(path),
      onOpen: options.onOpen,
    })
}

import { Markdown, type MountWhiteboardEmbedFn } from "@opencode-ai/ui/markdown"
import { useData } from "@opencode-ai/ui/context"
import { ComponentProps, createMemo } from "solid-js"
import { useSDK } from "@/context/sdk"
import { createWhiteboardEmbedMount } from "@/lib/whiteboard/markdown-embed-mount"
import { dispatchProjectionFocus } from "@/lib/projection-focus"

export function AppMarkdown(
  props: ComponentProps<typeof Markdown> & {
    /** Resolve relative whiteboard/image paths against this markdown file. */
    basePath?: string
  },
) {
  const sdk = useSDK()
  const data = useData()

  const mountWhiteboardEmbed = createMemo<MountWhiteboardEmbedFn | undefined>(() => {
    const fetchFile = async (path: string) => {
      const resolved = resolvePath(props.basePath, path)
      if (!resolved) return undefined
      const result = await sdk.client.file.read({ path: resolved }).catch(() => undefined)
      const file = result?.data
      if (!file || file.type !== "text" || file.encoding === "base64") return undefined
      return file.content
    }

    return createWhiteboardEmbedMount({
      fetchFile,
      onOpen: (path) => {
        const resolved = resolvePath(props.basePath, path) ?? path
        props.onLinkClick?.(resolved, new MouseEvent("click"))
        dispatchProjectionFocus({ lens: "whiteboards", path: resolved })
      },
    })
  })

  return (
    <Markdown
      {...props}
      mountWhiteboardEmbed={mountWhiteboardEmbed()}
      fileFetch={
        props.fileFetch ??
        (async (href) => {
          const resolved = resolvePath(props.basePath, href)
          if (!resolved) return undefined
          const result = await sdk.client.file.read({ path: resolved }).catch(() => undefined)
          const file = result?.data
          if (!file || file.type !== "text" || file.encoding === "base64") return undefined
          return file.content
        })
      }
    />
  )
}

function resolvePath(base: string | undefined, href: string): string | undefined {
  const next = href.split("#")[0]?.split("?")[0]?.trim()
  if (!next) return
  if (/^(?:[a-z]+:|\/\/)/i.test(next)) return
  const full = next.replaceAll("\\", "/").replace(/\/+/g, "/")
  if (full.startsWith("/")) return full.replace(/^\/+/, "")
  if (!base) return full
  const out = base.replaceAll("\\", "/").replace(/\/+/g, "/").split("/").slice(0, -1)
  for (const item of full.split("/")) {
    if (!item || item === ".") continue
    if (item === "..") {
      out.pop()
      continue
    }
    out.push(item)
  }
  return out.join("/")
}

import { createMemo, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useSessionLayout } from "@/pages/session/session-layout"
import { useFileOptional } from "@/context/file"
import { getFilename } from "@opencode-ai/util/path"

export function ActiveFileSegment() {
  const { tabs } = useSessionLayout()
  const file = useFileOptional()

  const path = createMemo(() => {
    const active = tabs().active()
    if (!active) return undefined
    return file?.pathFromTab(active)
  })

  const name = createMemo(() => {
    const p = path()
    if (!p) return undefined
    return getFilename(p)
  })

  const size = createMemo(() => {
    const p = path()
    if (!p) return undefined
    const state = file?.get(p)
    const content = state?.content
    if (!content || content.type !== "text") return undefined
    const bytes = new Blob([content.content ?? ""]).size
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  })

  const ext = createMemo(() => {
    const n = name()
    if (!n) return ""
    const i = n.lastIndexOf(".")
    return i >= 0 ? n.slice(i + 1).toLowerCase() : ""
  })

  const icon = createMemo(() => {
    const e = ext()
    if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "rb", "java", "c", "cpp", "h"].includes(e)) return "file-code"
    if (["json", "yaml", "yml", "toml", "xml", "csv"].includes(e)) return "file-json"
    if (["md", "mdx", "txt", "rst"].includes(e)) return "file-text"
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(e)) return "image"
    return "file"
  })

  const dir = createMemo(() => {
    const p = path()
    if (!p) return ""
    const i = p.lastIndexOf("/")
    return i >= 0 ? p.slice(0, i + 1) : ""
  })

  const hasFile = createMemo(() => !!path())

  return (
    <Show when={hasFile()}>
      <div class="flex items-center gap-1.5 px-1.5 py-0.5 min-w-0 overflow-hidden" title={path()}>
        <Icon name={icon()} size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
        <span class="text-[11px] font-mono opacity-40">{dir()}</span>
        <span class="text-[11px] font-mono opacity-70 shrink-0">{name()}</span>
        <Show when={size()}>
          <span class="text-[10px] tabular-nums opacity-40 shrink-0">{size()}</span>
        </Show>
      </div>
    </Show>
  )
}

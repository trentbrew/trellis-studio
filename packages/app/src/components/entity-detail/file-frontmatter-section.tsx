import { createEffect, createMemo, on, Show } from "solid-js"
import { parse as parseFrontmatter } from "@opencode-ai/ui/frontmatter"
import { serializeFrontmatter } from "@/lib/tiptap/frontmatter-editor"
import { useFile } from "@/context/file"
import { FrontmatterPanel } from "@/pages/session/frontmatter-panel"
import { isMd } from "./helpers"

function splitFrontmatter(value: string): { meta: Record<string, unknown> | undefined; body: string } {
  const parsed = parseFrontmatter(value)
  if (!parsed) return { meta: undefined, body: value }
  return { meta: parsed.meta, body: parsed.body }
}

export function FileFrontmatterSection(props: { path: string }) {
  const file = useFile()
  const markdown = createMemo(() => isMd(props.path))

  createEffect(
    on(
      () => props.path,
      (path) => {
        if (!path || !isMd(path)) return
        void file.load(path).catch(() => undefined)
      },
    ),
  )

  const text = createMemo(() => file.text(props.path) ?? "")
  const split = createMemo(() => splitFrontmatter(text()))

  const onMetaChange = (next: Record<string, unknown>) => {
    const path = props.path
    const body = split().body
    const value = Object.keys(next).length > 0 ? serializeFrontmatter(next) + body : body
    file.setDraft(path, value)
    void file.save(path)
  }

  return (
    <Show when={markdown() && split().meta}>
      {(meta) => (
        <FrontmatterPanel meta={meta()} onChange={onMetaChange} variant="inline" defaultOpen={true} />
      )}
    </Show>
  )
}

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

const markdownPatterns = [
  /^#{1,6}\s+/m,
  /^>\s+/m,
  /^[-*+]\s+/m,
  /^\d+\.\s+/m,
  /^```/m,
  /\[.+\]\(.+\)/,
  /\*\*.+\*\*/,
  /__.+__/,
  /`[^`]+`/,
  /^\|.+\|/m,
]

function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false
  return markdownPatterns.some((pattern) => pattern.test(text))
}

export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste(view, event) {
            const clipboardData = event.clipboardData
            if (!clipboardData) return false

            const text = clipboardData.getData("text/plain")
            const html = clipboardData.getData("text/html")

            if (!text) return false

            const hasMarkdownSyntax = looksLikeMarkdown(text)

            if (!hasMarkdownSyntax && html) return false

            if (hasMarkdownSyntax) {
              event.preventDefault()

              const pos = view.state.selection.from

              editor
                .chain()
                .insertContentAt(pos, text, { parseOptions: { preserveWhitespace: true } })
                .focus()
                .run()

              return true
            }

            return false
          },
        },
      }),
    ]
  },
})

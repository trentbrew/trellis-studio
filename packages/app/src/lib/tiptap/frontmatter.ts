import { Node } from "@tiptap/core"
import { parse, renderHtml } from "@opencode-ai/ui/frontmatter"
import { createFrontmatterNodeView, type FrontmatterOptions } from "./frontmatter-editor"

export const Frontmatter = Node.create<FrontmatterOptions>({
  name: "frontmatter",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { getModels: undefined }
  },

  addAttributes() {
    return {
      raw: { default: "" },
      meta: { default: {} },
    }
  },

  parseHTML() {
    return [{ tag: 'details[data-component="frontmatter"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const html = renderHtml(HTMLAttributes.meta ?? {})
    const el = document.createElement("div")
    el.innerHTML = html
    return el.firstElementChild as HTMLElement
  },

  addNodeView() {
    return createFrontmatterNodeView(this.options)
  },

  markdownTokenName: "frontmatter" as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode("frontmatter", {
      raw: token.raw ?? "",
      meta: token.meta ?? {},
    })
  },

  renderMarkdown(node: any) {
    return node.attrs.raw ?? ""
  },
})

export function frontmatterPlugin() {
  return {
    extensions: [
      {
        name: "frontmatter",
        level: "block" as const,
        start(src: string) {
          return src.indexOf("---") === 0 ? 0 : undefined
        },
        tokenizer(src: string) {
          const result = parse(src)
          if (!result) return undefined
          return {
            type: "frontmatter",
            raw: src.slice(0, src.length - result.body.length),
            meta: result.meta,
          }
        },
        renderer(token: any) {
          return renderHtml(token.meta)
        },
      },
    ],
  }
}

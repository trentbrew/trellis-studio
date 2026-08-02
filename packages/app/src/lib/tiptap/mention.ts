import { Node, mergeAttributes } from "@tiptap/core"
import type { MarkdownToken, MarkdownParseHelpers } from "@tiptap/core"
import { entityColor, entityIcon, entityTypeFromId } from "@/lib/entity-theme"

export interface MentionOptions {
  onNavigate?: (attrs: { type: string; id: string }) => void
  onHover?: (attrs: { type: string; id: string }, rect: DOMRect) => void
  onHoverEnd?: () => void
}

function mentionIconSvg(type: string, id: string) {
  const resolved = type === "file" ? "file" : entityTypeFromId(id, "entity")
  const color = entityColor(resolved)
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${entityIcon(resolved)}</svg>`
}

export const Mention = Node.create<MentionOptions>({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      onNavigate: undefined,
      onHover: undefined,
      onHoverEnd: undefined,
    }
  },

  addAttributes() {
    return {
      type: {
        default: "file",
        parseHTML: (el) => el.getAttribute("data-mention-type") || "file",
        renderHTML: (attrs) => ({ "data-mention-type": attrs.type }),
      },
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mention-id") || "",
        renderHTML: (attrs) => ({ "data-mention-id": attrs.id }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mention-label") || el.textContent || "",
        renderHTML: (attrs) => ({ "data-mention-label": attrs.label }),
      },
    }
  },

  markdownTokenName: "mention" as any,

  markdownTokenizer: {
    name: "mention",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("[[")
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[([^\]]+)\]\]/)
      if (!match) return undefined
      const raw = match[0]
      const target = match[1]
      const hash = target.startsWith("#")
      const id = hash ? target.slice(1) : target
      const type = hash ? "entity" : "file"
      return { type: "mention", raw, id, mentionType: type }
    },
  } as any,

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const t = token as MarkdownToken & { id: string; mentionType: string }
    const id = t.id || ""
    const type = t.mentionType || "file"
    const label = type === "file" ? id.split("/").pop() || id : id
    return helpers.createNode("mention", { type, id, label })
  },

  renderMarkdown(node: any) {
    const type = node.attrs?.type || "file"
    const id = node.attrs?.id || ""
    if (type === "entity" || type === "symbol") return `[[#${id}]]`
    return `[[${id}]]`
  },

  parseHTML() {
    return [{ tag: "span[data-mention-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "mention-node", contenteditable: "false" })]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span")
      dom.className = "mention-node"
      dom.contentEditable = "false"
      dom.setAttribute("data-mention-type", node.attrs.type)
      dom.setAttribute("data-mention-id", node.attrs.id)

      const icon = document.createElement("span")
      icon.className = "mention-icon"
      icon.innerHTML = mentionIconSvg(node.attrs.type, node.attrs.id)
      dom.appendChild(icon)

      const label = document.createElement("span")
      label.className = "mention-label"
      label.textContent = node.attrs.label || node.attrs.id
      dom.appendChild(label)

      const opts = this.options
      let timer: ReturnType<typeof setTimeout> | undefined

      dom.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        opts.onNavigate?.({ type: node.attrs.type, id: node.attrs.id })
      })

      dom.addEventListener("mouseenter", () => {
        timer = setTimeout(() => {
          const rect = dom.getBoundingClientRect()
          opts.onHover?.({ type: node.attrs.type, id: node.attrs.id }, rect)
        }, 300)
      })

      dom.addEventListener("mouseleave", () => {
        if (timer) clearTimeout(timer)
        opts.onHoverEnd?.()
      })

      return { dom }
    }
  },

  addCommands() {
    return {
      insertMention:
        (attrs: { type: string; id: string; label: string }) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: "mention",
            attrs,
          })
        },
    } as any
  },
})

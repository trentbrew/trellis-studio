import { Node, mergeAttributes } from "@tiptap/core"
import { render as renderMermaid } from "@opencode-ai/ui/mermaid"
import { isDarkTheme } from "@opencode-ai/ui/theme"

const copyIcon = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M6.25 6.25V2.916H17.084V13.75H13.75M13.75 6.25V17.083H2.917V6.25H13.75Z"/></svg>`
const checkIcon = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="square"><path d="M5 11.966L8.378 14.753L15 5.834"/></svg>`
const eyeIcon = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M10 4.5C5.5 4.5 2.5 10 2.5 10s3 5.5 7.5 5.5 7.5-5.5 7.5-5.5-3-5.5-7.5-5.5z"/><circle cx="10" cy="10" r="2.5"/></svg>`
const codeViewIcon = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M6.5 6.5L2 10l4.5 3.5M13.5 6.5L18 10l-4.5 3.5M11.5 4.5l-3 11"/></svg>`

export const CodeBlockHighlight = Node.create({
  name: "codeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  markdownTokenName: "code" as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode(
      "codeBlock",
      { language: token.lang || null },
      token.text ? [helpers.createTextNode(token.text)] : [],
    )
  },

  renderMarkdown(node: any, helpers: any) {
    const lang = node.attrs?.language ?? ""
    const text = node.content?.map((c: any) => c.text ?? "").join("") ?? ""
    return "```" + lang + "\n" + text + "\n```\n"
  },

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (el) => {
          const code = el.querySelector("code")
          const cls = code?.getAttribute("class") ?? ""
          const match = cls.match(/language-(\S+)/)
          return match ? match[1] : null
        },
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [{ tag: "pre", preserveWhitespace: "full" }]
  },

  renderHTML({ HTMLAttributes }) {
    const lang = HTMLAttributes.language
    const attrs: Record<string, string> = {}
    if (lang) attrs.class = `language-${lang}`
    return ["pre", mergeAttributes(HTMLAttributes, { "data-component": "code-block" }), ["code", attrs, 0]]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div")
      dom.setAttribute("data-component", "code-block-wrapper")

      const header = document.createElement("div")
      header.setAttribute("data-component", "code-block-header")

      const label = document.createElement("span")
      label.setAttribute("data-component", "code-block-lang")
      label.textContent = node.attrs.language || "text"
      header.appendChild(label)

      const actions = document.createElement("div")
      actions.setAttribute("data-component", "code-block-actions")

      // Toggle button (mermaid only — inserted before copy)
      const toggleBtn = document.createElement("button")
      toggleBtn.type = "button"
      toggleBtn.setAttribute("data-component", "mermaid-toggle")
      toggleBtn.setAttribute("aria-label", "Toggle diagram")
      toggleBtn.style.display = "none"

      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-component", "code-block-copy")
      btn.setAttribute("aria-label", "Copy")
      btn.innerHTML = copyIcon
      btn.addEventListener("click", () => {
        const text = contentDOM.textContent ?? ""
        navigator.clipboard.writeText(text).then(() => {
          btn.innerHTML = checkIcon
          btn.setAttribute("data-copied", "true")
          setTimeout(() => {
            btn.innerHTML = copyIcon
            btn.removeAttribute("data-copied")
          }, 2000)
        })
      })

      actions.appendChild(toggleBtn)
      actions.appendChild(btn)
      header.appendChild(actions)
      dom.appendChild(header)

      const pre = document.createElement("pre")
      pre.setAttribute("data-component", "code-block")
      const contentDOM = document.createElement("code")
      if (node.attrs.language) contentDOM.className = `language-${node.attrs.language}`
      contentDOM.style.whiteSpace = "pre"
      pre.appendChild(contentDOM)
      dom.appendChild(pre)

      const preview = document.createElement("div")
      preview.setAttribute("data-component", "mermaid-diagram")
      preview.style.display = "none"
      dom.appendChild(preview)

      // Toggle state: true = showing diagram, false = showing code
      let showDiagram = true
      let rendered = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let lastSrc = ""

      const applyView = () => {
        if (!rendered) return
        pre.style.display = showDiagram ? "none" : ""
        preview.style.display = showDiagram ? "" : "none"
        toggleBtn.innerHTML = showDiagram ? codeViewIcon : eyeIcon
        toggleBtn.setAttribute("aria-label", showDiagram ? "Show code" : "Show diagram")
        toggleBtn.setAttribute("data-active", showDiagram ? "diagram" : "code")
      }

      toggleBtn.addEventListener("click", () => {
        showDiagram = !showDiagram
        applyView()
      })

      const showCode = () => {
        preview.style.display = "none"
        toggleBtn.style.display = "none"
        pre.style.display = ""
      }

      const refreshMermaid = () => {
        if (node.attrs.language !== "mermaid") return showCode()
        // Use PM model text — always available, no DOM timing dependency
        const src = node.textContent.trim()
        if (!src) return showCode()
        // Skip if already rendered this exact content
        if (src === lastSrc && rendered) return
        lastSrc = src
        const dark = isDarkTheme()
        // Fallback: if mermaid.render() hangs, reveal code after 5s
        const fallback = setTimeout(() => {
          showCode()
        }, 5000)
        renderMermaid(src, dark)
          .then((svg) => {
            clearTimeout(fallback)
            preview.innerHTML = svg
            rendered = true
            toggleBtn.style.display = ""
            applyView()
          })
          .catch(() => {
            clearTimeout(fallback)
            showCode()
          })
      }

      if (node.attrs.language === "mermaid") {
        pre.style.display = "none"
        refreshMermaid()
      }

      return {
        dom,
        contentDOM,
        ignoreMutation(mutation: any) {
          if (mutation.type === "selection") return false
          if (!contentDOM.contains(mutation.target as globalThis.Node)) return true
          return false
        },
        update(updated) {
          if (updated.type.name !== "codeBlock") return false
          node = updated
          label.textContent = node.attrs.language || "text"
          // Only re-render if content actually changed
          const newSrc = node.textContent.trim()
          if (newSrc === lastSrc) return true
          if (timer) clearTimeout(timer)
          timer = setTimeout(refreshMermaid, 400)
          return true
        },
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (!this.editor.isActive("codeBlock")) return false
        editor.commands.insertContent("  ")
        return true
      },
      "Shift-Tab": () => {
        return false
      },
    }
  },

  addCommands() {
    return {
      setCodeBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.setNode(this.name, attrs)
        },
      toggleCodeBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleNode(this.name, "paragraph", attrs)
        },
    }
  },
})

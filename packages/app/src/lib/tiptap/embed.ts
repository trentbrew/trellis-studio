import { Node, mergeAttributes } from "@tiptap/core"
import type { MarkdownToken, MarkdownParseHelpers } from "@tiptap/core"

export interface EmbedOptions {
  HTMLAttributes: Record<string, any>
}

export interface EmbedAttributes {
  src: string
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function getEmbedType(src: string): "video" | "audio" | "iframe" | "link" {
  const url = src.toLowerCase()
  if (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com") ||
    url.includes("mux.com") ||
    url.includes("player")
  ) {
    return "video"
  }
  if (url.endsWith(".mp4") || url.endsWith(".webm") || url.endsWith(".mov")) {
    return "video"
  }
  if (url.endsWith(".mp3") || url.endsWith(".wav") || url.endsWith(".ogg") || url.endsWith(".m4a")) {
    return "audio"
  }
  if (
    url.includes("spotify.com") ||
    url.includes("soundcloud.com") ||
    url.includes("codepen.io") ||
    url.includes("codesandbox.io")
  ) {
    return "iframe"
  }
  return "link"
}

export const Embed = Node.create<EmbedOptions>({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-embed-src"),
        renderHTML: (attrs) => ({ "data-embed-src": attrs.src }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-embed-src]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-component": "embed" })]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div")
      dom.setAttribute("data-component", "embed")
      dom.className = "embed-block"
      dom.contentEditable = "false"

      const src = node.attrs.src as string
      if (!src || !isValidUrl(src)) {
        dom.innerHTML = `<div class="embed-error">Invalid embed URL</div>`
        return { dom }
      }

      const type = getEmbedType(src)
      const wrapper = document.createElement("div")
      wrapper.className = "embed-wrapper"

      if (type === "video") {
        // Handle YouTube
        if (src.includes("youtube.com/watch")) {
          const videoId = new URL(src).searchParams.get("v")
          if (videoId) {
            const iframe = document.createElement("iframe")
            iframe.src = `https://www.youtube.com/embed/${videoId}`
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            iframe.allowFullscreen = true
            wrapper.appendChild(iframe)
          }
        } else if (src.includes("youtu.be/")) {
          const videoId = src.split("/").pop()
          if (videoId) {
            const iframe = document.createElement("iframe")
            iframe.src = `https://www.youtube.com/embed/${videoId}`
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            iframe.allowFullscreen = true
            wrapper.appendChild(iframe)
          }
        } else if (src.includes("vimeo.com")) {
          const videoId = src.split("/").pop()
          if (videoId) {
            const iframe = document.createElement("iframe")
            iframe.src = `https://player.vimeo.com/video/${videoId}`
            iframe.allow = "autoplay; fullscreen; picture-in-picture"
            iframe.allowFullscreen = true
            wrapper.appendChild(iframe)
          }
        } else {
          // Generic video (direct MP4/WebM or Mux-style players)
          const video = document.createElement("video")
          video.src = src
          video.controls = true
          video.preload = "metadata"
          wrapper.appendChild(video)
        }
      } else if (type === "audio") {
        const audio = document.createElement("audio")
        audio.src = src
        audio.controls = true
        audio.preload = "metadata"
        wrapper.appendChild(audio)
      } else {
        // Generic iframe for other embeds
        const iframe = document.createElement("iframe")
        iframe.src = src
        iframe.sandbox = "allow-scripts allow-same-origin allow-popups"
        iframe.allow = "accelerometer; gyroscope; magnetometer; clipboard-read; clipboard-write; display-capture"
        wrapper.appendChild(iframe)
      }

      dom.appendChild(wrapper)

      // Add caption/controls
      const controls = document.createElement("div")
      controls.className = "embed-controls"

      const urlDisplay = document.createElement("a")
      urlDisplay.href = src
      urlDisplay.target = "_blank"
      urlDisplay.rel = "noopener noreferrer"
      urlDisplay.className = "embed-url"
      urlDisplay.textContent = new URL(src).hostname
      controls.appendChild(urlDisplay)

      const deleteBtn = document.createElement("button")
      deleteBtn.type = "button"
      deleteBtn.className = "embed-delete"
      deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
      deleteBtn.title = "Remove embed"
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = typeof getPos === "function" ? getPos() : null
        if (pos !== null && pos !== undefined) {
          editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run()
        }
      })
      controls.appendChild(deleteBtn)

      dom.appendChild(controls)

      return { dom }
    }
  },

  markdownTokenName: "embed" as any,

  markdownTokenizer: {
    name: "embed",
    level: "block" as const,
    start(src: string) {
      return src.indexOf(":embed[")
    },
    tokenize(source: string) {
      // Match :embed[src="url"]
      const match = source.match(/^:embed\[src=["']([^"']+)["']\]/)
      if (!match) return undefined
      const raw = match[0]
      const url = match[1]
      return { type: "embed", raw, src: url }
    },
  } as any,

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const t = token as MarkdownToken & { src: string }
    const url = t.src || ""
    return helpers.createNode("embed", { src: url })
  },

  renderMarkdown(node: any) {
    const url = node.attrs?.src || ""
    if (!url) return ""
    return `:embed[src="${url}"]`
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs: { src: string }) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({ type: "embed", attrs })
        },
    } as any
  },
})

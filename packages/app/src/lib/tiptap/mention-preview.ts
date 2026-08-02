import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export interface MentionPreviewOptions {
  fetch: (id: string, type: string) => Promise<string | undefined>
  onNavigate?: (attrs: { type: string; id: string }) => void
}

const cache = new Map<string, string>()
const key = new PluginKey("mentionPreview")

function truncate(content: string, lines = 12) {
  const split = content.split("\n")
  if (split.length <= lines) return content
  return split.slice(0, lines).join("\n") + "\n..."
}

function tooltip() {
  let el: HTMLDivElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let active = false

  function show(
    rect: DOMRect,
    content: string,
    attrs: { type: string; id: string },
    navigate?: (a: { type: string; id: string }) => void,
  ) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    hide()
    active = true
    el = document.createElement("div")
    el.className = "mention-preview"

    const header = document.createElement("div")
    header.className = "mention-preview-header"
    header.textContent = attrs.id
    el.appendChild(header)

    const body = document.createElement("pre")
    body.className = "mention-preview-body"
    body.textContent = truncate(content)
    el.appendChild(body)

    if (navigate) {
      const link = document.createElement("div")
      link.className = "mention-preview-footer"
      link.textContent = "Click to open"
      el.appendChild(link)
    }

    el.style.position = "fixed"
    const gap = 8
    const width = 360
    const left = Math.min(rect.left, window.innerWidth - width - 16)
    el.style.left = `${left}px`
    el.style.width = `${width}px`

    const below = window.innerHeight - rect.bottom - gap
    if (below > 200) {
      el.style.top = `${rect.bottom + gap}px`
    } else {
      el.style.bottom = `${window.innerHeight - rect.top + gap}px`
    }

    el.addEventListener("mouseenter", () => {
      active = true
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    })
    el.addEventListener("mouseleave", () => {
      active = false
      hideTimer = setTimeout(() => {
        if (!active) hide()
      }, 400)
    })

    document.body.appendChild(el)

    // Trigger enter animation
    requestAnimationFrame(() => {
      el?.classList.add("is-visible")
    })
  }

  function hide() {
    if (timer) clearTimeout(timer)
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    active = false
    if (!el) return
    el.classList.remove("is-visible")
    setTimeout(() => {
      el?.remove()
      el = null
    }, 150)
  }

  return { show, hide, isActive: () => active || !!hideTimer }
}

export const MentionPreview = Extension.create<MentionPreviewOptions>({
  name: "mentionPreview",

  addOptions() {
    return {
      fetch: async () => undefined,
      onNavigate: undefined,
    }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    const tip = tooltip()

    // Close tooltip on scroll only if mouse is not inside
    const scrollHandler = () => {
      if (tip.isActive()) return
      tip.hide()
    }
    document.addEventListener("scroll", scrollHandler, { passive: true, capture: true })

    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            mouseover(view: EditorView, event: MouseEvent) {
              const target = (event.target as HTMLElement)?.closest?.(".mention-node") as HTMLElement | null
              if (!target) {
                if (!tip.isActive()) tip.hide()
                return false
              }

              const id = target.getAttribute("data-mention-id") || ""
              const type = target.getAttribute("data-mention-type") || "file"
              if (!id) return false

              const cached = cache.get(`${type}:${id}`)
              if (cached) {
                tip.show(target.getBoundingClientRect(), cached, { type, id }, opts.onNavigate)
                return false
              }

              opts.fetch(id, type).then((content) => {
                if (!content) return
                cache.set(`${type}:${id}`, content)
                if (target.matches(":hover")) {
                  tip.show(target.getBoundingClientRect(), content, { type, id }, opts.onNavigate)
                }
              })

              return false
            },
            mouseout(_view: EditorView, event: MouseEvent) {
              const related = event.relatedTarget as HTMLElement | null
              if (related?.closest?.(".mention-preview")) return false
              if (related?.closest?.(".mention-node")) return false
              tip.hide()
              return false
            },
          },
        },
      }),
    ]
  },
})

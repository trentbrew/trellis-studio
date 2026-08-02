import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

export interface FileLinkOptions {
  fetch: (path: string) => Promise<string | undefined>
  onNavigate?: (path: string) => void
}

const cache = new Map<string, string>()
const key = new PluginKey("fileLink")

const EXTERNAL = /^(?:https?|mailto|tel|wiki|data|blob):/

function local(el: HTMLAnchorElement) {
  const href = el.getAttribute("href")
  if (!href) return undefined
  if (EXTERNAL.test(href) || href.startsWith("#")) return undefined
  return href
}

function truncate(content: string, lines = 12) {
  const split = content.split("\n")
  if (split.length <= lines) return content
  return split.slice(0, lines).join("\n") + "\n..."
}

function tooltip() {
  let el: HTMLDivElement | null = null
  let active = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function show(
    rect: DOMRect,
    path: string,
    content: string,
    navigate?: (p: string) => void,
    onUpdate?: (newPath: string) => void,
  ) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    hide()
    active = true
    el = document.createElement("div")
    el.className = "mention-preview"

    // Editable URL header
    const header = document.createElement("div")
    header.className = "mention-preview-header"
    header.style.display = "flex"
    header.style.gap = "0.5rem"
    header.style.alignItems = "center"

    const icon = document.createElement("span")
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
    icon.style.flexShrink = "0"
    icon.style.opacity = "0.7"

    const input = document.createElement("input")
    input.className = "mention-preview-input"
    input.value = path
    input.style.flex = "1"
    input.style.minWidth = "0"
    input.style.background = "transparent"
    input.style.border = "none"
    input.style.outline = "none"
    input.style.color = "inherit"
    input.style.fontSize = "inherit"
    input.style.fontFamily = "inherit"
    input.style.padding = "0"
    input.spellcheck = false

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        input.blur()
        onUpdate?.(input.value.trim())
        hide()
      }
      if (e.key === "Escape") {
        input.blur()
        hide()
      }
    })

    input.addEventListener("blur", () => {
      if (input.value.trim() !== path) {
        onUpdate?.(input.value.trim())
      }
    })

    header.appendChild(icon)
    header.appendChild(input)
    el.appendChild(header)

    const body = document.createElement("pre")
    body.className = "mention-preview-body"
    body.textContent = truncate(content)
    el.appendChild(body)

    if (navigate) {
      const footer = document.createElement("div")
      footer.className = "mention-preview-footer"
      footer.style.cursor = "pointer"
      footer.innerHTML = `<span>Click to open</span>`
      footer.addEventListener("click", () => {
        navigate(path)
        hide()
      })
      el.appendChild(footer)
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

export const FileLink = Extension.create<FileLinkOptions>({
  name: "fileLink",

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
          handleClick(_view: EditorView, _pos: number, event: MouseEvent) {
            const anchor = (event.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null
            if (!anchor) return false
            const path = local(anchor)
            if (!path) return false
            event.preventDefault()
            event.stopPropagation()
            tip.hide()
            opts.onNavigate?.(path)
            return true
          },
          handleDOMEvents: {
            click(_view: EditorView, event: MouseEvent) {
              const anchor = (event.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null
              if (!anchor) return false
              const path = local(anchor)
              if (!path) return false
              // Prevent browser navigation and let handleClick open in IDE
              event.preventDefault()
              event.stopPropagation()
              return true
            },
            mouseover(_view: EditorView, event: MouseEvent) {
              const anchor = (event.target as HTMLElement)?.closest?.("a") as HTMLAnchorElement | null
              if (!anchor) {
                if (!tip.isActive()) tip.hide()
                return false
              }
              const path = local(anchor)
              if (!path) return false

              const cached = cache.get(path)

              const navigate = () => opts.onNavigate?.(path)

              const onUpdate = (newPath: string) => {
                const href = anchor.getAttribute("href") || path
                const newHref =
                  newPath.startsWith("http") ||
                  newPath.startsWith("/") ||
                  newPath.startsWith("./") ||
                  newPath.startsWith("#")
                    ? newPath
                    : `./${newPath}`

                // Update the anchor attributes
                anchor.setAttribute("href", newHref)

                // Update cache
                const content = cache.get(path)
                if (content) {
                  cache.delete(path)
                  cache.set(newPath, content)
                }

                // Dispatch event for parent to update underlying markdown
                anchor.dispatchEvent(
                  new CustomEvent("fileLinkUpdated", {
                    bubbles: true,
                    detail: { oldHref: href, newHref, oldPath: path, newPath },
                  }),
                )
              }

              if (cached) {
                tip.show(anchor.getBoundingClientRect(), path, cached, navigate, onUpdate)
                return false
              }

              opts.fetch(path).then((content) => {
                if (!content) return
                cache.set(path, content)
                if (anchor.matches(":hover")) {
                  tip.show(anchor.getBoundingClientRect(), path, content, navigate, onUpdate)
                }
              })

              return false
            },
            mouseout(_view: EditorView, event: MouseEvent) {
              const related = event.relatedTarget as HTMLElement | null
              if (related?.closest?.(".mention-preview")) return false
              if (related?.closest?.("a")) return false
              tip.hide()
              return false
            },
          },
        },
      }),
    ]
  },
})

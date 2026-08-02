import { useMarked } from "../context/marked"
import { useData } from "../context/data"
import { useI18n } from "../context/i18n"
import DOMPurify from "dompurify"
import morphdom from "morphdom"
import { checksum } from "@opencode-ai/util/encode"
import { ComponentProps, createEffect, createResource, createSignal, onCleanup, splitProps } from "solid-js"
import { isServer } from "solid-js/web"
import { stream } from "./markdown-stream"
import { render as renderMermaid } from "./mermaid"
import { parseCsv, renderHtml as renderCsvHtml } from "./csv-table"
import { isDarkTheme } from "../theme"
import { isEntityRef, entityHref, ENTITY_LINK } from "../lib/entity-ref"
import { isWhiteboardEmbedPath } from "../lib/whiteboard-embed"
import { useWhiteboardEmbedMountOptional } from "../context/whiteboard-embed"

export type MountWhiteboardEmbedFn = (el: HTMLElement, path: string, label?: string) => () => void

type Entry = {
  hash: string
  html: string
}

const max = 200
const cache = new Map<string, Entry>()

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return
    if (node.target !== "_blank") return

    const rel = node.getAttribute("rel") ?? ""
    const set = new Set(rel.split(/\s+/).filter(Boolean))
    set.add("noopener")
    set.add("noreferrer")
    node.setAttribute("rel", Array.from(set).join(" "))
  })
}

const config = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
}

const iconPaths = {
  copy: '<path d="M6.2513 6.24935V2.91602H17.0846V13.7493H13.7513M13.7513 6.24935V17.0827H2.91797V6.24935H13.7513Z" stroke="currentColor" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-linecap="square"/>',
}

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return ""
  return DOMPurify.sanitize(html, config)
}

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function fallback(markdown: string) {
  return escape(markdown).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>")
}

type CopyLabels = {
  copy: string
  copied: string
}

const urlPattern = /^https?:\/\/[^\s<>()`"']+$/

function codeUrl(text: string) {
  const href = text.trim().replace(/[),.;!?]+$/, "")
  if (!urlPattern.test(href)) return
  try {
    const url = new URL(href)
    return url.toString()
  } catch {
    return
  }
}

function createIcon(path: string, slot: string) {
  const icon = document.createElement("div")
  icon.setAttribute("data-component", "icon")
  icon.setAttribute("data-size", "small")
  icon.setAttribute("data-slot", slot)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("data-slot", "icon-svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", "0 0 20 20")
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  icon.appendChild(svg)
  return icon
}

function createCopyButton(labels: CopyLabels) {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-component", "icon-button")
  button.setAttribute("data-variant", "secondary")
  button.setAttribute("data-size", "small")
  button.setAttribute("data-slot", "markdown-copy-button")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
  button.appendChild(createIcon(iconPaths.copy, "copy-icon"))
  button.appendChild(createIcon(iconPaths.check, "check-icon"))
  return button
}

function setCopyState(button: HTMLButtonElement, labels: CopyLabels, copied: boolean) {
  if (copied) {
    button.setAttribute("data-copied", "true")
    button.setAttribute("aria-label", labels.copied)
    button.setAttribute("data-tooltip", labels.copied)
    return
  }
  button.removeAttribute("data-copied")
  button.setAttribute("aria-label", labels.copy)
  button.setAttribute("data-tooltip", labels.copy)
}

function ensureCodeWrapper(block: HTMLPreElement, labels: CopyLabels) {
  const parent = block.parentElement
  if (!parent) return
  const wrapped = parent.getAttribute("data-component") === "markdown-code"
  if (!wrapped) {
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-component", "markdown-code")
    parent.replaceChild(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(createCopyButton(labels))
    return
  }

  const buttons = Array.from(parent.querySelectorAll('[data-slot="markdown-copy-button"]')).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
  )

  if (buttons.length === 0) {
    parent.appendChild(createCopyButton(labels))
    return
  }

  for (const button of buttons.slice(1)) {
    button.remove()
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? "")
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains("external-link")
        ? code.parentElement
        : null

    if (!href) {
      if (parentLink) parentLink.replaceWith(code)
      continue
    }

    if (parentLink) {
      parentLink.href = href
      continue
    }

    const link = document.createElement("a")
    link.href = href
    link.className = "external-link"
    link.rel = "noopener noreferrer"
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

function markEntityRefs(root: HTMLDivElement) {
  const nodes = Array.from(root.querySelectorAll(":not(pre) > code"))
  for (const code of nodes) {
    if (code.closest("a")) continue
    const text = code.textContent ?? ""
    if (!isEntityRef(text)) continue
    const link = document.createElement("a")
    link.href = entityHref(text)
    link.className = ENTITY_LINK
    link.dataset.entityId = text.trim()
    code.parentNode?.replaceChild(link, code)
    link.appendChild(code)
  }
}

function langOf(pre: HTMLPreElement) {
  const code = pre.querySelector("code")
  if (!code) return
  const cls = code.getAttribute("class") ?? ""
  const match = cls.match(/language-(\S+)/)
  return match?.[1]
}

const fileLinkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`

function decorateFileLinks(root: HTMLDivElement) {
  const links = Array.from(root.querySelectorAll("a.file-link"))
  for (const link of links) {
    if (link.querySelector(".file-link-icon")) continue
    const icon = document.createElement("span")
    icon.className = "file-link-icon"
    icon.innerHTML = fileLinkIcon
    link.insertBefore(icon, link.firstChild)
  }
}

function decorateImages(root: HTMLDivElement, mediaUrl: string | undefined) {
  if (!mediaUrl) return
  const images = Array.from(root.querySelectorAll("img"))
  for (const img of images) {
    const src = img.getAttribute("src")
    if (src && src.startsWith("/")) {
      try {
        img.src = new URL(src, mediaUrl).toString()
      } catch {
        console.error("Failed to resolve image URL:", src)
      }
    }
  }
}

function decorate(root: HTMLDivElement, labels: CopyLabels, mediaUrl: string | undefined) {
  const blocks = Array.from(root.querySelectorAll("pre"))
  for (const block of blocks) {
    ensureCodeWrapper(block, labels)
  }
  markCodeLinks(root)
  markEntityRefs(root)
  decorateFileLinks(root)
  decorateImages(root, mediaUrl)
}
function fileLinkTooltip() {
  let el: HTMLDivElement | null = null
  let active = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function show(
    rect: DOMRect,
    path: string,
    content: string,
    onNavigate?: () => void,
    onUpdate?: (newPath: string) => void,
  ) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (el) {
      // Update existing tooltip if showing same path
      const input = el.querySelector(".mention-preview-input") as HTMLInputElement | null
      if (input && input.value === path) return
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
    const lines = content.split("\n")
    body.textContent = lines.length > 12 ? lines.slice(0, 12).join("\n") + "\n..." : content
    el.appendChild(body)

    const footer = document.createElement("div")
    footer.className = "mention-preview-footer"
    footer.style.cursor = "pointer"
    footer.innerHTML = `<span>Click to open</span>`
    footer.addEventListener("click", () => {
      onNavigate?.()
      hide()
    })
    el.appendChild(footer)

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
      // Delay to allow moving to another link or crossing the gap to the popover
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

const eyeIcon = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M10 4.5C5.5 4.5 2.5 10 2.5 10s3 5.5 7.5 5.5 7.5-5.5 7.5-5.5-3-5.5-7.5-5.5z"/><circle cx="10" cy="10" r="2.5"/></svg>`
const codeViewIcon = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M6.5 6.5L2 10l4.5 3.5M13.5 6.5L18 10l-4.5 3.5M11.5 4.5l-3 11"/></svg>`

function processMermaid(container: HTMLDivElement, dark: boolean) {
  const blocks = Array.from(container.querySelectorAll("pre")).filter((pre) => langOf(pre) === "mermaid")
  for (const pre of blocks) {
    const code = pre.querySelector("code")?.textContent ?? ""
    if (!code.trim()) continue
    const wrapper = (pre.closest('[data-component="markdown-code"]') ?? pre) as HTMLElement
    if (wrapper.getAttribute("data-mermaid")) continue
    wrapper.setAttribute("data-mermaid", "pending")

    renderMermaid(code, dark)
      .then((svg) => {
        const host = document.createElement("div")
        host.setAttribute("data-component", "mermaid-block")

        const hdr = document.createElement("div")
        hdr.setAttribute("data-component", "mermaid-block-header")

        const lbl = document.createElement("span")
        lbl.setAttribute("data-component", "code-block-lang")
        lbl.textContent = "mermaid"

        const toggleBtn = document.createElement("button")
        toggleBtn.type = "button"
        toggleBtn.setAttribute("data-component", "mermaid-toggle")
        toggleBtn.setAttribute("aria-label", "Show code")
        toggleBtn.innerHTML = codeViewIcon

        hdr.appendChild(lbl)
        hdr.appendChild(toggleBtn)
        host.appendChild(hdr)

        const diagram = document.createElement("div")
        diagram.setAttribute("data-component", "mermaid-diagram")
        diagram.innerHTML = svg
        host.appendChild(diagram)

        const codeEl = wrapper.cloneNode(true) as HTMLElement
        codeEl.removeAttribute("data-mermaid")
        codeEl.style.display = "none"
        host.appendChild(codeEl)

        let showDiagram = true
        toggleBtn.addEventListener("click", () => {
          showDiagram = !showDiagram
          diagram.style.display = showDiagram ? "" : "none"
          codeEl.style.display = showDiagram ? "none" : ""
          toggleBtn.innerHTML = showDiagram ? codeViewIcon : eyeIcon
          toggleBtn.setAttribute("aria-label", showDiagram ? "Show code" : "Show diagram")
        })

        wrapper.replaceWith(host)
      })
      .catch(() => {
        wrapper.removeAttribute("data-mermaid")
      })
  }
}

const whiteboardIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8M12 8v8"/></svg>`

function renderWhiteboardFallback(
  block: HTMLElement,
  path: string,
  label: string | undefined,
  onLinkClick?: (href: string, event: MouseEvent) => void,
) {
  block.setAttribute("data-whiteboard-fallback", "true")
  block.innerHTML = ""
  block.className = "whiteboard-embed-fallback"

  const card = document.createElement("button")
  card.type = "button"
  card.className = "whiteboard-embed-fallback__card"
  card.innerHTML = `${whiteboardIcon}<span class="whiteboard-embed-fallback__label">${label?.trim() || path.split("/").pop() || "Whiteboard"}</span><span class="whiteboard-embed-fallback__hint">Click to open</span>`
  card.addEventListener("click", (e) => {
    e.preventDefault()
    onLinkClick?.(path, e)
  })
  block.appendChild(card)
}

function processWhiteboardEmbeds(
  container: HTMLDivElement,
  opts: {
    mount?: MountWhiteboardEmbedFn
    onLinkClick?: (href: string, event: MouseEvent) => void
  },
) {
  const blocks = Array.from(container.querySelectorAll('[data-component="whiteboard-embed"]'))
  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue
    if (block.getAttribute("data-whiteboard-mounted") === "true") continue
    const path = block.getAttribute("data-whiteboard-path")
    if (!path || !isWhiteboardEmbedPath(path)) continue

    const label = block.getAttribute("data-whiteboard-label") ?? undefined
    if (!opts.mount) {
      renderWhiteboardFallback(block, path, label, opts.onLinkClick)
      continue
    }

    block.setAttribute("data-whiteboard-mounted", "true")
    block.innerHTML = ""
    opts.mount(block, path, label)
  }
}

function processCsv(container: HTMLDivElement) {
  const blocks = Array.from(container.querySelectorAll("pre")).filter((pre) => langOf(pre) === "csv")
  for (const pre of blocks) {
    const code = pre.querySelector("code")?.textContent ?? ""
    if (!code.trim()) continue
    const data = parseCsv(code)
    if (!data) continue
    const wrapper = pre.closest('[data-component="markdown-code"]') ?? pre
    const div = document.createElement("div")
    div.innerHTML = renderCsvHtml(data)
    const table = div.firstElementChild
    if (table) wrapper.replaceWith(table)
  }
}

function setupCodeCopy(root: HTMLDivElement, getLabels: () => CopyLabels) {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>()

  const updateLabel = (button: HTMLButtonElement) => {
    const labels = getLabels()
    const copied = button.getAttribute("data-copied") === "true"
    setCopyState(button, labels, copied)
  }

  const handleClick = async (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-slot="markdown-copy-button"]')
    if (!(button instanceof HTMLButtonElement)) return
    const code = button.closest('[data-component="markdown-code"]')?.querySelector("code")
    const content = code?.textContent ?? ""
    if (!content) return
    const clipboard = navigator?.clipboard
    if (!clipboard) return
    await clipboard.writeText(content)
    const labels = getLabels()
    setCopyState(button, labels, true)
    const existing = timeouts.get(button)
    if (existing) clearTimeout(existing)
    const timeout = setTimeout(() => setCopyState(button, labels, false), 2000)
    timeouts.set(button, timeout)
  }

  const buttons = Array.from(root.querySelectorAll('[data-slot="markdown-copy-button"]'))
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) updateLabel(button)
  }

  root.addEventListener("click", handleClick)

  return () => {
    root.removeEventListener("click", handleClick)
    for (const timeout of timeouts.values()) {
      clearTimeout(timeout)
    }
  }
}

function touch(key: string, value: Entry) {
  cache.delete(key)
  cache.set(key, value)

  if (cache.size <= max) return

  const first = cache.keys().next().value
  if (!first) return
  cache.delete(first)
}

export function Markdown(
  props: ComponentProps<"div"> & {
    text: string
    cacheKey?: string
    streaming?: boolean
    class?: string
    classList?: Record<string, boolean>
    onLinkClick?: (href: string, event: MouseEvent) => void
    fileFetch?: (path: string) => Promise<string | undefined>
    mountWhiteboardEmbed?: MountWhiteboardEmbedFn
  },
) {
  const [local, others] = splitProps(props, [
    "text",
    "cacheKey",
    "streaming",
    "class",
    "classList",
    "onLinkClick",
    "fileFetch",
    "mountWhiteboardEmbed",
  ])
  const marked = useMarked()
  const i18n = useI18n()
  const contextMount = useWhiteboardEmbedMountOptional()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [html] = createResource(
    () => ({
      text: local.text,
      key: local.cacheKey,
      streaming: local.streaming ?? false,
    }),
    async (src) => {
      if (isServer) return fallback(src.text)
      if (!src.text) return ""

      const base = src.key ?? checksum(src.text)
      return Promise.all(
        stream(src.text, src.streaming).map(async (block, index) => {
          const hash = checksum(block.raw)
          const key = base ? `${base}:${index}:${block.mode}` : hash

          if (key && hash) {
            const cached = cache.get(key)
            if (cached && cached.hash === hash) {
              touch(key, cached)
              return cached.html
            }
          }

          const next = await Promise.resolve(marked.parse(block.src))
          const safe = sanitize(next)
          if (key && hash) touch(key, { hash, html: safe })
          return safe
        }),
      )
        .then((list) => list.join(""))
        .catch(() => fallback(src.text))
    },
    { initialValue: fallback(local.text) },
  )

  let copyCleanup: (() => void) | undefined
  const tip = fileLinkTooltip()
  const previewCache = new Map<string, string>()

  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const link = target.closest("a[href]")
    if (!(link instanceof HTMLAnchorElement)) return

    const href = link.getAttribute("href")
    if (!href) return

    // Always prevent browser navigation for internal links
    if (!/^(?:https?|mailto|tel|blob|data):/.test(href)) {
      event.preventDefault()
    }

    local.onLinkClick?.(href, event)
  }

  const handleHover = (event: MouseEvent) => {
    if (!local.fileFetch) return
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest("a.file-link") as HTMLAnchorElement | null
    if (!link) {
      if (!tip.isActive()) tip.hide()
      return
    }
    const path = link.getAttribute("data-file-path")
    if (!path) return

    const onNavigate = () => {
      const href = link.getAttribute("href") || path
      local.onLinkClick?.(href, new MouseEvent("click"))
    }

    const onUpdate = (newPath: string) => {
      const oldHref = link.getAttribute("href") || path
      const newHref =
        newPath.startsWith("http") || newPath.startsWith("/") || newPath.startsWith("./") || newPath.startsWith("#")
          ? newPath
          : `./${newPath}`

      // Update the link in the DOM
      link.setAttribute("href", newHref)
      link.setAttribute("data-file-path", newPath)

      // Find and update in the original markdown
      const container = root()
      if (!container) return

      // Simple text replacement - find [text](oldHref) and replace with [text](newHref)
      const linkText = link.textContent?.replace(/^\s*\S+\s*/, "") || newPath
      const oldMarkdown = `[${linkText}](${oldHref})`
      const newMarkdown = `[${linkText}](${newHref})`

      // Update preview cache
      const oldContent = previewCache.get(path)
      if (oldContent) {
        previewCache.delete(path)
        previewCache.set(newPath, oldContent)
      }

      // Dispatch custom event for parent to handle if needed
      container.dispatchEvent(
        new CustomEvent("fileLinkUpdated", {
          bubbles: true,
          detail: { oldHref, newHref, oldPath: path, newPath },
        }),
      )
    }

    const cached = previewCache.get(path)
    if (cached) {
      tip.show(link.getBoundingClientRect(), path, cached, onNavigate, onUpdate)
      return
    }
    local.fileFetch(path).then((content) => {
      if (!content) return
      previewCache.set(path, content)
      if (link.matches(":hover")) {
        tip.show(link.getBoundingClientRect(), path, content, onNavigate, onUpdate)
      }
    })
  }

  const handleHoverEnd = (event: MouseEvent) => {
    const related = (event as MouseEvent).relatedTarget as HTMLElement | null
    // Don't hide if moving to the tooltip itself or another file link
    if (related?.closest?.(".mention-preview")) return
    if (related?.closest?.("a.file-link")) return
    // Tooltip has its own hide delay, so we don't force hide here
  }

  const handleDocumentEvent = (event: Event) => {
    if (event.type === "mousedown" && !tip.isActive()) {
      tip.hide()
      return
    }
    if (event.type === "scroll") {
      // Don't hide if mouse is still over the tooltip
      if (tip.isActive()) return
      tip.hide()
    }
  }

  createEffect(() => {
    const data = useData()
    const container = root()
    const content = local.text ? (html.latest ?? "") : ""
    if (!container) return
    if (isServer) return

    if (!content) {
      container.innerHTML = ""
      return
    }

    const labels = {
      copy: i18n.t("ui.message.copy"),
      copied: i18n.t("ui.message.copied"),
    }
    const temp = document.createElement("div")
    temp.innerHTML = content
    decorate(temp, labels, data.mediaUrl)

    morphdom(container, temp, {
      childrenOnly: true,
      onBeforeElUpdated: (fromEl, toEl) => {
        if (
          fromEl instanceof HTMLButtonElement &&
          toEl instanceof HTMLButtonElement &&
          fromEl.getAttribute("data-slot") === "markdown-copy-button" &&
          toEl.getAttribute("data-slot") === "markdown-copy-button" &&
          fromEl.getAttribute("data-copied") === "true"
        ) {
          setCopyState(toEl, labels, true)
        }
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    processCsv(container)
    processMermaid(container, isDarkTheme())
    processWhiteboardEmbeds(container, {
      mount: local.mountWhiteboardEmbed ?? contextMount,
      onLinkClick: local.onLinkClick,
    })

    if (!copyCleanup)
      copyCleanup = setupCodeCopy(container, () => ({
        copy: i18n.t("ui.message.copy"),
        copied: i18n.t("ui.message.copied"),
      }))

    if (local.onLinkClick) {
      container.addEventListener("click", handleClick)
    }

    if (local.fileFetch) {
      container.addEventListener("mouseover", handleHover)
      container.addEventListener("mouseout", handleHoverEnd)
      document.addEventListener("scroll", handleDocumentEvent, { passive: true, capture: true })
      document.addEventListener("mousedown", handleDocumentEvent, { capture: true })
    }
  })

  onCleanup(() => {
    if (copyCleanup) copyCleanup()
    tip.hide()
    const container = root()
    if (container) {
      if (local.onLinkClick) container.removeEventListener("click", handleClick)
      if (local.fileFetch) {
        container.removeEventListener("mouseover", handleHover)
        container.removeEventListener("mouseout", handleHoverEnd)
        document.removeEventListener("scroll", handleDocumentEvent, { capture: true })
        document.removeEventListener("mousedown", handleDocumentEvent, { capture: true })
      }
    }
  })

  return (
    <div
      data-component="markdown"
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      ref={setRoot}
      {...others}
    />
  )
}

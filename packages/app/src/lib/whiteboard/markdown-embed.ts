import type { Root } from "react-dom/client"
import {
  documentHasPendingMermaid,
  expandMermaidInDocument,
  parseWhiteboard,
  prepareExcalidrawInitialData,
  STUDIO_WHITEBOARD_APP_STATE,
  whiteboardTitle,
} from "@opencode-ai/whiteboard/browser"
import { isDarkTheme } from "@opencode-ai/ui/theme"
import { resolveStudioColorScheme } from "@/lib/whiteboard/canvas-background"
import { loadExcalidrawBundle } from "@/pages/session/excalidraw-bundle"

const EMBED_UI_OPTIONS: Record<string, unknown> = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: false },
}

export type WhiteboardMarkdownEmbedOptions = {
  path: string
  label?: string
  fetchContent: () => Promise<string | undefined>
  onOpen?: (path: string) => void
}

function visibleElements(elements: readonly Record<string, unknown>[]) {
  return elements.filter((el) => el.isDeleted !== true)
}

function afterExcalidrawMounted(fn: () => void) {
  requestAnimationFrame(() => queueMicrotask(fn))
}

/** Mount a read-only Excalidraw scene inside markdown (blog posts, previews, chat). */
export function mountWhiteboardMarkdownEmbed(
  host: HTMLElement,
  opts: WhiteboardMarkdownEmbedOptions,
): () => void {
  let disposed = false
  let reactRoot: Root | undefined

  host.setAttribute("data-component", "whiteboard-markdown-embed")
  host.classList.add("whiteboard-markdown-embed")

  const shell = document.createElement("div")
  shell.className = "whiteboard-markdown-embed__shell"
  host.appendChild(shell)

  const canvas = document.createElement("div")
  canvas.className = "whiteboard-markdown-embed__canvas"
  shell.appendChild(canvas)

  const footer = document.createElement("div")
  footer.className = "whiteboard-markdown-embed__footer"

  const title = document.createElement("span")
  title.className = "whiteboard-markdown-embed__title"
  title.textContent = opts.label?.trim() || whiteboardTitle(opts.path)
  footer.appendChild(title)

  if (opts.onOpen) {
    const openBtn = document.createElement("button")
    openBtn.type = "button"
    openBtn.className = "whiteboard-markdown-embed__open"
    openBtn.textContent = "Open whiteboard"
    openBtn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      opts.onOpen?.(opts.path)
    })
    footer.appendChild(openBtn)
  }

  shell.appendChild(footer)

  const showMessage = (message: string) => {
    canvas.innerHTML = ""
    const empty = document.createElement("div")
    empty.className = "whiteboard-markdown-embed__empty"
    empty.textContent = message
    canvas.appendChild(empty)
  }

  void (async () => {
    try {
      const raw = await opts.fetchContent()
      if (disposed) return
      if (!raw?.trim()) {
        showMessage("Whiteboard not found")
        return
      }

      let doc = parseWhiteboard(raw)
      const bundle = await loadExcalidrawBundle()
      if (disposed) return

      if (documentHasPendingMermaid(doc)) {
        const expanded = await expandMermaidInDocument(doc, bundle.mermaidToExcalidrawElements)
        doc = expanded.doc
      }
      if (disposed) return

      if (visibleElements(doc.elements).length === 0) {
        showMessage("Empty whiteboard — open to add content")
        return
      }

      const scene = prepareExcalidrawInitialData(doc)
      const theme = resolveStudioColorScheme(isDarkTheme() ? "dark" : "light")
      const elements = bundle.normalizeWhiteboardElements(scene.elements)
      const appState: Record<string, unknown> = {
        ...STUDIO_WHITEBOARD_APP_STATE,
        ...scene.appState,
        viewModeEnabled: true,
        zenModeEnabled: true,
        collaborators: new Map(),
      }
      delete appState.scrollX
      delete appState.scrollY
      delete appState.zoom

      reactRoot = bundle.createRoot(canvas)
      reactRoot.render(
        bundle.React.createElement(bundle.Excalidraw, {
          theme,
          name: opts.path,
          UIOptions: EMBED_UI_OPTIONS,
          initialData: {
            elements: [...elements],
            appState,
            files: scene.files,
          },
          excalidrawAPI: (api: { scrollToContent?: (elements?: unknown, opts?: { fitToContent?: boolean }) => void; getSceneElements?: () => unknown }) => {
            afterExcalidrawMounted(() => {
              api.scrollToContent?.(api.getSceneElements?.(), { fitToContent: true })
            })
          },
        } as never),
      )
    } catch {
      if (!disposed) showMessage("Failed to load whiteboard")
    }
  })()

  return () => {
    disposed = true
    reactRoot?.unmount()
    reactRoot = undefined
    host.innerHTML = ""
  }
}

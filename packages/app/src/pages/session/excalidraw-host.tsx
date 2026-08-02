import type { Root } from "react-dom/client"
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js"
import {
  excalidrawStorageKeysForPath,
  prepareExcalidrawInitialData,
  repairExcalidrawLocalStorage,
  STUDIO_WHITEBOARD_APP_STATE,
  STUDIO_WHITEBOARD_UI_OPTIONS,
  type WhiteboardDocument,
} from "@/lib/whiteboard/schema"
import { normalizeEmbeddableElements } from "@/lib/whiteboard/embed-link"
import {
  documentHasPendingMermaid,
  expandMermaidInDocument,
  isPendingMermaidElement,
} from "@opencode-ai/whiteboard/browser"
import { showToast } from "@opencode-ai/ui/toast"
import { loadExcalidrawBundle } from "./excalidraw-bundle"
import { installExcalidrawPopoverFlip } from "./excalidraw-popover-flip"
import {
  resolveStudioColorScheme,
  resolveWhiteboardCanvasBackground,
} from "@/lib/whiteboard/canvas-background"
import { paintWhiteboardDotGrid, type DotGridViewport } from "./whiteboard-dot-grid"
import {
  createWhiteboardMinimap,
  type WhiteboardMinimapElement,
  type WhiteboardMinimapHandle,
} from "./whiteboard-minimap"
import "./excalidraw-host.css"

export type ExcalidrawChangePayload = {
  elements: readonly Record<string, unknown>[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export type ExcalidrawHostHandle = {
  exportPreview: () => Promise<Blob | null>
}

type ExcalidrawApi = {
  updateScene: (scene: {
    elements?: readonly Record<string, unknown>[]
    appState?: Record<string, unknown>
    files?: Record<string, unknown>
  }) => void
  getSceneElements?: () => readonly Record<string, unknown>[]
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 30
const ZOOM_STEP = 1.1
const ZOOM_HUD_HIDE_MS = 1200

function clampZoom(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
}

function formatZoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`
}

/** Run after Excalidraw's React tree has committed (avoids setState-before-mount warnings). */
function afterExcalidrawMounted(fn: () => void) {
  requestAnimationFrame(() => queueMicrotask(fn))
}

function minimapElementsFromScene(elements: readonly Record<string, unknown>[]): WhiteboardMinimapElement[] {
  return elements.map((el) => ({
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: Number(el.width) || 0,
    height: Number(el.height) || 0,
    isDeleted: el.isDeleted === true,
  }))
}

type ExcalidrawHostProps = {
  initialData: WhiteboardDocument
  /** Bump when disk/agent updates the scene so Excalidraw applies without remounting. */
  sceneRevision?: number
  storageName: string
  theme: "light" | "dark"
  onChange: (payload: ExcalidrawChangePayload) => void
  onHostReady?: (handle: ExcalidrawHostHandle) => void
}

/** Mounts Excalidraw (React) inside a Solid tree. */
export function ExcalidrawHost(props: ExcalidrawHostProps) {
  let hostEl: HTMLDivElement | undefined
  let rootEl: HTMLDivElement | undefined
  let dotCanvas: HTMLCanvasElement | undefined
  let reactRoot: Root | undefined
  let api: ExcalidrawApi | undefined
  let popoverFlipCleanup: (() => void) | undefined
  let minimap: WhiteboardMinimapHandle | undefined
  let sceneElements: WhiteboardMinimapElement[] = []
  let latestElements: readonly Record<string, unknown>[] = []
  let latestFiles: Record<string, unknown> = {}
  let expandingMermaid = false
  let suppressChange = false
  /** Ignore Excalidraw mount noise until pending mermaid placeholders are expanded and saved. */
  let gateMermaidExpand = false
  let latestAppState: Record<string, unknown> = { ...STUDIO_WHITEBOARD_APP_STATE }
  let lastZoom: number | undefined
  let lastScrollX: number | undefined
  let lastScrollY: number | undefined
  let hideZoomHudTimer: ReturnType<typeof setTimeout> | undefined
  let zoomWheelCleanup: (() => void) | undefined
  /** Re-render Excalidraw when Studio theme changes (props.theme is read on mount only otherwise). */
  let patchExcalidrawTheme: ((theme: "light" | "dark") => void) | undefined
  const [error, setError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [zoomHudVisible, setZoomHudVisible] = createSignal(false)
  const studioTheme = createMemo(() => resolveStudioColorScheme(props.theme))

  const [viewport, setViewport] = createSignal<DotGridViewport>({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    width: 0,
    height: 0,
    gridSize: STUDIO_WHITEBOARD_APP_STATE.gridSize as number,
    gridStep: STUDIO_WHITEBOARD_APP_STATE.gridStep as number,
    theme: studioTheme(),
  })

  const readViewport = (appState: Record<string, unknown>): Omit<DotGridViewport, "width" | "height" | "theme"> => {
    const zoomRaw = appState.zoom
    const zoom =
      typeof zoomRaw === "object" && zoomRaw && "value" in zoomRaw
        ? Number((zoomRaw as { value: number }).value)
        : 1
    return {
      scrollX: Number(appState.scrollX) || 0,
      scrollY: Number(appState.scrollY) || 0,
      zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
      gridSize:
        typeof appState.gridSize === "number"
          ? appState.gridSize
          : (STUDIO_WHITEBOARD_APP_STATE.gridSize as number),
      gridStep:
        typeof appState.gridStep === "number"
          ? appState.gridStep
          : (STUDIO_WHITEBOARD_APP_STATE.gridStep as number),
    }
  }

  const paintDots = () => {
    if (!dotCanvas || !hostEl) return
    const rect = hostEl.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    if (dotCanvas.width !== width * dpr || dotCanvas.height !== height * dpr) {
      dotCanvas.width = width * dpr
      dotCanvas.height = height * dpr
      dotCanvas.style.width = `${width}px`
      dotCanvas.style.height = `${height}px`
    }
    const ctx = dotCanvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const vp = viewport()
    paintWhiteboardDotGrid(ctx, { ...vp, width, height, theme: studioTheme() })
  }

  const syncMinimap = () => {
    if (!minimap || !hostEl) return
    const rect = hostEl.getBoundingClientRect()
    const vp = viewport()
    minimap.update({
      elements: sceneElements,
      viewport: {
        scrollX: vp.scrollX,
        scrollY: vp.scrollY,
        zoom: vp.zoom,
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      },
    })
  }

  const panMinimap = (scrollX: number, scrollY: number) => {
    if (!api) return
    suppressChange = true
    try {
      api.updateScene({ appState: { scrollX, scrollY } })
      setViewport((prev) => ({ ...prev, scrollX, scrollY }))
      syncMinimap()
      minimap?.reveal()
    } finally {
      queueMicrotask(() => {
        suppressChange = false
      })
    }
  }

  const ensureMinimap = () => {
    if (!hostEl) return
    minimap?.destroy()
    minimap = createWhiteboardMinimap(hostEl, panMinimap)
    syncMinimap()
  }

  const revealZoomHud = () => {
    setZoomHudVisible(true)
    if (hideZoomHudTimer) clearTimeout(hideZoomHudTimer)
    hideZoomHudTimer = setTimeout(() => setZoomHudVisible(false), ZOOM_HUD_HIDE_MS)
  }

  const noteZoomChange = (nextZoom: number) => {
    const zoom = clampZoom(nextZoom)
    if (lastZoom !== undefined && Math.abs(zoom - lastZoom) > 1e-4) {
      revealZoomHud()
      minimap?.reveal()
    }
    lastZoom = zoom
  }

  const notePanChange = (scrollX: number, scrollY: number) => {
    if (
      lastScrollX !== undefined &&
      (Math.abs(scrollX - lastScrollX) > 0.5 || Math.abs(scrollY - lastScrollY!) > 0.5)
    ) {
      minimap?.reveal()
    }
    lastScrollX = scrollX
    lastScrollY = scrollY
  }

  const setZoom = (value: number) => {
    if (!api) return
    const zoom = clampZoom(value)
    suppressChange = true
    try {
      api.updateScene({ appState: { zoom: { value: zoom } } })
      setViewport((prev) => ({ ...prev, zoom }))
      syncMinimap()
      revealZoomHud()
    } finally {
      queueMicrotask(() => {
        suppressChange = false
      })
    }
  }

  const ensureZoomWheelListener = () => {
    if (!hostEl) return
    zoomWheelCleanup?.()
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) revealZoomHud()
    }
    hostEl.addEventListener("wheel", onWheel, { passive: true })
    zoomWheelCleanup = () => hostEl?.removeEventListener("wheel", onWheel)
  }

  const docHasPendingMermaid = documentHasPendingMermaid

  const commitScene = (
    elements: readonly Record<string, unknown>[],
    files: Record<string, unknown>,
    appState: Record<string, unknown>,
  ) => {
    latestElements = elements
    latestFiles = files
    latestAppState = appState
    sceneElements = minimapElementsFromScene(elements)
    if (!api) return
    const merged = mergeAppState(appState)
    suppressChange = true
    try {
      api.updateScene({ elements: [...elements], appState: merged, files })
    } finally {
      queueMicrotask(() => {
        suppressChange = false
        props.onChange({ elements, appState: merged, files })
      })
    }
    syncMinimap()
  }

  /**
   * Convert pending mermaid placeholders (agent `insert_mermaid`) into Excalidraw shapes.
   * Must persist expanded elements to disk — blocking onChange previously left boards blank.
   */
  const expandPendingMermaid = async (doc?: WhiteboardDocument) => {
    if (!api || expandingMermaid) return
    const sourceDoc: WhiteboardDocument = doc ?? {
      ...untrack(() => props.initialData),
      elements:
        untrack(() => props.initialData).elements.some((el) => isPendingMermaidElement(el))
          ? untrack(() => props.initialData).elements
          : latestElements,
      files: latestFiles,
    }
    if (!docHasPendingMermaid(sourceDoc)) {
      gateMermaidExpand = false
      return
    }
    gateMermaidExpand = true
    expandingMermaid = true
    try {
      const bundle = await loadExcalidrawBundle()
      const { doc: nextDoc, expanded, errors } = await expandMermaidInDocument(sourceDoc, (source) =>
        bundle.mermaidToExcalidrawElements(source),
      )
      if (errors.length) {
        for (const message of errors) {
          showToast({ variant: "error", title: "Diagram could not render", description: message })
        }
      }
      if (expanded === 0) return
      commitScene(nextDoc.elements, nextDoc.files ?? {}, latestAppState)
    } finally {
      expandingMermaid = false
      gateMermaidExpand = false
    }
  }

  const gridEnabled = createMemo(() => {
    const vp = viewport()
    return vp.gridSize > 0 && vp.zoom >= 0.05
  })

  const canvasBackground = () =>
    resolveWhiteboardCanvasBackground(studioTheme(), hostEl ?? document.documentElement)

  const mergeAppState = (base: Record<string, unknown>) => {
    const { viewBackgroundColor: _legacyBg, ...rest } = base
    return {
    ...STUDIO_WHITEBOARD_APP_STATE,
    ...rest,
    // Transparent — Studio paints `--background-base` on the host + dot grid underneath.
    viewBackgroundColor: "transparent",
    gridModeEnabled:
      typeof base.gridModeEnabled === "boolean"
        ? base.gridModeEnabled
        : STUDIO_WHITEBOARD_APP_STATE.gridModeEnabled,
    gridSize:
      typeof base.gridSize === "number" ? base.gridSize : (STUDIO_WHITEBOARD_APP_STATE.gridSize as number),
    showWelcomeScreen: false,
    openSidebar: null,
    // Studio default for new text — sans, not hand-drawn (users can still switch in the inspector).
    currentItemFontFamily: STUDIO_WHITEBOARD_APP_STATE.currentItemFontFamily,
  }
  }

  const syncCanvasBackground = () => {
    if (!api) return
    const merged = mergeAppState(latestAppState)
    latestAppState = merged
    suppressChange = true
    try {
      api.updateScene({ appState: { viewBackgroundColor: "transparent" } })
    } finally {
      queueMicrotask(() => {
        suppressChange = false
        paintDots()
      })
    }
  }

  const applyScene = async (doc: WhiteboardDocument) => {
    if (!api) return false
    const scene = prepareExcalidrawInitialData(doc)
    if (docHasPendingMermaid(doc)) gateMermaidExpand = true
    const bundle = await loadExcalidrawBundle()
    const elements = bundle.normalizeWhiteboardElements(scene.elements)
    sceneElements = minimapElementsFromScene(elements)
    latestElements = elements
    latestFiles = scene.files
    const appState = mergeAppState(scene.appState)
    setViewport((prev) => ({ ...prev, ...readViewport(appState), theme: studioTheme() }))
    suppressChange = true
    try {
      api.updateScene({
        elements: [...elements],
        appState,
        files: scene.files,
      })
    } finally {
      queueMicrotask(() => {
        suppressChange = false
        paintDots()
        syncMinimap()
        void expandPendingMermaid(doc)
      })
    }
    return true
  }

  const scheduleLayoutSync = () => {
    paintDots()
    syncMinimap()
    // Excalidraw listens to window resize for updateDOMRect; host flex resizes (e.g.
    // projection panel) do not always trigger the container ResizeObserver in time.
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"))
    })
  }

  const renderExcalidraw = async (doc: WhiteboardDocument) => {
    if (!rootEl) return
    setLoading(true)
    setError(null)
    try {
      repairExcalidrawLocalStorage(excalidrawStorageKeysForPath(props.storageName))
      const { Excalidraw, React, createRoot, normalizeWhiteboardElements } = await loadExcalidrawBundle()
      reactRoot?.unmount()
      api = undefined
      const mount = createRoot(rootEl)
      reactRoot = mount
      const scene = prepareExcalidrawInitialData(doc)
      if (docHasPendingMermaid(doc)) gateMermaidExpand = true
      const appState = mergeAppState(scene.appState)
      latestAppState = appState
      setViewport((prev) => ({ ...prev, ...readViewport(appState), theme: studioTheme() }))
      const elements = normalizeWhiteboardElements(scene.elements)
      sceneElements = minimapElementsFromScene(elements)
      latestElements = elements
      latestFiles = scene.files
      const excalidrawProps = {
        theme: studioTheme(),
        name: props.storageName,
        UIOptions: STUDIO_WHITEBOARD_UI_OPTIONS,
        initialData: {
          elements: [...elements],
          appState,
          files: scene.files,
        },
        excalidrawAPI: (instance: ExcalidrawApi) => {
          api = instance
          // initialData already carries mergeAppState; defer API work until _App is mounted.
          afterExcalidrawMounted(() => {
            props.onHostReady?.({ exportPreview })
            suppressChange = true
            try {
              api?.updateScene({ appState: { openSidebar: null } })
            } finally {
              queueMicrotask(() => {
                suppressChange = false
              })
            }
            syncCanvasBackground()
            scheduleLayoutSync()
            if ((props.sceneRevision ?? 0) > 0) {
              void applyScene(untrack(() => props.initialData))
            } else {
              void expandPendingMermaid(untrack(() => props.initialData))
            }
          })
        },
        onChange: (
          elements: readonly Record<string, unknown>[],
          appState: Record<string, unknown>,
          files: Record<string, unknown>,
        ) => {
          const normalizedElements = normalizeEmbeddableElements(elements)
          const linksFixed = normalizedElements !== elements

          sceneElements = minimapElementsFromScene(normalizedElements)
          latestElements = normalizedElements
          latestFiles = files
          const next = readViewport(appState)
          setViewport((prev) => ({ ...prev, ...next, theme: studioTheme() }))
          noteZoomChange(next.zoom)
          notePanChange(next.scrollX, next.scrollY)
          syncMinimap()
          latestAppState = mergeAppState(appState)

          if (gateMermaidExpand) return
          if (suppressChange) return

          // One-shot: rewrite watch/share URLs to embed URLs so iframes render.
          if (linksFixed && api) {
            suppressChange = true
            queueMicrotask(() => {
              api?.updateScene({ elements: [...normalizedElements] })
              queueMicrotask(() => {
                suppressChange = false
              })
            })
          }

          props.onChange({ elements: normalizedElements, appState: latestAppState, files })
        },
      }
      const renderTree = (theme: "light" | "dark") =>
        React.createElement(Excalidraw, { ...excalidrawProps, theme } as never)
      mount.render(renderTree(studioTheme()))
      patchExcalidrawTheme = (theme) => {
        reactRoot?.render(renderTree(theme))
      }
      popoverFlipCleanup?.()
      popoverFlipCleanup = rootEl ? installExcalidrawPopoverFlip(rootEl) : undefined
      ensureMinimap()
      ensureZoomWheelListener()
      queueMicrotask(() => {
        scheduleLayoutSync()
        void expandPendingMermaid(doc)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const exportPreview = async (): Promise<Blob | null> => {
    if (!api) return null
    const elements = (api.getSceneElements?.() ?? latestElements).filter((el) => el.isDeleted !== true)
    if (!elements.length) return null
    try {
      const { exportToBlob } = await loadExcalidrawBundle()
      const dark = studioTheme() === "dark"
      return await exportToBlob({
        elements,
        appState: {
          ...latestAppState,
          exportBackground: true,
          exportWithDarkMode: dark,
          viewBackgroundColor: canvasBackground(),
        },
        files: latestFiles,
        mimeType: "image/png",
        exportPadding: 16,
      })
    } catch {
      return null
    }
  }

  onMount(() => {
    void renderExcalidraw(props.initialData)
    ensureZoomWheelListener()
    const ro = new ResizeObserver(() => {
      scheduleLayoutSync()
    })
    if (hostEl) ro.observe(hostEl)
    const themeObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            if (!api) return
            afterExcalidrawMounted(() => syncCanvasBackground())
          })
        : undefined
    themeObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-scheme", "data-theme"],
    })
    onCleanup(() => {
      ro.disconnect()
      themeObserver?.disconnect()
    })
  })

  createEffect(() => {
    viewport()
    studioTheme()
    paintDots()
    syncMinimap()
  })

  createEffect(
    on(
      () => studioTheme(),
      (theme) => {
        patchExcalidrawTheme?.(theme)
        if (!api) return
        afterExcalidrawMounted(() => syncCanvasBackground())
      },
    ),
  )

  createEffect(
    on(
      () => props.sceneRevision ?? 0,
      (revision, prev) => {
        if (prev === undefined) return
        if (revision === prev) return
        void applyScene(untrack(() => props.initialData))
      },
    ),
  )

  onCleanup(() => {
    popoverFlipCleanup?.()
    popoverFlipCleanup = undefined
    if (hideZoomHudTimer) clearTimeout(hideZoomHudTimer)
    hideZoomHudTimer = undefined
    zoomWheelCleanup?.()
    zoomWheelCleanup = undefined
    lastZoom = undefined
    minimap?.destroy()
    minimap = undefined
    patchExcalidrawTheme = undefined
    reactRoot?.unmount()
    reactRoot = undefined
    api = undefined
    if (rootEl) rootEl.textContent = ""
  })

  return (
    <div
      ref={(el) => (hostEl = el)}
      class="excalidraw-host"
      data-color-scheme={studioTheme()}
    >
      <canvas
        ref={(el) => (dotCanvas = el)}
        class="excalidraw-host__dot-grid"
        classList={{ "excalidraw-host__dot-grid--hidden": !gridEnabled() }}
        aria-hidden
      />
      <div ref={(el) => (rootEl = el)} class="excalidraw-host__canvas h-full w-full min-h-0" />
      <div
        class="excalidraw-host__zoom-hud"
        classList={{ "excalidraw-host__zoom-hud--visible": zoomHudVisible() }}
        aria-hidden={!zoomHudVisible()}
      >
        <button
          type="button"
          class="excalidraw-host__zoom-hud-btn"
          aria-label="Zoom out"
          onClick={() => setZoom(viewport().zoom / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          class="excalidraw-host__zoom-hud-label"
          aria-label="Reset zoom to 100%"
          onClick={() => setZoom(1)}
        >
          {formatZoomLabel(viewport().zoom)}
        </button>
        <button
          type="button"
          class="excalidraw-host__zoom-hud-btn"
          aria-label="Zoom in"
          onClick={() => setZoom(viewport().zoom * ZOOM_STEP)}
        >
          +
        </button>
      </div>
      <Show when={loading()}>
        <div class="absolute inset-0 flex items-center justify-center bg-panel text-text-weak text-13-regular">
          Loading whiteboard…
        </div>
      </Show>
      <Show when={error()}>
        {(message) => (
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel px-6 text-center">
            <p class="text-13-medium text-text-strong">Could not load Excalidraw</p>
            <p class="text-12-regular text-red-400 max-w-md">{message()}</p>
            <p class="text-12-regular text-text-weak max-w-md">
              From the turtlecode repo root, run <code class="font-mono">bun install</code> to install{" "}
              <code class="font-mono">@excalidraw/excalidraw</code>, then restart the dev server.
            </p>
          </div>
        )}
      </Show>
    </div>
  )
}

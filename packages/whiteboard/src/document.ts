/** Excalidraw JSON stored in `.whiteboard` files. */

import { repairElementIndices } from "./indices"
import { normalizeTextElements } from "./text-layout"
import { EXCALIDRAW_FONT_HELVETICA, WHITEBOARD_EXT } from "./ontology"

export { WHITEBOARD_EXT }

export type WhiteboardDocument = {
  type: "excalidraw"
  version: number
  elements: readonly Record<string, unknown>[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

/** Not persisted — host injects from Studio `--background-base` at render time. */
export const EPHEMERAL_APP_STATE_KEYS = ["collaborators", "viewBackgroundColor"] as const
export const EXCALIDRAW_DEFAULT_STORAGE_KEY = "excalidraw"

export function excalidrawLocalStorageKey(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120)
  return `${EXCALIDRAW_DEFAULT_STORAGE_KEY}-${slug || "untitled"}`
}

export function isWhiteboardPath(path: string): boolean {
  return path.toLowerCase().endsWith(".whiteboard")
}

export { EXCALIDRAW_FONT_CASCADIA, EXCALIDRAW_FONT_HELVETICA } from "./ontology"

/** Default canvas settings for Trellis Studio whiteboards. */
export const STUDIO_WHITEBOARD_APP_STATE: Record<string, unknown> = {
  gridSize: 20,
  gridStep: 5,
  /** Trellis renders a dot grid overlay; keep Excalidraw line grid off to avoid doubling. */
  gridModeEnabled: false,
  showWelcomeScreen: false,
  /** Studio hides the library sidebar; never reserve dock width. */
  openSidebar: null,
  /** Sans default for new text (not Virgil / Excalifont hand-drawn). */
  currentItemFontFamily: EXCALIDRAW_FONT_HELVETICA,
}

/** Excalidraw UI state Trellis does not persist (host CSS owns layout/chrome). */
const STRIP_APP_STATE_KEYS = new Set([
  ...EPHEMERAL_APP_STATE_KEYS,
  "openSidebar",
  "defaultSidebarDockedPreference",
])

/** Excalidraw chrome trimmed for Trellis Studio (see excalidraw-host.css for layout). */
export const STUDIO_WHITEBOARD_UI_OPTIONS: Record<string, unknown> = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: {
    image: true,
  },
}

export function emptyWhiteboard(): WhiteboardDocument {
  return {
    type: "excalidraw",
    version: 2,
    elements: [],
    appState: { ...STUDIO_WHITEBOARD_APP_STATE },
    files: {},
  }
}

function normalizeDocument(doc: WhiteboardDocument): WhiteboardDocument {
  return {
    ...doc,
    elements: normalizeTextElements(doc.elements),
    appState: sanitizeAppStateForStorage({
      ...STUDIO_WHITEBOARD_APP_STATE,
      ...doc.appState,
      gridSize:
        typeof doc.appState?.gridSize === "number"
          ? doc.appState.gridSize
          : STUDIO_WHITEBOARD_APP_STATE.gridSize,
      gridModeEnabled:
        typeof doc.appState?.gridModeEnabled === "boolean"
          ? doc.appState.gridModeEnabled
          : STUDIO_WHITEBOARD_APP_STATE.gridModeEnabled,
    }),
  }
}

export function sanitizeAppStateForStorage(appState: unknown): Record<string, unknown> {
  const defaults = emptyWhiteboard().appState ?? {}
  if (!appState || typeof appState !== "object") return { ...defaults }
  const next: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(appState as Record<string, unknown>)) {
    if (STRIP_APP_STATE_KEYS.has(key)) continue
    next[key] = value
  }
  return next
}

export function prepareExcalidrawScene(doc: WhiteboardDocument): {
  elements: WhiteboardDocument["elements"]
  appState: Record<string, unknown>
  files: Record<string, unknown>
} {
  const normalized = normalizeDocument(doc)
  return {
    elements: normalized.elements,
    appState: sanitizeAppStateForStorage(normalized.appState),
    files: normalized.files ?? {},
  }
}

export function prepareExcalidrawInitialData(doc: WhiteboardDocument): {
  elements: WhiteboardDocument["elements"]
  appState: Record<string, unknown>
  files: Record<string, unknown>
} {
  const stored = sanitizeAppStateForStorage(doc.appState)
  return {
    elements: doc.elements,
    appState: {
      ...stored,
      collaborators: new Map(),
    },
    files: doc.files ?? {},
  }
}

function stripInvalidCollaborators(appState: unknown): void {
  if (!appState || typeof appState !== "object") return
  const collaborators = (appState as Record<string, unknown>).collaborators
  if (collaborators == null) return
  if (collaborators instanceof Map) return
  delete (appState as Record<string, unknown>).collaborators
}

/** Fix Excalidraw browser storage JSON where `collaborators` became a plain object. */
export function repairExcalidrawLocalStorage(keys: string[]): void {
  if (typeof localStorage === "undefined") return
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw) as { appState?: unknown; elements?: unknown }
      const beforeAppState = JSON.stringify(data.appState ?? {})
      const beforeElements = JSON.stringify(data.elements ?? [])
      stripInvalidCollaborators(data.appState)
      if (data.appState && typeof data.appState === "object") {
        const app = data.appState as Record<string, unknown>
        if (app.openSidebar != null) app.openSidebar = null
        delete app.viewBackgroundColor
      }
      if (Array.isArray(data.elements)) {
        data.elements = repairElementIndices(data.elements as Record<string, unknown>[])
      }
      if (
        JSON.stringify(data.appState ?? {}) !== beforeAppState ||
        JSON.stringify(data.elements ?? []) !== beforeElements
      ) {
        localStorage.setItem(key, JSON.stringify(data))
      }
    } catch {
      localStorage.removeItem(key)
    }
  }
}

export function excalidrawStorageKeysForPath(filePath: string): string[] {
  const perFile = excalidrawLocalStorageKey(filePath)
  return perFile === EXCALIDRAW_DEFAULT_STORAGE_KEY
    ? [EXCALIDRAW_DEFAULT_STORAGE_KEY]
    : [EXCALIDRAW_DEFAULT_STORAGE_KEY, perFile]
}

export type WhiteboardInspectResult =
  | { status: "empty" }
  | { status: "valid"; doc: WhiteboardDocument }
  | { status: "invalid"; kind: "json" | "schema"; message: string }

function readWhiteboardDocument(data: Partial<WhiteboardDocument>): WhiteboardDocument {
  return normalizeDocument({
    type: "excalidraw",
    version: typeof data.version === "number" ? data.version : 2,
    elements: data.elements as WhiteboardDocument["elements"],
    appState: sanitizeAppStateForStorage(data.appState),
    files: data.files ?? {},
  })
}

/** Classify on-disk JSON before falling back to an empty scene. */
export function inspectWhiteboardRaw(raw: string): WhiteboardInspectResult {
  const trimmed = raw.trim()
  if (!trimmed) return { status: "empty" }
  try {
    const data = JSON.parse(trimmed) as Partial<WhiteboardDocument>
    if (data?.type === "excalidraw" && Array.isArray(data.elements)) {
      return { status: "valid", doc: readWhiteboardDocument(data) }
    }
    return {
      status: "invalid",
      kind: "schema",
      message: 'Expected { "type": "excalidraw", "elements": [...] }',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: "invalid", kind: "json", message }
  }
}

export function parseWhiteboard(raw: string): WhiteboardDocument {
  const inspected = inspectWhiteboardRaw(raw)
  if (inspected.status === "valid") return inspected.doc
  return emptyWhiteboard()
}

export function serializeWhiteboard(doc: WhiteboardDocument): string {
  const normalized = normalizeDocument({
    ...doc,
    files: doc.files ?? {},
  })
  return `${JSON.stringify(normalized, null, 2)}\n`
}

export function whiteboardTitle(path: string): string {
  const name = path.split("/").pop() ?? path
  if (!name.toLowerCase().endsWith(".whiteboard")) return name
  return name.slice(0, -".whiteboard".length) || "Untitled"
}

export { defaultWhiteboardPath, dedupeWhiteboardPath, slugifyWhiteboardTitle } from "./paths"

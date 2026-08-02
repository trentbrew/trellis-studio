import { describe, expect, test } from "bun:test"
import {
  emptyWhiteboard,
  excalidrawLocalStorageKey,
  excalidrawStorageKeysForPath,
  isWhiteboardPath,
  parseWhiteboard,
  prepareExcalidrawInitialData,
  prepareExcalidrawScene,
  repairExcalidrawLocalStorage,
  sanitizeAppStateForStorage,
  serializeWhiteboard,
  STUDIO_WHITEBOARD_APP_STATE,
  whiteboardTitle,
  defaultWhiteboardPath,
  EXCALIDRAW_DEFAULT_STORAGE_KEY,
} from "./schema"

describe("whiteboard schema", () => {
  test("detects whiteboard paths", () => {
    expect(isWhiteboardPath("sketch.whiteboard")).toBe(true)
    expect(isWhiteboardPath("notes.md")).toBe(false)
  })

  test("parses empty and invalid as empty document", () => {
    expect(parseWhiteboard("").type).toBe("excalidraw")
    expect(parseWhiteboard("not json").elements).toEqual([])
  })

  test("round-trips excalidraw json", () => {
    const doc = { ...emptyWhiteboard(), elements: [{ id: "a", type: "rectangle" }] }
    const parsed = parseWhiteboard(serializeWhiteboard(doc))
    expect(parsed.elements).toHaveLength(1)
  })

  test("derives title from path", () => {
    expect(whiteboardTitle("@canvases/Plan.whiteboard")).toBe("Plan")
    expect(whiteboardTitle("whiteboards/Plan.whiteboard")).toBe("Plan")
  })

  test("builds per-file localStorage keys", () => {
    expect(excalidrawLocalStorageKey("@canvases/plan.whiteboard")).toBe("excalidraw--canvases-plan-whiteboard")
    expect(excalidrawStorageKeysForPath("@canvases/plan.whiteboard")).toContain(EXCALIDRAW_DEFAULT_STORAGE_KEY)
  })

  test("defaultWhiteboardPath uses @canvases", () => {
    expect(defaultWhiteboardPath()).toBe("@canvases/untitled.whiteboard")
  })
})

describe("sanitizeAppStateForStorage", () => {
  test("drops collaborators saved as empty object from JSON round-trip", () => {
    const raw = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
        collaborators: {},
      },
      files: {},
    })
    const doc = parseWhiteboard(raw)
    expect(doc.appState?.collaborators).toBeUndefined()
    expect(prepareExcalidrawScene(doc).appState.collaborators).toBeUndefined()
  })

  test("drops collaborators saved as array (legacy / mistaken export)", () => {
    const doc = parseWhiteboard(
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [],
        appState: { collaborators: [{ id: "1" }] },
      }),
    )
    expect(doc.appState?.collaborators).toBeUndefined()
  })

  test("strips Map collaborators from live Excalidraw onChange appState", () => {
    const collaborators = new Map([["id1", { username: "Ada" }]])
    const out = sanitizeAppStateForStorage({
      viewBackgroundColor: "#edf2ff",
      collaborators,
    })
    expect(out.collaborators).toBeUndefined()
    expect(out.viewBackgroundColor).toBeUndefined()
  })

  test("serialize never writes collaborators", () => {
    const json = serializeWhiteboard({
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {
        viewBackgroundColor: "#fff",
        collaborators: { stale: true },
      },
      files: {},
    })
    const parsed = JSON.parse(json) as { appState?: Record<string, unknown> }
    expect(parsed.appState?.collaborators).toBeUndefined()
    expect(parsed.appState?.viewBackgroundColor).toBeUndefined()
  })

  test("defaults include dot grid spacing (overlay; line grid off)", () => {
    expect(emptyWhiteboard().appState?.gridModeEnabled).toBe(false)
    expect(emptyWhiteboard().appState?.gridSize).toBe(STUDIO_WHITEBOARD_APP_STATE.gridSize)
  })

  test("parse expands undersized autoResize text", () => {
    const raw = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [
        {
          id: "t1",
          type: "text",
          text: "line one\nline two\nline three",
          autoResize: true,
          width: 40,
          height: 20,
          fontSize: 20,
          lineHeight: 1.25,
        },
      ],
    })
    const parsed = parseWhiteboard(raw)
    const text = parsed.elements[0] as { width?: number; height?: number }
    expect(text.width).toBeGreaterThan(40)
    expect(text.height).toBeGreaterThan(20)
  })

  test("prepareExcalidrawInitialData supplies Map collaborators", () => {
    const scene = prepareExcalidrawInitialData(
      parseWhiteboard(
        JSON.stringify({
          type: "excalidraw",
          version: 2,
          elements: [{ id: "x", type: "rectangle" }],
          appState: { collaborators: {} },
        }),
      ),
    )
    expect(scene.elements).toHaveLength(1)
    expect(scene.appState.collaborators).toBeInstanceOf(Map)
    expect((scene.appState.collaborators as Map<string, unknown>).size).toBe(0)
  })
})

describe("repairExcalidrawLocalStorage", () => {
  test("strips object collaborators from browser storage JSON", () => {
    if (typeof localStorage === "undefined") return
    const key = "excalidraw-test-repair"
    localStorage.setItem(key, JSON.stringify({ appState: { collaborators: { bad: true } }, elements: [] }))
    repairExcalidrawLocalStorage([key])
    const fixed = JSON.parse(localStorage.getItem(key)!) as { appState?: Record<string, unknown> }
    expect(fixed.appState?.collaborators).toBeUndefined()
    localStorage.removeItem(key)
  })

  test("strips viewBackgroundColor from browser storage JSON", () => {
    if (typeof localStorage === "undefined") return
    const key = "excalidraw-test-repair-bg"
    localStorage.setItem(
      key,
      JSON.stringify({ appState: { viewBackgroundColor: "#ffffff" }, elements: [] }),
    )
    repairExcalidrawLocalStorage([key])
    const fixed = JSON.parse(localStorage.getItem(key)!) as { appState?: Record<string, unknown> }
    expect(fixed.appState?.viewBackgroundColor).toBeUndefined()
    localStorage.removeItem(key)
  })
})

describe("sanitizeAppStateForStorage", () => {
  test("does not persist viewBackgroundColor", () => {
    const out = sanitizeAppStateForStorage({ viewBackgroundColor: "#ffffff", gridSize: 24 })
    expect(out.viewBackgroundColor).toBeUndefined()
    expect(out.gridSize).toBe(24)
  })
})

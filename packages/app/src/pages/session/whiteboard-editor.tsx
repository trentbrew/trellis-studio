import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { Braces, TriangleAlert } from "lucide-solid"
import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import {
  emptyWhiteboard,
  inspectWhiteboardRaw,
  parseWhiteboard,
  sanitizeAppStateForStorage,
  serializeWhiteboard,
  whiteboardTitle,
  type WhiteboardDocument,
  type WhiteboardInspectResult,
} from "@/lib/whiteboard/schema"
import { persistWhiteboardRenderSidecar } from "@/lib/whiteboard/render-sidecar"
import { CodeEditor } from "./file-editor"
import { ResizableSidebarToggle } from "@/components/route"
import { ExcalidrawHost, type ExcalidrawChangePayload, type ExcalidrawHostHandle } from "./excalidraw-host"

type EditorStore = {
  dirty: boolean
  saving: boolean
  error?: string
  loading: boolean
}

const AUTO_SAVE_MS = 400

/** Stable signature of a scene's element set (ids + count) — ignores viewport/appState churn. */
function elementsKey(elements: readonly Record<string, unknown>[]): string {
  return `${elements.length}:${elements.map((el) => String(el?.id ?? "")).join(",")}`
}

export function WhiteboardEditor(props: {
  active: boolean
  path: string
  /** Fullscreen inside the Whiteboards projection (sidebar navigation; no back button). */
  variant?: "tab" | "projection"
  onBack?: () => void
}) {
  const projection = () => props.variant === "projection"
  const file = useFile()
  const sdk = useSDK()
  const themeCtx = useTheme()
  const [state, setState] = createStore<EditorStore>({ dirty: false, saving: false, loading: true })
  const [doc, setDoc] = createSignal<WhiteboardDocument>(emptyWhiteboard())
  const [sceneRevision, setSceneRevision] = createSignal(0)
  const [showJson, setShowJson] = createSignal(false)
  const [jsonSource, setJsonSource] = createSignal("")
  const [parseIssue, setParseIssue] = createSignal<Extract<WhiteboardInspectResult, { status: "invalid" }> | null>(
    null,
  )
  let off: VoidFunction | undefined
  let seq = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastWritten = ""
  let applyingExternal = false
  // Excalidraw echoes initialData via onChange on mount; that echo (same elements, only
  // viewport/appState differ) must not autosave over a board the agent just wrote, or it
  // clobbers pending mermaid placeholders. Real edits and the mermaid expand change the
  // element set, so they pass through.
  let hydrating = false
  let hydrationKey = ""
  let excalidrawHost: ExcalidrawHostHandle | undefined

  const jsonText = createMemo(() => serializeWhiteboard(doc()))

  const isValidWhiteboardJson = (raw: string) => {
    try {
      const data = JSON.parse(raw) as Partial<WhiteboardDocument>
      return data?.type === "excalidraw" && Array.isArray(data.elements)
    } catch {
      return false
    }
  }

  const applyJsonSource = (raw: string, save = true) => {
    setJsonSource(raw)
    if (!isValidWhiteboardJson(raw)) {
      const inspected = inspectWhiteboardRaw(raw)
      setParseIssue(inspected.status === "invalid" ? inspected : null)
      return false
    }
    setParseIssue(null)
    const parsed = parseWhiteboard(raw)
    const snapshot = serializeWhiteboard(parsed)
    if (snapshot !== serializeWhiteboard(doc())) {
      applyingExternal = true
      setDoc(parsed)
      setSceneRevision((n) => n + 1)
      setState("dirty", true)
      queueMicrotask(() => {
        applyingExternal = false
      })
    }
    if (save) {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void saveDocument(parsed)
      }, AUTO_SAVE_MS)
    }
    return true
  }

  const toggleJson = () => {
    if (!showJson()) {
      setJsonSource(jsonText())
      setShowJson(true)
      return
    }
    if (!applyJsonSource(jsonSource(), true)) {
      showToast({
        variant: "error",
        title: "Invalid whiteboard JSON",
        description: "Fix syntax errors before returning to the canvas.",
      })
      return
    }
    setShowJson(false)
  }

  const excalidrawTheme = createMemo((): "light" | "dark" => {
    themeCtx.mode()
    themeCtx.colorScheme()
    const applied = document.documentElement.dataset.colorScheme
    if (applied === "dark" || applied === "light") return applied
    return themeCtx.mode() === "dark" ? "dark" : "light"
  })

  const diskSnapshot = createMemo(() => {
    props.path
    const raw = file.text(props.path)
    if (raw === undefined) return undefined
    return serializeWhiteboard(parseWhiteboard(raw))
  })

  const persistRenderSidecar = async (next: WhiteboardDocument) => {
    if (showJson() || !excalidrawHost) return
    try {
      await persistWhiteboardRenderSidecar({
        file: sdk.client.file,
        whiteboardPath: props.path,
        doc: next,
        exportPreview: () => excalidrawHost!.exportPreview(),
      })
    } catch {
      // Render sidecar is best-effort — JSON save already succeeded.
    }
  }

  const saveDocument = async (next: WhiteboardDocument) => {
    const payload = serializeWhiteboard(next)
    setState("saving", true)
    try {
      await sdk.client.file.write({
        fileWriteInput: {
          path: props.path,
          content: payload,
          format: false,
        },
      })
      lastWritten = payload
      await persistRenderSidecar(next)
      setState({ dirty: false, saving: false })
      file.touchState(props.path)
      return true
    } catch (e) {
      setState("saving", false)
      showToast({
        variant: "error",
        title: "Failed to save whiteboard",
        description: e instanceof Error ? e.message : String(e),
      })
      return false
    }
  }

  const queueSave = (payload: ExcalidrawChangePayload) => {
    if (applyingExternal) return
    const next: WhiteboardDocument = {
      type: "excalidraw",
      version: 2,
      elements: payload.elements,
      appState: sanitizeAppStateForStorage(payload.appState),
      files: payload.files,
    }
    const serialized = serializeWhiteboard(next)
    // Swallow the mount echo (same elements as loaded) and any onChange that already
    // matches disk, so a freshly-loaded or agent-written board is never re-saved over itself.
    if (hydrating && elementsKey(payload.elements) === hydrationKey) {
      hydrating = false
      setDoc(next)
      return
    }
    hydrating = false
    if (serialized === lastWritten) {
      setDoc(next)
      return
    }
    setDoc(next)
    setState("dirty", true)
    file.touchState(props.path)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void saveDocument(next)
    }, AUTO_SAVE_MS)
  }

  const saveNow = async () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = undefined
    if (showJson() && isValidWhiteboardJson(jsonSource())) {
      return saveDocument(parseWhiteboard(jsonSource()))
    }
    return saveDocument(doc())
  }

  const applyExternalDocument = (parsed: WhiteboardDocument) => {
    const snapshot = serializeWhiteboard(parsed)
    if (snapshot === serializeWhiteboard(doc())) return
    if (snapshot === lastWritten) return
    applyingExternal = true
    // A queued autosave from before this external write would otherwise clobber it.
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
    setDoc(parsed)
    setSceneRevision((n) => n + 1)
    setState("dirty", false)
    const disk = diskSnapshot()
    if (disk && snapshot !== disk) {
      lastWritten = snapshot
      void saveDocument(parsed)
    }
    queueMicrotask(() => {
      applyingExternal = false
    })
  }

  const applyParsedDocument = (
    parsed: WhiteboardDocument,
    issue: Extract<WhiteboardInspectResult, { status: "invalid" }> | null,
  ) => {
    setParseIssue(issue)
    lastWritten = serializeWhiteboard(parsed)
    hydrating = true
    hydrationKey = elementsKey(parsed.elements)
    setDoc(parsed)
    setSceneRevision((n) => n + 1)
  }

  const load = async () => {
    const id = ++seq
    off?.()
    setState({ dirty: false, saving: false, error: undefined, loading: true })
    await file.load(props.path, { force: true })
    if (id !== seq) return
    const raw = file.text(props.path) ?? ""
    const inspected = inspectWhiteboardRaw(raw)
    const parsed = inspected.status === "valid" ? inspected.doc : emptyWhiteboard()
    applyParsedDocument(
      parsed,
      inspected.status === "invalid" ? inspected : null,
    )
    off = file.registerSave(props.path, {
      dirty: () => state.dirty,
      save: () => {
        void saveNow()
        return true
      },
    })
    setState("loading", false)
  }

  createEffect(() => {
    props.path
    void load().catch((e) => {
      setState({ dirty: false, saving: false, error: e instanceof Error ? e.message : String(e), loading: false })
      showToast({
        variant: "error",
        title: "Whiteboard load failed",
        description: e instanceof Error ? e.message : String(e),
      })
    })
  })

  createEffect(() => {
    if (showJson()) return
    jsonText()
    setJsonSource(jsonText())
  })

  createEffect(() => {
    const snapshot = diskSnapshot()
    if (showJson()) return
    if (snapshot === undefined || state.loading) return
    if (snapshot === lastWritten) return
    const raw = file.text(props.path) ?? ""
    const inspected = inspectWhiteboardRaw(raw)
    if (inspected.status === "valid") {
      setParseIssue(null)
      applyExternalDocument(inspected.doc)
      return
    }
    if (inspected.status === "invalid") {
      setParseIssue(inspected)
    }
  })

  onCleanup(() => {
    seq++
    if (saveTimer) clearTimeout(saveTimer)
    if (state.dirty) void saveNow()
    off?.()
  })

  const saveStatus = createMemo(() => {
    if (state.saving) return "Saving…"
    if (state.dirty) return "Unsaved"
    return "Saved"
  })

  return (
    <div class="h-full min-h-0 flex flex-col bg-panel">
      <div
        classList={{
          "h-10 flex items-center justify-between border-b border-border-weaker-base px-3 gap-3": true,
          "whiteboard-editor-toolbar--projection": projection(),
        }}
      >
        <div class="min-w-0 flex items-center gap-2 text-13-regular">
          <Show when={projection()}>
            <ResizableSidebarToggle />
          </Show>
          <Show when={!projection()}>
            <Icon name="pencil-line" size="small" class="text-text-weak shrink-0" />
          </Show>
          <span class="truncate text-text-base">{whiteboardTitle(props.path)}</span>
          <span
            classList={{
              "text-12-regular shrink-0": true,
              "text-text-weak": !state.dirty && !state.saving && !parseIssue(),
              "text-amber-400": (state.dirty && !state.saving) || !!parseIssue(),
              "text-text-weaker": state.saving,
            }}
          >
            {parseIssue() ? "Invalid JSON" : saveStatus()}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button
            size="small"
            variant={showJson() ? "primary" : "secondary"}
            aria-pressed={showJson()}
            title={showJson() ? "Show canvas" : "Show JSON source"}
            onClick={toggleJson}
          >
            <Braces class="size-4" />
            <span>JSON</span>
          </Button>
          <Show when={!projection()}>
            <Button
              size="small"
              variant="secondary"
              disabled={state.loading || (!state.dirty && !state.saving)}
              onClick={() => void saveNow()}
            >
              Save now
            </Button>
          </Show>
        </div>
      </div>
      <div class="relative min-h-0 min-w-0 flex-1 bg-background-base overflow-hidden">
        <Switch>
          <Match when={showJson()}>
            <CodeEditor
              path={`${props.path}.json`}
              value={jsonSource()}
              active={props.active && showJson()}
              onChange={(raw) => applyJsonSource(raw, true)}
            />
          </Match>
          <Match when={!showJson()}>
            <Show when={!state.loading && !state.error && props.path} keyed>
              {(path) => (
                <>
                  <ExcalidrawHost
                    storageName={path}
                    initialData={doc()}
                    sceneRevision={sceneRevision()}
                    theme={excalidrawTheme()}
                    onChange={queueSave}
                    onHostReady={(handle) => {
                      excalidrawHost = handle
                    }}
                  />
                  <Show when={parseIssue()}>
                    {(issue) => (
                      <div
                        class="absolute left-3 right-3 top-3 z-30 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 backdrop-blur-sm"
                        role="alert"
                      >
                        <TriangleAlert class="size-4 text-amber-400 shrink-0 mt-0.5" aria-hidden />
                        <div class="min-w-0 flex-1">
                          <p class="text-12-medium text-text-strong">
                            {issue().kind === "json" ? "Malformed whiteboard JSON" : "Invalid whiteboard document"}
                          </p>
                          <p class="text-11-regular text-text-weak mt-0.5 break-words">{issue().message}</p>
                          <p class="text-11-regular text-text-weaker mt-1">
                            Showing an empty canvas until the source file is repaired.
                          </p>
                        </div>
                        <Button size="small" variant="secondary" class="shrink-0" onClick={toggleJson}>
                          Edit JSON
                        </Button>
                      </div>
                    )}
                  </Show>
                </>
              )}
            </Show>
            <Show when={state.loading}>
              <div class="absolute inset-0 flex items-center justify-center bg-background-base text-text-weak">
                Loading whiteboard...
              </div>
            </Show>
            <Show when={state.error}>
              {(err) => (
                <div class="absolute inset-0 flex items-center justify-center bg-background-base text-red-400 px-6 text-center">
                  {err()}
                </div>
              )}
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

export default WhiteboardEditor

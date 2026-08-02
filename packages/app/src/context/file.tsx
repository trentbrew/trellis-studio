import { batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@opencode-ai/ui/toast"
import { useParams } from "@solidjs/router"
import { getFilename } from "@opencode-ai/util/path"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { createPathHelpers } from "./file/path"
import {
  approxBytes,
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  hasFileContent,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"
import { createFileViewCache } from "./file/view-cache"
import { createFileTreeStore } from "./file/tree-store"
import { projectionWhiteboard } from "@/lib/whiteboard/active-projection"
import { invalidateFromWatcher } from "./file/watcher"
import { parentDir, parseWorkspaceFileWatcherEvent, shouldBumpWorkspaceFileCatalog } from "./file/catalog"
import { completedFileMutationPaths } from "@/lib/agent-ui-sync"
import {
  selectionFromLines,
  type FileState,
  type FileSelection,
  type FileViewState,
  type SelectedLineRange,
} from "./file/types"

export type { FileSelection, SelectedLineRange, FileViewState, FileState }
export { selectionFromLines }
export {
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
}

type SaveHandler = {
  dirty: () => boolean
  save: (opts?: { format?: boolean }) => boolean | Promise<boolean>
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

function editable(content: FileState["content"] | undefined): content is NonNullable<FileState["content"]> {
  return content?.type === "text" && content.encoding !== "base64"
}

function markdown(file: string) {
  return /\.(md|markdown|mdx|note)$/i.test(file)
}

function richDefault(file: string) {
  return markdown(file) || /\.base$/i.test(file)
}

export const {
  use: useFile,
  provider: FileProvider,
  useOptional: useFileOptional,
} = createSimpleContext({
  name: "File",
  gate: false,
  init: () => {
    const sdk = useSDK()
    useSync()
    const params = useParams()
    const language = useLanguage()
    const layout = useLayout()

    const scope = createMemo(() => sdk.directory)
    const path = createPathHelpers(scope)
    const tabs = layout.tabs(() => params.dir ?? "")

    const inflight = new Map<string, Promise<void>>()
    let searchAbort: AbortController | undefined
    const handlers = new Map<string, SaveHandler>()
    const [catalogRevision, setCatalogRevision] = createSignal(0)
    const bumpCatalog = () => setCatalogRevision((n) => n + 1)

    // Recently created/changed paths, kept ~6s to drive the green fade highlight.
    const FRESH_MS = 6_000
    const [fresh, setFresh] = createStore<Record<string, true>>({})
    const freshTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const markFresh = (input: string) => {
      const file = path.normalize(input)
      if (!file) return
      setFresh(file, true)
      const existing = freshTimers.get(file)
      if (existing) clearTimeout(existing)
      freshTimers.set(
        file,
        setTimeout(() => {
          setFresh(produce((draft) => delete draft[file]))
          freshTimers.delete(file)
        }, FRESH_MS),
      )
    }
    const isFresh = (input: string) => fresh[path.normalize(input)] === true
    const clearFresh = () => {
      for (const timer of freshTimers.values()) clearTimeout(timer)
      freshTimers.clear()
      setFresh(reconcile({}))
    }

    const [store, setStore] = createStore<{
      file: Record<string, FileState>
    }>({
      file: {},
    })

    const tree = createFileTreeStore({
      scope,
      normalizeDir: path.normalizeDir,
      list: (dir) => sdk.client.file.list({ path: dir }).then((x) => x.data ?? []),
      onError: (message) => {
        showToast({
          variant: "error",
          title: language.t("toast.file.listFailed.title"),
          description: message,
        })
      },
    })

    const evictContent = (keep?: Set<string>) => {
      evictContentLru(keep, (target) => {
        if (!store.file[target]) return
        setStore(
          "file",
          target,
          produce((draft) => {
            draft.content = undefined
            draft.loaded = false
          }),
        )
      })
    }

    createEffect(() => {
      scope()
      searchAbort?.abort()
      searchAbort = undefined
      inflight.clear()
      handlers.clear()
      resetFileContentLru()
      clearFresh()
      batch(() => {
        setStore("file", reconcile({}))
        tree.reset()
        setCatalogRevision(0)
      })
    })

    const viewCache = createFileViewCache()
    const view = createMemo(() => viewCache.load(scope(), params.id))

    const ensure = (file: string) => {
      if (!file) return
      if (store.file[file]) return
      setStore("file", file, { path: file, name: getFilename(file) })
    }

    const setLoading = (file: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = true
          draft.error = undefined
        }),
      )
    }

    const setLoaded = (file: string, content: FileState["content"]) => {
      const prev = store.file[file]
      const prevText = editable(prev?.content) ? (prev.content?.content ?? "") : undefined
      const nextText = content && editable(content) ? content.content : undefined
      const nextDraft =
        nextText === undefined
          ? undefined
          : prev?.draft === undefined || prevText === undefined || prev.draft === prevText
            ? nextText
            : prev.draft
      const stale =
        nextText === undefined || prev?.draft === undefined || prevText === undefined
          ? false
          : prev.draft !== prevText && prev.draft !== nextText

      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loaded = true
          draft.loading = false
          draft.content = content
          draft.draft = nextDraft
          draft.saving = false
          draft.saveError = undefined
          draft.stale = stale
          draft.mode = draft.mode ?? (nextText === undefined ? undefined : richDefault(file) ? "rich" : undefined)
        }),
      )
    }

    const setLoadError = (file: string, message: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = false
          draft.error = message
        }),
      )
      showToast({
        variant: "error",
        title: language.t("toast.file.loadFailed.title"),
        description: message,
      })
    }

    const load = (input: string, options?: { force?: boolean }) => {
      const file = path.normalize(input)
      if (!file) return Promise.resolve()

      const directory = scope()
      const key = `${directory}\n${file}`
      ensure(file)

      const current = store.file[file]
      if (!options?.force && current?.loaded) return Promise.resolve()

      const pending = inflight.get(key)
      if (pending) return pending

      setLoading(file)

      const promise = sdk.client.file
        .read({ path: file })
        .then((x) => {
          if (scope() !== directory) return
          const content = x.data
          setLoaded(file, content)

          if (!content) return
          touchFileContent(file, approxBytes(content))
          evictContent(new Set([file]))
        })
        .catch((e) => {
          if (scope() !== directory) return
          setLoadError(file, errorMessage(e, language.t("error.chain.unknown")))
        })
        .finally(() => {
          inflight.delete(key)
        })

      inflight.set(key, promise)
      return promise
    }

    const search = (query: string, dirs: "true" | "false") => {
      searchAbort?.abort()
      searchAbort = new AbortController()
      const signal = searchAbort.signal
      const directory = scope()
      return sdk.client.find
        .files(
          {
            query,
            dirs,
            limit: 100,
            type: dirs === "false" ? "file" : undefined,
          },
          { signal },
        )
        .then(
          (x) => {
            if (signal.aborted || scope() !== directory) return []
            return (x.data ?? []).map(path.normalize)
          },
          () => [],
        )
    }

    const stop = sdk.event.listen((e) => {
      if (shouldBumpWorkspaceFileCatalog(e.details)) {
        bumpCatalog()
      }
      // Flag created/changed files for the green highlight.
      const watched = parseWorkspaceFileWatcherEvent(e.details)
      if (watched && (watched.kind === "add" || watched.kind === "change")) {
        markFresh(watched.path)
      }
      // Agent tool completions are a reliable refresh signal even if a watcher
      // event was missed: force a catalog bump and flag the touched paths.
      const toolPaths = completedFileMutationPaths(e.details)
      if (toolPaths) {
        bumpCatalog()
        for (const file of toolPaths) markFresh(file)
      }
      invalidateFromWatcher(e.details, {
        normalize: path.normalize,
        hasFile: (file) => Boolean(store.file[file]),
        isOpen: (file) => {
          const normalized = path.normalize(file)
          if (projectionWhiteboard.path() === normalized) return true
          return tabs.all().some((tab) => path.pathFromTab(tab) === normalized)
        },
        loadFile: (file) => {
          void load(file, { force: true })
        },
        node: tree.node,
        isDirLoaded: tree.isLoaded,
        refreshDir: (dir) => {
          void tree.listDir(dir, { force: true })
        },
      })
    })

    const get = (input: string) => {
      const file = path.normalize(input)
      const state = store.file[file]
      const content = state?.content
      if (!content) return state
      if (hasFileContent(file)) {
        touchFileContent(file)
        return state
      }
      touchFileContent(file, approxBytes(content))
      return state
    }

    const text = (input: string) => {
      const file = path.normalize(input)
      const state = get(file)
      const content = state?.content
      if (!editable(content)) return undefined
      return state.draft ?? content.content
    }

    const dirty = (input: string) => {
      const file = path.normalize(input)
      const state = store.file[file]
      const handler = handlers.get(file)
      if (handler) return handler.dirty()
      const content = state?.content
      if (!editable(content)) return false
      return (state.draft ?? content.content) !== content.content
    }

    const registerSave = (input: string, handler: SaveHandler) => {
      const file = path.normalize(input)
      handlers.set(file, handler)
      ensure(file)
      return () => {
        if (handlers.get(file) === handler) handlers.delete(file)
      }
    }

    const touchState = (input: string) => {
      const file = path.normalize(input)
      ensure(file)
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.version = (draft.version ?? 0) + 1
          draft.saveError = undefined
        }),
      )
    }

    const setDraft = (input: string, value: string) => {
      const file = path.normalize(input)
      const state = store.file[file]
      if (!editable(state?.content)) return
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.draft = value
          draft.saveError = undefined
        }),
      )
    }

    const setMode = (input: string, value: "rich" | "raw") => {
      const file = path.normalize(input)
      setStore("file", file, "mode", value)
    }

    const save = async (input: string, opts?: { format?: boolean }) => {
      const file = path.normalize(input)
      const state = store.file[file]
      const handler = handlers.get(file)
      if (handler) {
        if (!handler.dirty() && !state?.stale) return true
        const dir = scope()
        setStore(
          "file",
          file,
          produce((draft) => {
            draft.saving = true
            draft.saveError = undefined
          }),
        )
        return Promise.resolve(handler.save(opts))
          .then((ok) => {
            if (scope() !== dir) return false
            setStore(
              "file",
              file,
              produce((draft) => {
                draft.saving = false
                if (ok) draft.stale = false
                draft.version = (draft.version ?? 0) + 1
              }),
            )
            return ok
          })
          .catch((e) => {
            if (scope() !== dir) return false
            const message = errorMessage(e, language.t("error.chain.unknown"))
            setStore(
              "file",
              file,
              produce((draft) => {
                draft.saving = false
                draft.saveError = message
              }),
            )
            throw e
          })
      }
      const current = state?.content
      if (!editable(current)) return false
      const content = state.draft ?? current.content
      if (content === current.content && !state.stale) return true

      const dir = scope()
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.saving = true
          draft.saveError = undefined
        }),
      )

      console.debug("[file.save]", {
        path: file,
        contentType: typeof content,
        contentLength: content?.length,
        format: opts?.format ?? true,
      })
      return sdk.client.file
        .write({ fileWriteInput: { path: file, content, format: opts?.format ?? true } })
        .then((x) => {
          if (scope() !== dir) return false
          const next = x.data
          if (!next) return false
          console.debug("[file.save] response:", {
            type: typeof next,
            hasContent: "content" in next,
            contentType: next.type,
          })
          setLoaded(file, next)
          if (typeof next === "object" && typeof next.content === "string") {
            touchFileContent(file, approxBytes(next))
          }
          evictContent(new Set([file]))
          return true
        })
        .catch((e) => {
          console.error(
            "[file.save] error:",
            e,
            "\ntype:",
            typeof e,
            "\nconstructor:",
            e?.constructor?.name,
            "\nstack:",
            e?.stack,
          )
          if (scope() !== dir) return false
          const message = errorMessage(e, language.t("error.chain.unknown"))
          setStore(
            "file",
            file,
            produce((draft) => {
              draft.saving = false
              draft.saveError = message
            }),
          )
          throw e
        })
    }

    const saveAll = async (opts?: { format?: boolean }) => {
      const all = Object.keys(store.file).filter((item) => dirty(item) || store.file[item]?.stale)
      const out = await Promise.all(all.map((item) => save(item, opts)))
      return out.every(Boolean)
    }

    const rename = async (from: string, to: string) => {
      const fromPath = path.normalize(from)
      const toPath = path.normalize(to)
      if (!fromPath || !toPath) {
        throw new Error("Invalid path")
      }
      if (fromPath === toPath) return { from: fromPath, to: toPath }

      await sdk.client.file.rename({ from: fromPath, to: toPath })
      const dir = parentDir(fromPath)
      await tree.listDir(dir, { force: true })
      if (dir) tree.expandDir(dir)

      if (store.file[fromPath]) {
        const prev = store.file[fromPath]
        setStore(
          produce((draft) => {
            delete draft.file[fromPath]
            draft.file[toPath] = {
              ...prev,
              path: toPath,
              name: getFilename(toPath),
            }
          }),
        )
        const handler = handlers.get(fromPath)
        if (handler) {
          handlers.delete(fromPath)
          handlers.set(toPath, handler)
        }
      }

      bumpCatalog()
      return { from: fromPath, to: toPath }
    }

    const remove = async (input: string) => {
      const filePath = path.normalize(input)
      if (!filePath) return

      await sdk.client.file.delete({ path: filePath })
      const dir = parentDir(filePath)
      await tree.listDir(dir, { force: true })

      if (store.file[filePath]) {
        setStore(
          produce((draft) => {
            delete draft.file[filePath]
          }),
        )
      }
      if (handlers.has(filePath)) handlers.delete(filePath)

      bumpCatalog()
    }

    function withPath(input: string, action: (file: string) => unknown) {
      return action(path.normalize(input))
    }
    const scrollTop = (input: string) => withPath(input, (file) => view().scrollTop(file))
    const scrollLeft = (input: string) => withPath(input, (file) => view().scrollLeft(file))
    const selectedLines = (input: string) => withPath(input, (file) => view().selectedLines(file))
    const setScrollTop = (input: string, top: number) => withPath(input, (file) => view().setScrollTop(file, top))
    const setScrollLeft = (input: string, left: number) => withPath(input, (file) => view().setScrollLeft(file, left))
    const setSelectedLines = (input: string, range: SelectedLineRange | null) =>
      withPath(input, (file) => view().setSelectedLines(file, range))

    onCleanup(() => {
      stop()
      clearFresh()
      viewCache.clear()
    })

    return {
      ready: () => view().ready(),
      catalogRevision,
      bumpCatalog,
      isFresh,
      markFresh,
      rename,
      remove,
      normalize: path.normalize,
      tab: path.tab,
      pathFromTab: path.pathFromTab,
      tree: {
        list: tree.listDir,
        refresh: (input: string) => tree.listDir(input, { force: true }),
        state: tree.dirState,
        children: tree.children,
        expand: tree.expandDir,
        collapse: tree.collapseDir,
        toggle(input: string) {
          if (tree.dirState(input)?.expanded) {
            tree.collapseDir(input)
            return
          }
          tree.expandDir(input)
        },
      },
      get,
      text,
      dirty,
      save,
      saveAll,
      registerSave,
      touchState,
      setDraft,
      setMode,
      load,
      scrollTop,
      scrollLeft,
      setScrollTop,
      setScrollLeft,
      selectedLines,
      setSelectedLines,
      searchFiles: (query: string) => search(query, "false"),
      searchFilesAndDirectories: (query: string) => search(query, "true"),
    }
  },
})

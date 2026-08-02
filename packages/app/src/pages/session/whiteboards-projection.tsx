import { createEffect, createMemo, createSignal, lazy, on, onCleanup, onMount, Show, Suspense } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { PenLine, Plus } from "lucide-solid"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { useFile } from "@/context/file"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import { listWhiteboardPaths } from "@/lib/whiteboard/list"
import { useWorkspaceFileList } from "@/hooks/use-workspace-file-list"
import { projectionWhiteboard } from "@/lib/whiteboard/active-projection"
import { patchSearchParams } from "@/lib/focus/rail-params"
import { readWhiteboardPath } from "@/lib/whiteboard-navigate"
import {
  dedupeWhiteboardPath,
  defaultWhiteboardPath,
  emptyWhiteboard,
  serializeWhiteboard,
} from "@/lib/whiteboard/schema"
import {
  deleteWhiteboardEntity,
  listWhiteboardsFromStore,
  mergeWhiteboardPaths,
  registerWhiteboardEntity,
  updateWhiteboardEntityPath,
} from "@/lib/whiteboard/store"
import {
  RouteEmptyState,
  ResizableRouteSidebar,
  ResizableSidebarLayout,
  ResizableSidebarToggle,
} from "@/components/route"
import { AffordanceShell } from "@/components/affordance"
import { WhiteboardSidebarList } from "@/pages/session/whiteboard-sidebar-list"
import { PROJECTION_FOCUS_EVENT, type ProjectionFocusDetail } from "@/lib/projection-focus"
import "./whiteboards-projection.css"

const WhiteboardEditor = lazy(() => import("./whiteboard-editor"))

function WhiteboardsProjectionInner() {
  const sdk = useSDK()
  const file = useFile()
  const store = useTrellisStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = createSignal<string | null>(null)
  const [pendingPath, setPendingPath] = createSignal<string | null>(null)

  const [filePaths] = useWorkspaceFileList(async () =>
    listWhiteboardPaths(async (query) => {
      const res = await sdk.client.find.files(query)
      return res.data
    }),
  )

  const items = createMemo(() => {
    const storeBoards = listWhiteboardsFromStore(store.entities, store.facts)
    return mergeWhiteboardPaths(filePaths() ?? [], storeBoards)
  })

  const selectBoard = (path: string) => {
    setSelected(path)
    projectionWhiteboard.set(path)
    setPendingPath(null)
    void file.load(path, { force: true })
  }

  const preferredPath = () => {
    const fromUrl = readWhiteboardPath(searchParams)
    if (fromUrl) return file.normalize(fromUrl)
    const pending = pendingPath()
    if (pending) return file.normalize(pending)
    const live = projectionWhiteboard.path()
    return live ? file.normalize(live) : null
  }

  createEffect(() => {
    const list = items()
    const target = preferredPath()

    if (list.length === 0) {
      if (selected() !== null) {
        setSelected(null)
        projectionWhiteboard.set(null)
      }
      return
    }

    if (target) {
      if (list.includes(target)) {
        if (selected() !== target) selectBoard(target)
        return
      }
      return
    }

    const current = selected()
    if (current && list.includes(current)) return
    selectBoard(list[0]!)
  })

  createEffect(
    on(
      () => selected(),
      (path) => {
        if (!path) return
        const next = patchSearchParams(searchParams, { whiteboard: path })
        if (next) setSearchParams(next, { replace: true })
      },
    ),
  )

  onMount(() => {
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectionFocusDetail>).detail
      if (detail?.lens !== "whiteboards" || !detail.path) return
      const normalized = file.normalize(detail.path)
      setPendingPath(normalized)
      const next = patchSearchParams(searchParams, { whiteboard: normalized })
      if (next) setSearchParams(next, { replace: true })
      if (items().includes(normalized)) selectBoard(normalized)
    }
    window.addEventListener(PROJECTION_FOCUS_EVENT, focus)
    onCleanup(() => window.removeEventListener(PROJECTION_FOCUS_EVENT, focus))
  })

  const createWhiteboard = async () => {
    const path = dedupeWhiteboardPath(defaultWhiteboardPath(), new Set(items()))
    try {
      await sdk.client.file.write({
        fileWriteInput: {
          path,
          content: serializeWhiteboard(emptyWhiteboard()),
          format: false,
        },
      })
      await registerWhiteboardEntity(sdk.fetch, sdk.url, sdk.directory, { path })
      await store.refresh(false)
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
      await file.tree.refresh(parent)
      if (parent) file.tree.expand(parent)
      file.bumpCatalog()
      file.markFresh(path)
      selectBoard(path)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to create whiteboard",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDeleted = async (path: string) => {
    try {
      await deleteWhiteboardEntity(sdk.fetch, sdk.url, sdk.directory, path, store.facts)
      await store.refresh(false)
    } catch {
      // File delete already succeeded; store cleanup is best-effort.
    }
    if (selected() === path) {
      setSelected(null)
      projectionWhiteboard.set(null)
      const next = patchSearchParams(searchParams, { whiteboard: null })
      if (next) setSearchParams(next, { replace: true })
    }
  }

  const handleRenamed = async (from: string, to: string) => {
    try {
      await updateWhiteboardEntityPath(sdk.fetch, sdk.url, sdk.directory, { from, to }, store.facts)
      await store.refresh(false)
    } catch {
      // Rename on disk succeeded; store sync is best-effort.
    }
    if (selected() === from) {
      setSelected(to)
      projectionWhiteboard.set(to)
      void file.load(to, { force: true })
      const next = patchSearchParams(searchParams, { whiteboard: to })
      if (next) setSearchParams(next, { replace: true })
    }
  }

  return (
    <ResizableSidebarLayout id="whiteboards" defaultWidth={224}>
      <AffordanceShell
        id="whiteboards"
        viewClass="whiteboards-projection"
        padded={false}
        scroll={false}
        sidebar={
          <ResizableRouteSidebar
            title="Whiteboards"
            meta={items().length}
            width={224}
            footer={
              <Button size="small" variant="ghost" class="w-full justify-start" onClick={() => void createWhiteboard()}>
                <Plus class="size-4" />
                <span>New whiteboard</span>
              </Button>
            }
          >
            <Show
              when={items().length > 0}
              fallback={<p class="text-12-regular text-text-weak px-2 py-1">No boards yet. Create one below.</p>}
            >
              <WhiteboardSidebarList
                paths={items()}
                active={selected()}
                onSelect={selectBoard}
                onDeleted={(path) => void handleDeleted(path)}
                onRenamed={(from, to) => void handleRenamed(from, to)}
              />
            </Show>
          </ResizableRouteSidebar>
        }
      >
        <div class="flex h-full min-h-0 flex-col">
          <Show when={!selected()}>
            <div class="shrink-0 flex h-10 items-center gap-2 border-b border-border-weaker-base px-3">
              <ResizableSidebarToggle />
            </div>
          </Show>
          <Show
            when={selected()}
            keyed
            fallback={
              <div class="flex-1 min-h-0">
                <RouteEmptyState
                  title="No whiteboard selected"
                  description="Pick a board from the sidebar or create a new one."
                  action={
                    <Button size="small" variant="secondary" onClick={() => void createWhiteboard()}>
                      <PenLine class="size-4" />
                      <span>New whiteboard</span>
                    </Button>
                  }
                />
              </div>
            }
          >
            {(path) => (
              <div class="whiteboards-projection-editor h-full min-h-0 flex-1">
                <Suspense
                  fallback={
                    <div class="h-full flex items-center justify-center text-text-weak text-13-regular">
                      Loading whiteboard…
                    </div>
                  }
                >
                  <WhiteboardEditor path={path} active variant="projection" />
                </Suspense>
              </div>
            )}
          </Show>
        </div>
      </AffordanceShell>
    </ResizableSidebarLayout>
  )
}

export function WhiteboardsProjection() {
  return (
    <TrellisStoreScope>
      <WhiteboardsProjectionInner />
    </TrellisStoreScope>
  )
}

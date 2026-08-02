import type { FileDiff, Part, Project, UserMessage } from "@opencode-ai/sdk/v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useMutation } from "@tanstack/solid-query"
import {
  batch,
  For,
  onCleanup,
  Show,
  Match,
  Switch,
  createMemo,
  createEffect,
  createComputed,
  createSignal,
  on,
  onMount,
  untrack,
} from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { useLocal } from "@/context/local"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { createStore, produce } from "solid-js/store"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Select } from "@opencode-ai/ui/select"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tabs } from "@opencode-ai/ui/tabs"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import {
  ensureBodyPointerEvents,
  restoreBodyPointerEventsOnInteraction,
} from "@opencode-ai/ui/lib/pointer-events-guard"
import { previewSelectedLines } from "@opencode-ai/ui/pierre/selection-bridge"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { checksum } from "@opencode-ai/util/encode"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { NewSessionView, SessionHeader, SessionThreadSidebar, SessionAgentIcon } from "@/components/session"
import { useComments } from "@/context/comments"
import { useCommand } from "@/context/command"
import { getSessionPrefetch, SESSION_PREFETCH_TTL } from "@/context/global-sync/session-prefetch"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { useTerminal } from "@/context/terminal"
import { type FollowupDraft, sendFollowupDraft } from "@/components/prompt-input/submit"
import { createSessionComposerState, SessionComposerRegion } from "@/pages/session/composer"
import {
  createOpenReviewFile,
  createSessionTabs,
  createSizing,
  focusTerminalById,
  getTabReorderIndex,
  sessionRouteHref,
  shouldFocusTerminalOnKeyDown,
} from "@/pages/session/helpers"
import { createSessionTabListSync } from "@/pages/session/session-tab-scroll"
import { warmSessionTab } from "@/pages/session/session-warmup"
import { MessageTimeline } from "@/pages/session/message-timeline"
import { type DiffStyle, SessionReviewTab, type SessionReviewTabProps } from "@/pages/session/review-tab"
import { useSessionLayout } from "@/pages/session/session-layout"
import { syncSessionModel } from "@/pages/session/session-model-helpers"
import { TerminalPanel } from "@/pages/session/terminal-panel"
import { useSessionCommands } from "@/pages/session/use-session-commands"
import { useSessionHashScroll } from "@/pages/session/use-session-hash-scroll"
import { LogsPanel, PlanPanel } from "@/pages/trellis"
import { RAIL_ITEMS, type RailItem, SessionSidePanel, useCustomRailItems } from "@/pages/session/session-side-panel"
import { projectionWorkspaceTypeFromConfig } from "@/lib/projections"
import { isNavV2Enabled } from "@/lib/nav-flag"
import { useTrellisOptional, type TrellisPlan } from "@/context/trellis"
import { graphNav } from "@/lib/graph-nav"
import { pushCmsNav } from "@/lib/cms-navigate"
import { EVENT, type PreviewDetail } from "@/lib/preview-url"
import { autofollow } from "@/lib/agent-nav"
import { isStoreMutationToolCompleted, notifyTrellisStoreChanged } from "@/lib/trellis-store-sync"
import { isSessionWorking } from "@/lib/session-working"
import { Identifier } from "@/utils/id"
import { Persist, persisted } from "@/utils/persist"
import { extractPromptFromParts } from "@/utils/prompt"
import { same } from "@/utils/same"
import { formatServerError } from "@/utils/server-errors"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
} from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { createReliableUpdate, createErrorBoundary, createSyncedState } from "@/utils/ui-update-reliability"

const emptyUserMessages: UserMessage[] = []
type FollowupItem = FollowupDraft & { id: string }
type FollowupEdit = Pick<FollowupItem, "id" | "prompt" | "context">
const emptyFollowups: FollowupItem[] = []
const edits = new Set(["write", "edit", "apply_patch"])

// Global session state management for reliable UI updates
let sessionStateReliability: {
  syncedMessages: ReturnType<typeof createSyncedState<UserMessage[]>> | null
  errorBoundary: ReturnType<typeof createErrorBoundary<unknown>> | null
  reliableUpdate: ReturnType<typeof createReliableUpdate<boolean>> | null
} | null = null

function toolPath(part: Part) {
  if (part.type !== "tool") return
  if (!edits.has(part.tool)) return
  if (part.state.status !== "completed") return

  const meta = (part.state.metadata ?? {}) as Record<string, unknown>
  const input = (part.state.input ?? {}) as Record<string, unknown>

  if (part.tool === "apply_patch") {
    const files = meta.files
    if (!Array.isArray(files)) return
    const paths = files.flatMap((item) => {
      if (typeof item !== "object" || !item) return []
      const type = "type" in item && typeof item.type === "string" ? item.type : undefined
      if (type === "delete") return []
      const rel = "relativePath" in item && typeof item.relativePath === "string" ? item.relativePath : undefined
      const move = "movePath" in item && typeof item.movePath === "string" ? item.movePath : undefined
      const file = "filePath" in item && typeof item.filePath === "string" ? item.filePath : undefined
      const path = rel ?? move ?? file
      return path ? [path] : []
    })
    return paths.at(-1)
  }

  if (typeof input.filePath === "string") return input.filePath
  if (typeof meta.filepath === "string") return meta.filepath
}

type SessionHistoryWindowInput = {
  sessionID: () => string | undefined
  messagesReady: () => boolean
  loaded: () => number
  visibleUserMessages: () => UserMessage[]
  historyMore: () => boolean
  historyLoading: () => boolean
  loadMore: (sessionID: string) => Promise<void>
  userScrolled: () => boolean
  scroller: () => HTMLDivElement | undefined
}

/**
 * Maintains the rendered history window for a session timeline.
 *
 * It keeps initial paint bounded to recent turns, reveals cached turns in
 * small batches while scrolling upward, and prefetches older history near top.
 */
function createSessionHistoryWindow(input: SessionHistoryWindowInput) {
  const turnInit = 10
  const turnBatch = 8
  const turnScrollThreshold = 200
  const turnPrefetchBuffer = 16
  const prefetchCooldownMs = 400
  const prefetchNoGrowthLimit = 2

  const [state, setState] = createStore({
    turnID: undefined as string | undefined,
    turnStart: 0,
    prefetchUntil: 0,
    prefetchNoGrowth: 0,
  })

  const initialTurnStart = (len: number) => (len > turnInit ? len - turnInit : 0)

  const turnStart = createMemo(() => {
    const id = input.sessionID()
    const len = input.visibleUserMessages().length
    if (!id || len <= 0) return 0
    if (state.turnID !== id) return initialTurnStart(len)
    if (state.turnStart <= 0) return 0
    if (state.turnStart >= len) return initialTurnStart(len)
    return state.turnStart
  })

  const setTurnStart = (start: number) => {
    const id = input.sessionID()
    const next = start > 0 ? start : 0
    if (!id) {
      setState({ turnID: undefined, turnStart: next })
      return
    }
    setState({ turnID: id, turnStart: next })
  }

  const renderedUserMessages = createMemo(
    () => {
      const msgs = input.visibleUserMessages()
      const start = turnStart()
      if (start <= 0) return msgs
      return msgs.slice(start)
    },
    emptyUserMessages,
    {
      equals: same,
    },
  )

  const preserveScroll = (fn: () => void) => {
    const el = input.scroller()
    if (!el) {
      fn()
      return
    }
    const beforeTop = el.scrollTop
    const beforeHeight = el.scrollHeight
    fn()
    requestAnimationFrame(() => {
      const delta = el.scrollHeight - beforeHeight
      if (!delta) return
      el.scrollTop = beforeTop + delta
    })
  }

  const backfillTurns = () => {
    const start = turnStart()
    if (start <= 0) return

    const next = start - turnBatch
    const nextStart = next > 0 ? next : 0

    preserveScroll(() => setTurnStart(nextStart))
  }

  /** Button path: reveal all cached turns, fetch older history, reveal one batch. */
  const loadAndReveal = async () => {
    const id = input.sessionID()
    if (!id) return

    const start = turnStart()
    const beforeVisible = input.visibleUserMessages().length
    let loaded = input.loaded()

    if (start > 0) setTurnStart(0)

    if (!input.historyMore() || input.historyLoading()) return

    let afterVisible = beforeVisible
    let added = 0

    while (true) {
      await input.loadMore(id)
      if (input.sessionID() !== id) return

      afterVisible = input.visibleUserMessages().length
      const nextLoaded = input.loaded()
      const raw = nextLoaded - loaded
      added += raw
      loaded = nextLoaded

      if (afterVisible > beforeVisible) break
      if (raw <= 0) break
      if (!input.historyMore()) break
    }

    if (added <= 0) return
    if (state.prefetchNoGrowth) setState("prefetchNoGrowth", 0)

    const growth = afterVisible - beforeVisible
    if (growth <= 0) return
    if (turnStart() !== 0) return

    const target = Math.min(afterVisible, beforeVisible + turnBatch)
    setTurnStart(Math.max(0, afterVisible - target))
  }

  /** Scroll/prefetch path: fetch older history from server. */
  const fetchOlderMessages = async (opts?: { prefetch?: boolean }) => {
    const id = input.sessionID()
    if (!id) return
    if (!input.historyMore() || input.historyLoading()) return

    if (opts?.prefetch) {
      const now = Date.now()
      if (state.prefetchUntil > now) return
      if (state.prefetchNoGrowth >= prefetchNoGrowthLimit) return
      setState("prefetchUntil", now + prefetchCooldownMs)
    }

    const start = turnStart()
    const beforeVisible = input.visibleUserMessages().length
    const beforeRendered = start <= 0 ? beforeVisible : renderedUserMessages().length
    let loaded = input.loaded()
    let added = 0
    let growth = 0

    while (true) {
      await input.loadMore(id)
      if (input.sessionID() !== id) return

      const nextLoaded = input.loaded()
      const raw = nextLoaded - loaded
      added += raw
      loaded = nextLoaded
      growth = input.visibleUserMessages().length - beforeVisible

      if (growth > 0) break
      if (raw <= 0) break
      if (opts?.prefetch) break
      if (!input.historyMore()) break
    }

    const afterVisible = input.visibleUserMessages().length

    if (opts?.prefetch) {
      setState("prefetchNoGrowth", added > 0 ? 0 : state.prefetchNoGrowth + 1)
    } else if (added > 0 && state.prefetchNoGrowth) {
      setState("prefetchNoGrowth", 0)
    }

    if (added <= 0) return
    if (growth <= 0) return

    if (opts?.prefetch) {
      const current = turnStart()
      preserveScroll(() => setTurnStart(current + growth))
      return
    }

    if (turnStart() !== start) return

    const currentRendered = renderedUserMessages().length
    const base = Math.max(beforeRendered, currentRendered)
    const target = Math.min(afterVisible, base + turnBatch)
    preserveScroll(() => setTurnStart(Math.max(0, afterVisible - target)))
  }

  const onScrollerScroll = () => {
    if (!input.userScrolled()) return
    const el = input.scroller()
    if (!el) return
    if (el.scrollTop >= turnScrollThreshold) return

    const start = turnStart()
    if (start > 0) {
      if (start <= turnPrefetchBuffer) {
        void fetchOlderMessages({ prefetch: true })
      }
      backfillTurns()
      return
    }

    void fetchOlderMessages()
  }

  createEffect(
    on(
      input.sessionID,
      () => {
        setState({ prefetchUntil: 0, prefetchNoGrowth: 0 })
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => [input.sessionID(), input.messagesReady()] as const,
      ([id, ready]) => {
        if (!id || !ready) return
        setTurnStart(initialTurnStart(input.visibleUserMessages().length))
      },
      { defer: true },
    ),
  )

  return {
    turnStart,
    setTurnStart,
    renderedUserMessages,
    loadAndReveal,
    onScrollerScroll,
  }
}

export default function Page() {
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const local = useLocal()
  const file = useFile()
  const sync = useSync()
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useSDK()
  const settings = useSettings()
  const prompt = usePrompt()
  const comments = useComments()
  const terminal = useTerminal()
  const command = useCommand()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams<{ prompt?: string; new?: string; view?: string }>()
  const { params, sessionKey, tabs, view } = useSessionLayout()
  const plan = createMemo(() => local.agent.current()?.name === "plan")
  const href = (id: string) => sessionRouteHref(params.dir!, id, searchParams)
  const rootHref = () => sessionRouteHref(params.dir!, undefined, searchParams)
  const preloadSessionTab = (sessionID: string) => {
    const dir = sdk.directory
    if (!dir) return
    warmSessionTab({
      directory: dir,
      sessionID,
      laneActivate: (input) => sdk.client.session.laneActivate(input),
      syncSession: (id) => sync.session.sync(id),
    })
  }

  const navigateToSessionTab = (id: string) => {
    if (id === "new") {
      if (!params.id) return
      navigate(rootHref())
      return
    }
    if (params.id === id) return
    preloadSessionTab(id)
    navigate(href(id))
  }

  createEffect(
    on(
      () => plan(),
      (isPlan, wasPlan) => {
        if (isPlan && !wasPlan) {
          tabs().setActive("plan")
        }
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    if (!untrack(() => prompt.ready())) return
    prompt.ready()
    untrack(() => {
      if (params.id || !prompt.ready()) return
      const text = searchParams.prompt
      if (!text) return
      prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      setSearchParams({ ...searchParams, prompt: undefined })
    })
  })

  const [ui, setUi] = createStore({
    pendingMessage: undefined as string | undefined,
    reviewSnap: false,
    scrollGesture: 0,
    scroll: {
      overflow: false,
      bottom: true,
    },
  })

  const composer = createSessionComposerState()

  const [top, setTop] = createStore({
    creating: false,
    activeDraggable: undefined as string | undefined,
  })
  const [order, setOrder, , orderReady] = persisted(
    Persist.global("session-order", ["session-order.v1"]),
    createStore<Record<string, string[]>>({}),
  )
  const [open, setOpen, , openReady] = persisted(
    Persist.global("session-open", ["session-open.v1"]),
    createStore<Record<string, string[]>>({}),
  )
  const orderKey = createMemo(() => params.dir ?? "")

  createEffect(() => {
    const key = orderKey()
    if (!key) return
    if (!orderReady()) return
    if (!openReady()) return
    if (open[key] !== undefined) return

    setOpen(key, order[key] ?? (params.id ? [params.id] : []))
  })

  const base = createMemo(() =>
    (sync.data.session ?? [])
      .filter((s) => !s.time?.archived && !s.parentID)
      .sort((a, b) => {
        const aTime = a.time ? (a.time.updated ?? a.time.created) : 0
        const bTime = b.time ? (b.time.updated ?? b.time.created) : 0
        return bTime - aTime
      }),
  )
  const sessionList = createMemo(() => {
    const ids = order[orderKey()]
    const list = base()
    const live = new Map(list.map((item) => [item.id, item]))
    const ordered = ids?.length
      ? [
          ...ids.flatMap((id) => {
            const item = live.get(id)
            if (!item) return []
            live.delete(id)
            return [item]
          }),
          ...live.values(),
        ]
      : list
    const opened = new Set(open[orderKey()] ?? [])
    if (params.id) opened.add(params.id)
    if (opened.size === 0) return []

    const result = ordered.filter((item) => opened.has(item.id))
    const seen = new Set(result.map((item) => item.id))
    for (const id of opened) {
      if (seen.has(id)) continue
      const item = live.get(id) ?? sync.session.get(id)
      if (!item) continue
      result.push(item)
      seen.add(id)
    }
    return result
  })

  const showSession = (id: string, active?: boolean) => {
    if (!orderReady()) return
    if (!openReady()) return
    const key = orderKey()
    if (!key) return

    setOrder(key, (prev) => {
      const list = prev ?? []
      if (!active && list.includes(id)) return list
      const rest = list.filter((item) => item !== id)
      if (active) return [...rest, id]
      return [id, ...rest]
    })
    setOpen(key, (prev) => {
      const list = prev ?? []
      if (list.includes(id)) return list
      return [...list, id]
    })
  }

  const moveSession = (id: string, to: number) => {
    if (!orderReady()) return
    const key = orderKey()
    if (!key) return

    const ids = sessionList().map((session) => session.id)
    const from = ids.indexOf(id)
    if (from === -1 || from === to) return

    const next = ids.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    setOrder(key, next)
  }

  const closeSession = (id: string) => {
    if (!openReady()) return
    const key = orderKey()
    if (!key) return

    const current = sessionList().map((item) => item.id)
    const index = current.indexOf(id)
    const next = current.filter((item) => item !== id)

    setOpen(key, (prev) => (prev ?? []).filter((item) => item !== id))

    if (params.id !== id) return

    const target = next[index - 1] ?? next[index]
    if (target) {
      navigate(sessionRouteHref(key, target, searchParams))
      return
    }

    local.session.reset()
    prompt.reset()
    navigate(sessionRouteHref(key, undefined, searchParams))
  }

  const handleSessionDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setTop("activeDraggable", id)
  }

  const handleSessionDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const to = getTabReorderIndex(
      sessionList().map((session) => session.id),
      draggable.id.toString(),
      droppable.id.toString(),
    )
    if (to === undefined) return
    moveSession(draggable.id.toString(), to)
  }

  const handleSessionDragEnd = () => {
    setTop("activeDraggable", undefined)
  }

  createEffect(
    on(
      () => params.id,
      (id) => {
        if (!id) return
        showSession(id)
        sessionTabListSync?.syncActive()
      },
      { defer: true },
    ),
  )

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const size = createSizing()
  let sessionTabListSync: ReturnType<typeof createSessionTabListSync> | undefined
  const sessionOpened = () => layout.session.opened()
  const sessionWidth = () => layout.session.width()

  const desktopReviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const desktopFileTreeOpen = createMemo(() => isDesktop() && layout.fileTree.opened())
  const full = createMemo(() => isDesktop() && !!params.dir && layout.session.fullscreen(params.dir)())
  const centered = createMemo(() => isDesktop() && (full() || !desktopReviewOpen()))

  function normalizeTab(tab: string) {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  function normalizeTabs(list: string[]) {
    const seen = new Set<string>()
    const next: string[] = []
    for (const item of list) {
      const value = normalizeTab(item)
      if (seen.has(value)) continue
      seen.add(value)
      next.push(value)
    }
    return next
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const diffs = createMemo(() => (params.id ? (sync.data.session_diff[params.id] ?? []) : []))
  const reviewCount = createMemo(() => Math.max(info()?.summary?.files ?? 0, diffs().length))
  const hasReview = createMemo(() => reviewCount() > 0)
  const reviewTab = createMemo(() => isDesktop())
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview,
  })
  const contextOpen = tabState.contextOpen
  const openedTabs = tabState.openedTabs
  const activeTab = tabState.activeTab
  const activeFileTab = tabState.activeFileTab
  const workspaceType = createMemo(() => projectionWorkspaceTypeFromConfig(sync.data.config))
  const { currentOrder, currentHidden } = useCustomRailItems(sdk, workspaceType)

  const railItems = createMemo<RailItem[]>(() => {
    const order = currentOrder()
    const hidden = currentHidden()
    return order
      .filter((id) => !hidden.includes(id))
      .map((id) => RAIL_ITEMS.find((item) => item.id === id))
      .filter((item): item is RailItem => !!item)
  })
  const revertMessageID = createMemo(() => info()?.revert?.messageID)
  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const messagesReady = createMemo(() => {
    const id = params.id
    if (!id) return true
    return sync.data.message[id] !== undefined
  })
  const historyMore = createMemo(() => {
    const id = params.id
    if (!id) return false
    return sync.session.history.more(id)
  })
  const historyLoading = createMemo(() => {
    const id = params.id
    if (!id) return false
    return sync.session.history.loading(id)
  })

  const userMessages = createMemo(
    () => messages().filter((m) => m.role === "user") as UserMessage[],
    emptyUserMessages,
    { equals: same },
  )
  const visibleUserMessages = createMemo(
    () => {
      const revert = revertMessageID()
      if (!revert) return userMessages()
      return userMessages().filter((m) => m.id < revert)
    },
    emptyUserMessages,
    {
      equals: same,
    },
  )
  const sessionTabEmpty = createMemo(() => {
    if (!params.id || !messagesReady()) return false
    return visibleUserMessages().length === 0
  })
  const lastUserMessage = createMemo(() => visibleUserMessages().at(-1))
  let seeded = ""
  let seed = 0
  let seen = new Set<string>()

  createEffect(
    on(
      () => [sessionKey(), messagesReady()] as const,
      ([key, ready]) => {
        if (key !== seeded) {
          seeded = key
          seed = 0
          seen = new Set<string>()
        }
        if (!autofollow()) return
        if (!ready || seed) return

        for (const msg of messages()) {
          for (const part of sync.data.part[msg.id] ?? []) {
            if (!toolPath(part)) continue
            seen.add(part.id)
          }
        }

        seed = Date.now()
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const tab = activeFileTab()
    if (!tab) return

    const path = file.pathFromTab(tab)
    if (path) file.load(path)
  })

  createEffect(() => {
    if (!autofollow()) return
    if (!seed) return

    let next: string | undefined
    for (const msg of messages()) {
      for (const part of sync.data.part[msg.id] ?? []) {
        if (seen.has(part.id)) continue
        seen.add(part.id)

        const path = toolPath(part)
        if (!path) continue
        if (part.type !== "tool") continue

        const end = "time" in part.state && "end" in part.state.time ? part.state.time.end : undefined
        if (typeof end === "number" && end < seed) continue
        next = path
      }
    }

    if (!next) return

    // Always preload so whichever surface picks this up finds it cached.
    void file.load(next)

    // Branch by current top-level view:
    //   code  → open as a new file tab and focus it (matches Image 3).
    //   graph → select the file node so it surfaces in the right-side
    //           preview drawer (matches Image 2).
    //   other → switch to graph view, then select the file node.
    const view = searchParams.view
    if (view === "code") {
      openReviewPanel()
      const tab = file.tab(next)
      tabs().open(tab)
      tabs().setActive(tab)
      return
    }

    graphNav.request(`file:${next}`)
    if (view !== "graph") setSearchParams({ ...searchParams, view: "graph" })
  })

  createEffect(() => {
    const unsub = sdk.event.listen((e) => {
      // Agent graph mutations (cms, calendar, memory, design, store) → refresh
      // every store-backed view immediately instead of waiting for the poll.
      // New entities are flagged `fresh` by the store and fade green for ~6s.
      if (isStoreMutationToolCompleted(e.details)) {
        notifyTrellisStoreChanged(true)
      }
      if (e.name !== "ui.navigate") return
      const props = e.details.properties as typeof e.details.properties & {
        preview?: {
          name?: string
          url?: string
        }
        cms?: {
          collection?: string
          entry?: string
        }
      }
      if (props.sessionID && props.sessionID !== params.id) return
      if (!autofollow()) return
      batch(() => {
        if (props.tab === "preview") openReviewPanel()
        if (props.tab) setSearchParams({ ...searchParams, view: props.tab })
        if (props.filePath) {
          const t = file.tab(props.filePath)
          tabs().open(t)
          tabs().setActive(t)
          if (props.tab !== "preview" && searchParams.view !== "preview") {
            setSearchParams({ ...searchParams, view: undefined })
          }
          void file.load(props.filePath)
        }
      })
      if (props.tab === "cms") {
        window.dispatchEvent(new CustomEvent("trellis-store-changed", { detail: { quiet: true } }))
        if (props.cms?.entry) {
          setSearchParams({ ...searchParams, view: "cms", cmsEntry: props.cms.entry })
        }
        if (props.cms?.collection || props.cms?.entry) {
          pushCmsNav({ collection: props.cms.collection, entry: props.cms.entry })
        }
      }
    })
    onCleanup(unsub)
  })

  createEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<PreviewDetail>).detail
      if (!detail?.url) return
      setSearchParams({ ...searchParams, view: "browser" })
    }
    window.addEventListener(EVENT, open)
    onCleanup(() => window.removeEventListener(EVENT, open))
  })

  createEffect(
    on(
      () => lastUserMessage()?.id,
      () => {
        const msg = lastUserMessage()
        if (!msg) return
        syncSessionModel(local, msg)
      },
    ),
  )

  createEffect(
    on(
      () =>
        [
          sessionKey(),
          isDesktop()
            ? desktopFileTreeOpen() || (desktopReviewOpen() && activeTab() === "review")
            : store.mobileTab === "changes",
        ] as const,
      ([key, wants]) => {
        if (diffFrame !== undefined) cancelAnimationFrame(diffFrame)
        if (diffTimer !== undefined) window.clearTimeout(diffTimer)
        diffFrame = undefined
        diffTimer = undefined
        if (!wants) return

        const id = params.id
        if (!id) return
        if (!untrack(() => sync.data.session_diff[id] !== undefined)) return

        diffFrame = requestAnimationFrame(() => {
          diffFrame = undefined
          diffTimer = window.setTimeout(() => {
            diffTimer = undefined
            if (sessionKey() !== key) return
            void sync.session.diff(id, { force: true })
          }, 0)
        })
      },
      { defer: true },
    ),
  )

  const [store, setStore] = createStore({
    messageId: undefined as string | undefined,
    mobileTab: "session" as "studio" | "session" | "terminal" | "changes",
    changes: "session" as "session" | "turn",
    newSessionWorktree: "main",
    deferRender: false,
  })

  createEffect(
    on(
      () => [isDesktop(), searchParams.view] as const,
      ([desktop, view]) => {
        if (desktop || !view) return
        setStore("mobileTab", "studio")
      },
    ),
  )

  createEffect(() => {
    if (!layout.terminal.opened()) return
    const dir = params.dir
    if (dir && full()) layout.session.setFullscreen(dir, false)
    if (!isDesktop() && store.mobileTab !== "studio") setStore("mobileTab", "studio")
  })

  const [followup, setFollowup] = persisted(
    Persist.workspace(sdk.directory, "followup", ["followup.v1"]),
    createStore<{
      items: Record<string, FollowupItem[] | undefined>
      failed: Record<string, string | undefined>
      paused: Record<string, boolean | undefined>
      edit: Record<string, FollowupEdit | undefined>
    }>({
      items: {},
      failed: {},
      paused: {},
      edit: {},
    }),
  )

  createComputed((prev) => {
    const key = sessionKey()
    if (key !== prev) {
      setStore("deferRender", true)
      requestAnimationFrame(() => {
        setTimeout(() => setStore("deferRender", false), 0)
      })
    }
    return key
  }, sessionKey())

  let reviewFrame: number | undefined
  let refreshFrame: number | undefined
  let refreshTimer: number | undefined
  let todoFrame: number | undefined
  let todoTimer: number | undefined
  let diffFrame: number | undefined
  let diffTimer: number | undefined

  createComputed((prev) => {
    const open = desktopReviewOpen()
    if (prev === undefined || prev === open) return open

    if (reviewFrame !== undefined) cancelAnimationFrame(reviewFrame)
    setUi("reviewSnap", true)
    reviewFrame = requestAnimationFrame(() => {
      reviewFrame = undefined
      setUi("reviewSnap", false)
    })
    return open
  }, desktopReviewOpen())

  const turnDiffs = createMemo(() => lastUserMessage()?.summary?.diffs ?? [])
  const reviewDiffs = createMemo(() => (store.changes === "session" ? diffs() : turnDiffs()))

  const newSessionWorktree = createMemo(() => {
    if (store.newSessionWorktree === "create") return "create"
    const project = sync.project
    if (project && sdk.directory !== project.worktree) return sdk.directory
    return "main"
  })

  const setActiveMessage = (message: UserMessage | undefined) => {
    messageMark = scrollMark
    setStore("messageId", message?.id)
  }

  const anchor = (id: string) => `message-${id}`

  const cursor = () => {
    const root = scroller
    if (!root) return store.messageId

    const box = root.getBoundingClientRect()
    const line = box.top + 100
    const list = [...root.querySelectorAll<HTMLElement>("[data-message-id]")]
      .map((el) => {
        const id = el.dataset.messageId
        if (!id) return

        const rect = el.getBoundingClientRect()
        return { id, top: rect.top, bottom: rect.bottom }
      })
      .filter((item): item is { id: string; top: number; bottom: number } => !!item)

    const shown = list.filter((item) => item.bottom > box.top && item.top < box.bottom)
    const hit = shown.find((item) => item.top <= line && item.bottom >= line)
    if (hit) return hit.id

    const near = [...shown].sort((a, b) => {
      const da = Math.abs(a.top - line)
      const db = Math.abs(b.top - line)
      if (da !== db) return da - db
      return a.top - b.top
    })[0]
    if (near) return near.id

    return list.filter((item) => item.top <= line).at(-1)?.id ?? list[0]?.id ?? store.messageId
  }

  function navigateMessageByOffset(offset: number) {
    const msgs = visibleUserMessages()
    if (msgs.length === 0) return

    const current = store.messageId && messageMark === scrollMark ? store.messageId : cursor()
    const base = current ? msgs.findIndex((m) => m.id === current) : msgs.length
    const currentIndex = base === -1 ? msgs.length : base
    const targetIndex = currentIndex + offset
    if (targetIndex < 0 || targetIndex > msgs.length) return

    if (targetIndex === msgs.length) {
      resumeScroll()
      return
    }

    autoScroll.pause()
    scrollToMessage(msgs[targetIndex], "auto")
  }

  const diffsReady = createMemo(() => {
    const id = params.id
    if (!id) return true
    if (!hasReview()) return true
    return sync.data.session_diff[id] !== undefined
  })
  const reviewEmptyKey = createMemo(() => {
    const project = sync.project
    if (project && !project.vcs) return "session.review.noVcs"
    if (sync.data.config.snapshot === false) return "session.review.noSnapshot"
    return "session.review.empty"
  })

  function upsert(next: Project) {
    const list = globalSync.data.project
    sync.set("project", next.id)
    const idx = list.findIndex((item) => item.id === next.id)
    if (idx >= 0) {
      globalSync.set(
        "project",
        list.map((item, i) => (i === idx ? { ...item, ...next } : item)),
      )
      return
    }
    const at = list.findIndex((item) => item.id > next.id)
    if (at >= 0) {
      globalSync.set("project", [...list.slice(0, at), next, ...list.slice(at)])
      return
    }
    globalSync.set("project", [...list, next])
  }

  const gitMutation = useMutation(() => ({
    mutationFn: () => sdk.client.project.initGit(),
    onSuccess: (x) => {
      if (!x.data) return
      upsert(x.data)
    },
    onError: (err) => {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: formatServerError(err, language.t),
      })
    },
  }))

  function initGit() {
    if (gitMutation.isPending) return
    gitMutation.mutate()
  }

  let inputRef!: HTMLDivElement
  let promptDock: HTMLDivElement | undefined
  let dockHeight = 0
  let scroller: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  let scrollMark = 0
  let messageMark = 0

  const scrollGestureWindowMs = 250

  const markScrollGesture = (target?: EventTarget | null) => {
    const root = scroller
    if (!root) return

    const el = target instanceof Element ? target : undefined
    const nested = el?.closest("[data-scrollable]")
    if (nested && nested !== root) return

    setUi("scrollGesture", Date.now())
  }

  const hasScrollGesture = () => Date.now() - ui.scrollGesture < scrollGestureWindowMs

  createEffect(
    on([() => sdk.directory, () => params.id] as const, ([, id]) => {
      if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshFrame = undefined
      refreshTimer = undefined
      if (!id) return

      const cached = untrack(() => sync.data.message[id] !== undefined)
      const stale = !cached
        ? false
        : (() => {
            const info = getSessionPrefetch(sdk.directory, id)
            if (!info) return true
            return Date.now() - info.at > SESSION_PREFETCH_TTL
          })()
      untrack(() => {
        void sync.session.sync(id)
      })

      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = undefined
        refreshTimer = window.setTimeout(() => {
          refreshTimer = undefined
          if (params.id !== id) return
          untrack(() => {
            if (stale) void sync.session.sync(id, { force: true })
          })
        }, 0)
      })
    }),
  )

  createEffect(
    on(
      () => {
        const id = params.id
        return [
          sdk.directory,
          id,
          id ? (sync.data.session_status[id]?.type ?? "idle") : "idle",
          id ? composer.blocked() : false,
        ] as const
      },
      ([dir, id, status, blocked]) => {
        if (todoFrame !== undefined) cancelAnimationFrame(todoFrame)
        if (todoTimer !== undefined) window.clearTimeout(todoTimer)
        todoFrame = undefined
        todoTimer = undefined
        if (!id) return
        if (status === "idle" && !blocked) return
        const cached = untrack(() => sync.data.todo[id] !== undefined || globalSync.data.session_todo[id] !== undefined)

        todoFrame = requestAnimationFrame(() => {
          todoFrame = undefined
          todoTimer = window.setTimeout(() => {
            todoTimer = undefined
            if (sdk.directory !== dir || params.id !== id) return
            untrack(() => {
              void sync.session.todo(id, cached ? { force: true } : undefined)
            })
          }, 0)
        })
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => visibleUserMessages().at(-1)?.id,
      (lastId, prevLastId) => {
        if (lastId && prevLastId && lastId > prevLastId) {
          setStore("messageId", undefined)
        }
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      sessionKey,
      () => {
        setStore("messageId", undefined)
        setStore("changes", "session")
        setUi("pendingMessage", undefined)
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => params.dir,
      (dir) => {
        if (!dir) return
        setStore("newSessionWorktree", "main")
      },
      { defer: true },
    ),
  )

  const selectionPreview = (path: string, selection: FileSelection) => {
    const content = file.get(path)?.content?.content
    if (!content) return undefined
    return previewSelectedLines(content, { start: selection.startLine, end: selection.endLine })
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    const selection = selectionFromLines(input.selection)
    const preview = input.preview ?? selectionPreview(input.file, selection)
    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(input.preview ? { preview: input.preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const reviewCommentActions = createMemo(() => ({
    moreLabel: language.t("common.moreOptions"),
    editLabel: language.t("common.edit"),
    deleteLabel: language.t("common.delete"),
    saveLabel: language.t("common.save"),
  }))

  const isEditableTarget = (target: EventTarget | null | undefined) => {
    if (!(target instanceof HTMLElement)) return false
    return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable
  }

  const deepActiveElement = () => {
    let current: Element | null = document.activeElement
    while (current instanceof HTMLElement && current.shadowRoot?.activeElement) {
      current = current.shadowRoot.activeElement
    }
    return current instanceof HTMLElement ? current : undefined
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    const path = event.composedPath()
    const target = path.find((item): item is HTMLElement => item instanceof HTMLElement)
    const activeElement = deepActiveElement()

    const protectedTarget = path.some(
      (item) => item instanceof HTMLElement && item.closest("[data-prevent-autofocus]") !== null,
    )
    if (protectedTarget || isEditableTarget(target)) return

    if (activeElement) {
      const isProtected = activeElement.closest("[data-prevent-autofocus]")
      const isInput = isEditableTarget(activeElement)
      if (isProtected || isInput) return
    }
    if (dialog.active) return

    if (activeElement === inputRef) {
      if (event.key === "Escape") inputRef?.blur()
      return
    }

    // Prefer the open terminal over the composer when it can take focus
    if (layout.terminal.opened()) {
      const id = terminal.active()
      if (id && shouldFocusTerminalOnKeyDown(event) && focusTerminalById(id)) return
    }

    // Only treat explicit scroll keys as potential "user scroll" gestures.
    if (event.key === "PageUp" || event.key === "PageDown" || event.key === "Home" || event.key === "End") {
      markScrollGesture()
      return
    }

    if (event.key.length === 1 && event.key !== "Unidentified" && !(event.ctrlKey || event.metaKey)) {
      if (composer.blocked()) return
      inputRef?.focus()
    }
  }

  const mobileChanges = createMemo(() => !isDesktop() && store.mobileTab === "changes")

  const fileTreeTab = () => layout.fileTree.tab()
  const setFileTreeTab = (value: "changes" | "all") => layout.fileTree.setTab(value)

  const [tree, setTree] = createStore({
    reviewScroll: undefined as HTMLDivElement | undefined,
    pendingDiff: undefined as string | undefined,
    activeDiff: undefined as string | undefined,
  })

  createEffect(
    on(
      sessionKey,
      () => {
        setTree({
          reviewScroll: undefined,
          pendingDiff: undefined,
          activeDiff: undefined,
        })
      },
      { defer: true },
    ),
  )

  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return
    setFileTreeTab("all")
  }

  const focusInput = () => inputRef?.focus()

  const openReviewFile = createOpenReviewFile({
    showAllFiles,
    tabForPath: file.tab,
    openTab: tabs().open,
    setActive: tabs().setActive,
    loadFile: file.load,
  })

  const changesOptions = ["session", "turn"] as const
  const changesOptionsList = [...changesOptions]

  const changesTitle = () => {
    if (!hasReview()) {
      return null
    }

    return (
      <Select
        options={changesOptionsList}
        current={store.changes}
        label={(option) =>
          option === "session" ? language.t("ui.sessionReview.title") : language.t("ui.sessionReview.title.lastTurn")
        }
        onSelect={(option) => option && setStore("changes", option)}
        variant="ghost"
        size="small"
        valueClass="text-14-medium"
      />
    )
  }

  const emptyTurn = () => (
    <div class="h-full pb-64 -mt-4 flex flex-col items-center justify-center text-center gap-6">
      <div class="text-14-regular text-text-weak max-w-56">{language.t("session.review.noChanges")}</div>
    </div>
  )

  const reviewEmpty = (input: { loadingClass: string; emptyClass: string }) => {
    if (store.changes === "turn") return emptyTurn()

    if (hasReview() && !diffsReady()) {
      return <div class={input.loadingClass}>{language.t("session.review.loadingChanges")}</div>
    }

    if (reviewEmptyKey() === "session.review.noVcs") {
      return (
        <div class={input.emptyClass}>
          <div class="flex flex-col gap-3">
            <div class="text-14-medium text-text-strong">{language.t("session.review.noVcs.createGit.title")}</div>
            <div class="text-14-regular text-text-base max-w-md" style={{ "line-height": "var(--line-height-normal)" }}>
              {language.t("session.review.noVcs.createGit.description")}
            </div>
          </div>
          <Button size="large" disabled={gitMutation.isPending} onClick={initGit}>
            {gitMutation.isPending
              ? language.t("session.review.noVcs.createGit.actionLoading")
              : language.t("session.review.noVcs.createGit.action")}
          </Button>
        </div>
      )
    }

    return (
      <div class={input.emptyClass}>
        <div class="text-14-regular text-text-weak max-w-56">{language.t(reviewEmptyKey())}</div>
      </div>
    )
  }

  const reviewContent = (input: {
    diffStyle: DiffStyle
    onDiffStyleChange?: (style: DiffStyle) => void
    classes?: SessionReviewTabProps["classes"]
    loadingClass: string
    emptyClass: string
  }) => (
    <Show when={!store.deferRender}>
      <SessionReviewTab
        title={changesTitle()}
        empty={reviewEmpty(input)}
        diffs={reviewDiffs}
        view={view}
        diffStyle={input.diffStyle}
        onDiffStyleChange={input.onDiffStyleChange}
        onScrollRef={(el) => setTree("reviewScroll", el)}
        focusedFile={tree.activeDiff}
        onLineComment={(comment) => addCommentToContext({ ...comment, origin: "review" })}
        onLineCommentUpdate={updateCommentInContext}
        onLineCommentDelete={removeCommentFromContext}
        lineCommentActions={reviewCommentActions()}
        comments={comments.all()}
        focusedComment={comments.focus()}
        onFocusedCommentChange={comments.setFocus}
        onViewFile={openReviewFile}
        classes={input.classes}
      />
    </Show>
  )

  const reviewPanel = () => (
    <div class="flex flex-col h-full overflow-hidden bg-panel contain-strict" data-ui-region="panel">
      <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
        {reviewContent({
          diffStyle: layout.review.diffStyle(),
          onDiffStyleChange: layout.review.setDiffStyle,
          loadingClass: "px-6 py-4 text-text-weak",
          emptyClass: "h-full pb-64 -mt-4 flex flex-col items-center justify-center text-center gap-6",
        })}
      </div>
    </div>
  )

  const todos = createMemo(() => (params.id ? sync.data.todo[params.id] : undefined))

  createEffect(() => {
    if (plan() && params.id) void sync.session.todo(params.id)
  })

  const planPanel = () => <PlanPanel todos={todos()} />
  const logsPanel = () => <LogsPanel />
  const shipPanel = () => (
    <div class="flex-1 h-full flex items-center justify-center text-text-weaker text-12-regular">
      Deployment info coming soon
    </div>
  )

  createEffect(
    on(
      activeFileTab,
      (active) => {
        if (!active) return
        if (fileTreeTab() !== "changes") return
        showAllFiles()
      },
      { defer: true },
    ),
  )

  const reviewDiffId = (path: string) => {
    const sum = checksum(path)
    if (!sum) return
    return `session-review-diff-${sum}`
  }

  const reviewDiffTop = (path: string) => {
    const root = tree.reviewScroll
    if (!root) return

    const id = reviewDiffId(path)
    if (!id) return

    const el = document.getElementById(id)
    if (!(el instanceof HTMLElement)) return
    if (!root.contains(el)) return

    const a = el.getBoundingClientRect()
    const b = root.getBoundingClientRect()
    return a.top - b.top + root.scrollTop
  }

  const scrollToReviewDiff = (path: string) => {
    const root = tree.reviewScroll
    if (!root) return false

    const top = reviewDiffTop(path)
    if (top === undefined) return false

    view().setScroll("review", { x: root.scrollLeft, y: top })
    root.scrollTo({ top, behavior: "auto" })
    return true
  }

  const focusReviewDiff = (path: string) => {
    openReviewPanel()
    view().review.openPath(path)
    setTree({ activeDiff: path, pendingDiff: path })
  }

  createEffect(() => {
    const pending = tree.pendingDiff
    if (!pending) return
    if (!tree.reviewScroll) return
    if (!diffsReady()) return

    const attempt = (count: number) => {
      if (tree.pendingDiff !== pending) return
      if (count > 60) {
        setTree("pendingDiff", undefined)
        return
      }

      const root = tree.reviewScroll
      if (!root) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      if (!scrollToReviewDiff(pending)) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      const top = reviewDiffTop(pending)
      if (top === undefined) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      if (Math.abs(root.scrollTop - top) <= 1) {
        setTree("pendingDiff", undefined)
        return
      }

      requestAnimationFrame(() => attempt(count + 1))
    }

    requestAnimationFrame(() => attempt(0))
  })

  createEffect(() => {
    const id = params.id
    if (!id) return

    const wants = isDesktop()
      ? desktopFileTreeOpen() || (desktopReviewOpen() && activeTab() === "review")
      : store.mobileTab === "changes"
    if (!wants) return
    if (sync.data.session_diff[id] !== undefined) return
    if (sync.status === "loading") return

    void sync.session.diff(id)
  })

  createEffect(
    on(
      () =>
        [
          sessionKey(),
          isDesktop()
            ? desktopFileTreeOpen() || (desktopReviewOpen() && activeTab() === "review")
            : store.mobileTab === "changes",
        ] as const,
      ([key, wants]) => {
        if (diffFrame !== undefined) cancelAnimationFrame(diffFrame)
        if (diffTimer !== undefined) window.clearTimeout(diffTimer)
        diffFrame = undefined
        diffTimer = undefined
        if (!wants) return

        const id = params.id
        if (!id) return
        if (!untrack(() => sync.data.session_diff[id] !== undefined)) return

        diffFrame = requestAnimationFrame(() => {
          diffFrame = undefined
          diffTimer = window.setTimeout(() => {
            diffTimer = undefined
            if (sessionKey() !== key) return
            void sync.session.diff(id, { force: true })
          }, 0)
        })
      },
      { defer: true },
    ),
  )

  let treeDir: string | undefined
  createEffect(() => {
    const dir = sdk.directory
    if (!isDesktop()) return
    if (!layout.fileTree.opened()) return
    if (sync.status === "loading") return

    fileTreeTab()
    const refresh = treeDir !== dir
    treeDir = dir
    void (refresh ? file.tree.refresh("") : file.tree.list(""))
  })

  createEffect(
    on(
      () => sdk.directory,
      () => {
        const tab = activeFileTab()
        if (!tab) return
        const path = file.pathFromTab(tab)
        if (!path) return
        void file.load(path, { force: true })
      },
      { defer: true },
    ),
  )

  const sessionStreaming = createMemo(() => {
    const id = params.id
    if (!id) return false
    return isSessionWorking(sync.data.session_status[id], sync.data.message[id])
  })

  createEffect(
    on(
      sessionStreaming,
      (streaming, prev) => {
        if (streaming || prev === undefined) return
        const timers = [0, 200, 500].map((ms) => window.setTimeout(() => ensureBodyPointerEvents(), ms))
        onCleanup(() => {
          for (const timer of timers) window.clearTimeout(timer)
        })
      },
      { defer: true },
    ),
  )

  const autoScroll = createAutoScroll({
    working: sessionStreaming,
    overflowAnchor: "dynamic",
  })

  let scrollStateFrame: number | undefined
  let scrollStateTarget: HTMLDivElement | undefined
  let fillFrame: number | undefined

  const updateScrollState = (el: HTMLDivElement) => {
    const max = el.scrollHeight - el.clientHeight
    const overflow = max > 1
    const bottom = !overflow || el.scrollTop >= max - 2

    if (ui.scroll.overflow === overflow && ui.scroll.bottom === bottom) return
    setUi("scroll", { overflow, bottom })
  }

  const scheduleScrollState = (el: HTMLDivElement) => {
    scrollStateTarget = el
    if (scrollStateFrame !== undefined) return

    scrollStateFrame = requestAnimationFrame(() => {
      scrollStateFrame = undefined

      const target = scrollStateTarget
      scrollStateTarget = undefined
      if (!target) return

      updateScrollState(target)
    })
  }

  const resumeScroll = () => {
    setStore("messageId", undefined)
    autoScroll.forceScrollToBottom()
    clearMessageHash()

    const el = scroller
    if (el) scheduleScrollState(el)
  }

  // When the user returns to the bottom, treat the active message as "latest".
  createEffect(
    on(
      autoScroll.userScrolled,
      (scrolled) => {
        if (scrolled) return
        setStore("messageId", undefined)
        clearMessageHash()
      },
      { defer: true },
    ),
  )

  let fill = () => {}

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scroller = el
    autoScroll.scrollRef(el)
    if (!el) return
    scheduleScrollState(el)
    fill()
  }

  const markUserScroll = () => {
    scrollMark += 1
  }

  createResizeObserver(
    () => content,
    () => {
      const el = scroller
      if (el) scheduleScrollState(el)
      fill()
    },
  )

  const historyWindow = createSessionHistoryWindow({
    sessionID: () => params.id,
    messagesReady,
    loaded: () => messages().length,
    visibleUserMessages,
    historyMore,
    historyLoading,
    loadMore: (sessionID) => sync.session.history.loadMore(sessionID),
    userScrolled: autoScroll.userScrolled,
    scroller: () => scroller,
  })

  fill = () => {
    if (fillFrame !== undefined) return

    fillFrame = requestAnimationFrame(() => {
      fillFrame = undefined

      if (!params.id || !messagesReady()) return
      if (autoScroll.userScrolled() || historyLoading()) return

      const el = scroller
      if (!el) return
      if (el.scrollHeight > el.clientHeight + 1) return
      if (historyWindow.turnStart() <= 0 && !historyMore()) return

      void historyWindow.loadAndReveal()
    })
  }

  createEffect(
    on(
      () =>
        [
          params.id,
          messagesReady(),
          historyWindow.turnStart(),
          historyMore(),
          historyLoading(),
          autoScroll.userScrolled(),
          visibleUserMessages().length,
        ] as const,
      ([id, ready, start, more, loading, scrolled]) => {
        if (!id || !ready || loading || scrolled) return
        if (start <= 0 && !more) return
        fill()
      },
      { defer: true },
    ),
  )

  const draft = (id: string) =>
    extractPromptFromParts(sync.data.part[id] ?? [], {
      directory: sdk.directory,
      attachmentName: language.t("common.attachment"),
    })

  const line = (id: string) => {
    const text = draft(id)
      .map((part) => (part.type === "image" ? `[image:${part.filename}]` : part.content))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
    if (text) return text
    return `[${language.t("common.attachment")}]`
  }

  const fail = (err: unknown) => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: formatServerError(err, language.t),
    })
  }

  const merge = (next: NonNullable<ReturnType<typeof info>>) =>
    sync.set("session", (list) => {
      const idx = list.findIndex((item) => item.id === next.id)
      if (idx < 0) return [...list, next].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const out = list.slice()
      out[idx] = next
      return out
    })

  const createSession = (replace?: boolean, done?: () => void) => {
    const dir = params.dir
    if (top.creating || !dir) return

    setTop("creating", true)
    void sdk.client.session
      .create()
      .then((x) => x.data ?? undefined)
      .then((created) => {
        if (!created) return
        if (params.dir !== dir) return
        merge(created)
        showSession(created.id, true)
        local.session.promote(sdk.directory, created.id)
        warmSessionTab({
          directory: dir,
          sessionID: created.id,
          laneActivate: (input) => sdk.client.session.laneActivate(input),
          syncSession: (id) => sync.session.sync(id),
        })
        navigate(href(created.id), replace ? { replace: true } : undefined)
        sessionTabListSync?.scrollToEnd()
      })
      .catch((err) => {
        showToast({
          variant: "error",
          title: language.t("prompt.toast.sessionCreateFailed.title"),
          description: formatServerError(err, language.t),
        })
      })
      .finally(() => {
        setTop("creating", false)
        done?.()
      })
  }

  const navigateAfterSessionRemoval = (sessionID: string, parentID?: string, nextSessionID?: string) => {
    if (params.id !== sessionID) return
    if (parentID) {
      navigate(sessionRouteHref(params.dir!, parentID, searchParams))
      return
    }
    if (nextSessionID) {
      navigate(href(nextSessionID))
      return
    }
    navigate(rootHref())
  }

  const archiveSession = async (sessionID: string) => {
    const session = sync.session.get(sessionID)
    if (!session) return

    const sessions = base()
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    await sdk.client.session
      .update({ sessionID, time: { archived: Date.now() } })
      .then(() => {
        sync.set(
          produce((draft) => {
            const idx = draft.session.findIndex((s) => s.id === sessionID)
            if (idx !== -1) draft.session.splice(idx, 1)
          }),
        )
        setOpen(orderKey(), (prev) => (prev ?? []).filter((item) => item !== sessionID))
        navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id)
      })
      .catch((err) => {
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: formatServerError(err, language.t),
        })
      })
  }

  useSessionCommands({
    navigateMessageByOffset,
    setActiveMessage,
    focusInput,
    createSession,
    review: reviewTab,
  })

  const roll = (sessionID: string, next: NonNullable<ReturnType<typeof info>>["revert"]) =>
    sync.set("session", (list) => {
      const idx = list.findIndex((item) => item.id === sessionID)
      if (idx < 0) return list
      const out = list.slice()
      out[idx] = { ...out[idx], revert: next }
      return out
    })

  const busy = (sessionID: string) =>
    isSessionWorking(sync.data.session_status[sessionID], sync.data.message[sessionID])

  const queuedFollowups = createMemo(() => {
    const id = params.id
    if (!id) return emptyFollowups
    return followup.items[id] ?? emptyFollowups
  })

  const editingFollowup = createMemo(() => {
    const id = params.id
    if (!id) return
    return followup.edit[id]
  })

  const followupMutation = useMutation(() => ({
    mutationFn: async (input: { sessionID: string; id: string; manual?: boolean }) => {
      const item = (followup.items[input.sessionID] ?? []).find((entry) => entry.id === input.id)
      if (!item) return

      if (input.manual) setFollowup("paused", input.sessionID, undefined)
      setFollowup("failed", input.sessionID, undefined)

      const ok = await sendFollowupDraft({
        client: sdk.client,
        sync,
        globalSync,
        draft: item,
        optimisticBusy: item.sessionDirectory === sdk.directory,
      }).catch((err) => {
        setFollowup("failed", input.sessionID, input.id)
        fail(err)
        return false
      })
      if (!ok) return

      setFollowup("items", input.sessionID, (items) => (items ?? []).filter((entry) => entry.id !== input.id))
      if (input.manual) resumeScroll()
    },
  }))

  const followupBusy = (sessionID: string) =>
    followupMutation.isPending && followupMutation.variables?.sessionID === sessionID

  const sendingFollowup = createMemo(() => {
    const id = params.id
    if (!id) return
    if (!followupBusy(id)) return
    return followupMutation.variables?.id
  })

  const queueEnabled = createMemo(() => {
    const id = params.id
    if (!id) return false
    return settings.general.followup() === "queue" && busy(id) && !composer.blocked()
  })

  const followupText = (item: FollowupDraft) => {
    const text = item.prompt
      .map((part) => {
        if (part.type === "image") return `[image:${part.filename}]`
        if (part.type === "file") return `[file:${part.path}]`
        if (part.type === "agent") return `@${part.name}`
        return part.content
      })
      .join("")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => !!line)

    if (text) return text
    return `[${language.t("common.attachment")}]`
  }

  const queueFollowup = (draft: FollowupDraft) => {
    setFollowup("items", draft.sessionID, (items) => [
      ...(items ?? []),
      { id: Identifier.ascending("message"), ...draft },
    ])
    setFollowup("failed", draft.sessionID, undefined)
    setFollowup("paused", draft.sessionID, undefined)
  }

  const followupDock = createMemo(() => queuedFollowups().map((item) => ({ id: item.id, text: followupText(item) })))

  const sendFollowup = (sessionID: string, id: string, opts?: { manual?: boolean }) => {
    const item = (followup.items[sessionID] ?? []).find((entry) => entry.id === id)
    if (!item) return Promise.resolve()
    if (followupBusy(sessionID)) return Promise.resolve()

    return followupMutation.mutateAsync({ sessionID, id, manual: opts?.manual })
  }

  const editFollowup = (id: string) => {
    const sessionID = params.id
    if (!sessionID) return
    if (followupBusy(sessionID)) return

    const item = queuedFollowups().find((entry) => entry.id === id)
    if (!item) return

    setFollowup("items", sessionID, (items) => (items ?? []).filter((entry) => entry.id !== id))
    setFollowup("failed", sessionID, (value) => (value === id ? undefined : value))
    setFollowup("edit", sessionID, {
      id: item.id,
      prompt: item.prompt,
      context: item.context,
    })
  }

  const clearFollowupEdit = () => {
    const id = params.id
    if (!id) return
    setFollowup("edit", id, undefined)
  }

  const halt = (sessionID: string) =>
    busy(sessionID) ? sdk.client.session.abort({ sessionID }).catch(() => {}) : Promise.resolve()

  const revertMutation = useMutation(() => ({
    mutationFn: async (input: { sessionID: string; messageID: string }) => {
      const prev = prompt.current().slice()
      const last = info()?.revert
      const value = draft(input.messageID)
      batch(() => {
        roll(input.sessionID, { messageID: input.messageID })
        prompt.set(value)
      })
      await halt(input.sessionID)
        .then(() => sdk.client.session.revert(input))
        .then((result) => {
          if (result.data) merge(result.data)
        })
        .catch((err) => {
          batch(() => {
            roll(input.sessionID, last)
            prompt.set(prev)
          })
          fail(err)
        })
    },
  }))

  const restoreMutation = useMutation(() => ({
    mutationFn: async (id: string) => {
      const sessionID = params.id
      if (!sessionID) return

      const next = userMessages().find((item) => item.id > id)
      const prev = prompt.current().slice()
      const last = info()?.revert

      batch(() => {
        roll(sessionID, next ? { messageID: next.id } : undefined)
        if (next) {
          prompt.set(draft(next.id))
          return
        }
        prompt.reset()
      })

      const task = !next
        ? halt(sessionID).then(() => sdk.client.session.unrevert({ sessionID }))
        : halt(sessionID).then(() =>
            sdk.client.session.revert({
              sessionID,
              messageID: next.id,
            }),
          )

      await task
        .then((result) => {
          if (result.data) merge(result.data)
        })
        .catch((err) => {
          batch(() => {
            roll(sessionID, last)
            prompt.set(prev)
          })
          fail(err)
        })
    },
  }))

  const reverting = createMemo(() => revertMutation.isPending || restoreMutation.isPending)
  const restoring = createMemo(() => (restoreMutation.isPending ? restoreMutation.variables : undefined))

  const revert = (input: { sessionID: string; messageID: string }) => {
    if (reverting()) return
    return revertMutation.mutateAsync(input)
  }

  const restore = (id: string) => {
    if (!params.id || reverting()) return
    return restoreMutation.mutateAsync(id)
  }

  const rolled = createMemo(() => {
    const id = revertMessageID()
    if (!id) return []
    return userMessages()
      .filter((item) => item.id >= id)
      .map((item) => ({ id: item.id, text: line(item.id) }))
  })

  const actions = { revert }

  // Change dock: shown after a turn completes with file diffs, dismissed per-turn
  const [acceptedTurnID, setAcceptedTurnID] = createSignal<string | undefined>(undefined)

  const changeDockFiles = createMemo<FileDiff[]>(() => {
    const sessionID = params.id
    if (!sessionID) return []
    if (busy(sessionID)) return []
    return turnDiffs()
  })

  const changeDockVisible = createMemo(() => {
    const files = changeDockFiles()
    if (files.length === 0) return false
    const lastMsg = lastUserMessage()
    if (!lastMsg) return false
    return acceptedTurnID() !== lastMsg.id
  })

  const acceptChanges = () => {
    const id = lastUserMessage()?.id
    if (id) setAcceptedTurnID(id)
  }

  const rejectChanges = () => {
    const sessionID = params.id
    if (!sessionID) return
    const id = lastUserMessage()?.id
    if (!id) return
    void revert({ sessionID, messageID: id })
  }

  const openReviewView = () => {
    setSearchParams({ ...searchParams, view: "review" })
  }

  createEffect(() => {
    const sessionID = params.id
    if (!sessionID) return

    const item = queuedFollowups()[0]
    if (!item) return
    if (followupBusy(sessionID)) return
    if (followup.failed[sessionID] === item.id) return
    if (followup.paused[sessionID]) return
    if (composer.blocked()) return
    if (busy(sessionID)) return

    void sendFollowup(sessionID, item.id)
  })

  createResizeObserver(
    () => promptDock,
    ({ height }) => {
      const next = Math.ceil(height)

      if (next === dockHeight) return

      const el = scroller
      const delta = next - dockHeight
      const stick = el
        ? !autoScroll.userScrolled() || el.scrollHeight - el.clientHeight - el.scrollTop < 10 + Math.max(0, delta)
        : false

      dockHeight = next

      if (stick) autoScroll.forceScrollToBottom()

      if (el) scheduleScrollState(el)
      fill()
    },
  )

  const { clearMessageHash, scrollToMessage } = useSessionHashScroll({
    sessionKey,
    sessionID: () => params.id,
    messagesReady,
    visibleUserMessages,
    historyMore,
    historyLoading,
    loadMore: (sessionID) => sync.session.history.loadMore(sessionID),
    turnStart: historyWindow.turnStart,
    currentMessageId: () => store.messageId,
    pendingMessage: () => ui.pendingMessage,
    setPendingMessage: (value) => setUi("pendingMessage", value),
    setActiveMessage,
    setTurnStart: historyWindow.setTurnStart,
    autoScroll,
    scroller: () => scroller,
    anchor,
    scheduleScrollState,
    consumePendingMessage: layout.pendingMessage.consume,
  })

  createEffect(
    on(
      () => params.id,
      (id) => {
        if (!id) requestAnimationFrame(() => inputRef?.focus())
      },
    ),
  )

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
    const removePointerGuard = restoreBodyPointerEventsOnInteraction()
    onCleanup(() => removePointerGuard?.())
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
    if (reviewFrame !== undefined) cancelAnimationFrame(reviewFrame)
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
    if (todoFrame !== undefined) cancelAnimationFrame(todoFrame)
    if (todoTimer !== undefined) window.clearTimeout(todoTimer)
    if (diffFrame !== undefined) cancelAnimationFrame(diffFrame)
    if (diffTimer !== undefined) window.clearTimeout(diffTimer)
    if (scrollStateFrame !== undefined) cancelAnimationFrame(scrollStateFrame)
    if (fillFrame !== undefined) cancelAnimationFrame(fillFrame)
  })

  createEffect(() => {
    const fresh = searchParams.new
    const dir = params.dir
    if (fresh !== "1" || top.creating || !dir) return

    const next = { ...searchParams, new: undefined }
    createSession(true, () => {
      if (params.dir !== dir || searchParams.new !== "1") return
      setSearchParams(next)
    })
  })

  function SessionVisual(props: { session: { id: string; title?: string } }) {
    return (
      <span class="flex min-w-0 max-w-[160px] items-center gap-1.5">
        <SessionAgentIcon sessionID={props.session.id} working={busy(props.session.id)} />
        <span class="truncate">{props.session.title || props.session.id.slice(0, 8)}</span>
      </span>
    )
  }

  function SortableSession(props: { session: { id: string; title?: string } }) {
    const sortable = createSortable(props.session.id)
    return (
      <div use:sortable class="h-full flex items-center" classList={{ "opacity-0": sortable.isActiveDraggable }}>
        <Tabs.Trigger
          value={props.session.id}
          onClick={() => navigateToSessionTab(props.session.id)}
          closeButton={
            <Tooltip placement="bottom" value={language.t("common.closeTab")}>
              <IconButton
                icon="close-small"
                variant="ghost"
                class="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation()
                  closeSession(props.session.id)
                }}
                aria-label={language.t("common.closeTab")}
              />
            </Tooltip>
          }
          hideCloseButton
          onMiddleClick={() => closeSession(props.session.id)}
        >
          <SessionVisual session={props.session} />
        </Tabs.Trigger>
      </div>
    )
  }

  return (
    <div class="relative bg-transparent size-full overflow-hidden flex flex-col">
      <SessionHeader />
      <div class="flex-1 min-h-0 flex flex-col md:flex-row bg-transparent pb-[72px] md:pb-0">
        <Show when={!full() && (isDesktop() || store.mobileTab === "studio")}>
          <div class="flex-1 min-w-0 min-h-0 flex flex-col">
            <SessionSidePanel
              reviewPanel={reviewPanel}
              planPanel={planPanel}
              logsPanel={logsPanel}
              shipPanel={shipPanel}
              activeDiff={tree.activeDiff}
              focusReviewDiff={focusReviewDiff}
              reviewSnap={ui.reviewSnap}
              size={size}
            />

            <TerminalPanel />
          </div>
        </Show>

        <Show when={!isDesktop() && store.mobileTab === "terminal"}>
          <div class="flex-1 min-w-0 min-h-0">
            <TerminalPanel fullscreen />
          </div>
        </Show>

        <Show when={isDesktop() || store.mobileTab === "session" || store.mobileTab === "changes"}>
          <div
            data-ui-pattern={isDesktop() && full() ? "layout.split" : undefined}
            classList={{
              "shrink-0 overflow-hidden": isDesktop() && !full(),
              "rounded-xl": true,
              "border-l border-border-weaker-base": isDesktop() && !full() && sessionOpened(),
              "ml-3": isDesktop() && !full() && sessionOpened(),
              "flex-1 min-w-0 min-h-0": !isDesktop() || full(),
              relative: isDesktop() && full(),
              flex: isDesktop() && full(),
              "m-2 overflow-hidden border border-border-weaker-base bg-sidebar p-2": isDesktop() && full(),
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
                isDesktop() && !full() && !size.active(),
            }}
            style={{
              width: isDesktop() && !full() ? (sessionOpened() ? `${sessionWidth()}px` : "0px") : undefined,
            }}
            aria-hidden={isDesktop() && !full() && !sessionOpened()}
            inert={isDesktop() && !full() && !sessionOpened()}
          >
            <Show when={isDesktop() && full() && params.dir}>
              <SessionThreadSidebar
                sessions={base}
                activeId={() => params.id}
                slug={params.dir!}
                creating={() => top.creating}
                isBusy={busy}
                onSelect={(id) => navigateToSessionTab(id)}
                onNew={() => {
                  if (!params.id) {
                    local.session.reset()
                    prompt.reset()
                    createSession(true)
                    return
                  }
                  createSession()
                }}
                onArchive={(session) => void archiveSession(session.id)}
              />
            </Show>
            <div
              id="chat-panel"
              data-ui-region="companion"
              data-ui-pattern={isDesktop() && full() ? "layout.split" : undefined}
              data-ui-slot={isDesktop() && full() ? "pane" : undefined}
              classList={{
                "@container relative shrink-0 flex flex-col h-full min-h-0 bg-panel rounded-xl border border-border-weaker-base gap-2": true,
                "flex-1 min-w-0": isDesktop() && full(),
                "pointer-events-none": isDesktop() && !full() && !sessionOpened(),
              }}
              style={{
                width: isDesktop() && !full() ? `${sessionWidth()}px` : undefined,
              }}
            >
              <Show when={isDesktop() && params.dir && full()}>
                <div class="absolute right-2 top-3 z-20 flex items-center justify-end shrink-0">
                  <Tooltip value={language.t("session.threadSidebar.exitFullscreen")} placement="bottom">
                    <IconButton
                      icon="collapse"
                      variant="ghost"
                      class="!rounded-md"
                      onClick={() => layout.session.toggleFullscreen(params.dir!)}
                      aria-label={language.t("session.threadSidebar.exitFullscreen")}
                    />
                  </Tooltip>
                </div>
              </Show>
              <Show when={isDesktop() && !full() && sessionOpened()}>
                <div class="absolute left-0 top-0 bottom-0 z-10 -translate-x-1/2" onPointerDown={() => size.start()}>
                  <ResizeHandle
                    direction="horizontal"
                    edge="start"
                    size={sessionWidth()}
                    min={320}
                    max={typeof window === "undefined" ? 800 : window.innerWidth * 0.6}
                    onResize={(width) => {
                      size.touch()
                      layout.session.resize(width)
                    }}
                  />
                </div>
              </Show>
              <Show when={isDesktop() && !full() && (sessionList().length > 0 || !params.id)}>
                <DragDropProvider
                  onDragStart={handleSessionDragStart}
                  onDragEnd={handleSessionDragEnd}
                  onDragOver={handleSessionDragOver}
                  collisionDetector={closestCenter}
                >
                  <DragDropSensors />
                  <ConstrainDragYAxis />
                  <Tabs class="h-auto" value={params.id ?? "new"} variant="normal">
                    <Tabs.List
                      class="gap-2!"
                      ref={(el: HTMLDivElement) => {
                        sessionTabListSync?.stop()
                        sessionTabListSync = createSessionTabListSync({
                          el,
                          activeId: () => params.id,
                        })
                        onCleanup(() => {
                          sessionTabListSync?.stop()
                          sessionTabListSync = undefined
                        })
                      }}
                    >
                      <SortableProvider ids={sessionList().map((session) => session.id)}>
                        <For each={sessionList()}>{(session) => <SortableSession session={session} />}</For>
                      </SortableProvider>
                      <Show when={!params.id}>
                        <Tabs.Trigger value="new" onClick={() => navigateToSessionTab("new")}>
                          <span class="max-w-[160px] truncate">{language.t("command.session.new")}</span>
                        </Tabs.Trigger>
                      </Show>
                      <div class="min-w-2 flex-1" aria-hidden />
                      <div
                        class="sticky right-0 z-10 flex h-full shrink-0 items-center gap-0.5 bg-background-stronger pl-2 pr-2"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <Tooltip value={language.t("command.session.new")} placement="bottom">
                          <IconButton
                            icon="plus-small"
                            variant="ghost"
                            iconSize="large"
                            class="!rounded-md"
                            disabled={top.creating}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!params.id) {
                                local.session.reset()
                                prompt.reset()
                                createSession(true)
                                return
                              }
                              createSession()
                            }}
                            aria-label={language.t("command.session.new")}
                          />
                        </Tooltip>
                        <Tooltip value="Fullscreen" placement="bottom">
                          <IconButton
                            icon="expand"
                            variant="ghost"
                            class="!rounded-md"
                            onClick={() => layout.session.toggleFullscreen(params.dir!)}
                            aria-label="Fullscreen"
                          />
                        </Tooltip>
                      </div>
                    </Tabs.List>
                  </Tabs>
                  <DragOverlay>
                    <Show when={top.activeDraggable} keyed>
                      {(id) => (
                        <Show when={sessionList().find((session) => session.id === id)} keyed>
                          {(session) => (
                            <div data-component="tabs-drag-preview" class="h-full flex items-center">
                              <SessionVisual session={session} />
                            </div>
                          )}
                        </Show>
                      )}
                    </Show>
                  </DragOverlay>
                </DragDropProvider>
              </Show>
              <div
                classList={{
                  "min-h-0 overflow-hidden": true,
                  "flex-1": true,
                }}
              >
                <Switch>
                  <Match when={params.id && !sessionTabEmpty()}>
                    <MessageTimeline
                      mobileChanges={mobileChanges()}
                      mobileFallback={reviewContent({
                        diffStyle: "unified",
                        classes: {
                          root: "pb-8",
                          header: "px-4",
                          container: "px-4",
                        },
                        loadingClass: "px-4 py-4 text-text-weak",
                        emptyClass: "h-full pb-64 -mt-4 flex flex-col items-center justify-center text-center gap-6",
                      })}
                      actions={actions}
                      scroll={ui.scroll}
                      onResumeScroll={resumeScroll}
                      setScrollRef={setScrollRef}
                      onScheduleScrollState={scheduleScrollState}
                      onAutoScrollHandleScroll={autoScroll.handleScroll}
                      onMarkScrollGesture={markScrollGesture}
                      hasScrollGesture={hasScrollGesture}
                      onUserScroll={markUserScroll}
                      onTurnBackfillScroll={historyWindow.onScrollerScroll}
                      onAutoScrollInteraction={autoScroll.handleInteraction}
                      centered={centered()}
                      setContentRef={(el) => {
                        content = el
                        autoScroll.contentRef(el)
                        const root = scroller
                        if (root) scheduleScrollState(root)
                      }}
                      turnStart={historyWindow.turnStart()}
                      historyMore={historyMore()}
                      historyLoading={historyLoading()}
                      onLoadEarlier={() => {
                        void historyWindow.loadAndReveal()
                      }}
                      renderedUserMessages={historyWindow.renderedUserMessages()}
                      anchor={anchor}
                    />
                  </Match>
                  <Match when={true}>
                    <NewSessionView worktree={newSessionWorktree()} compact showIcon={!!params.id} class="h-full" />
                  </Match>
                </Switch>
              </div>
              <PlanApprovalBanner />
              <SessionComposerRegion
                state={composer}
                ready={!store.deferRender && messagesReady()}
                centered={centered()}
                inputRef={(el) => {
                  inputRef = el
                }}
                newSessionWorktree={newSessionWorktree()}
                onNewSessionWorktreeReset={() => setStore("newSessionWorktree", "main")}
                onSubmit={() => {
                  comments.clear()
                  resumeScroll()
                }}
                onResponseSubmit={resumeScroll}
                followup={
                  params.id
                    ? {
                        queue: queueEnabled,
                        items: followupDock(),
                        sending: sendingFollowup(),
                        edit: editingFollowup(),
                        onQueue: queueFollowup,
                        onAbort: () => {
                          const id = params.id
                          if (!id) return
                          setFollowup("paused", id, true)
                        },
                        onSend: (id) => {
                          void sendFollowup(params.id!, id, { manual: true })
                        },
                        onEdit: editFollowup,
                        onEditLoaded: clearFollowupEdit,
                      }
                    : undefined
                }
                revert={
                  rolled().length > 0
                    ? {
                        items: rolled(),
                        restoring: restoring(),
                        disabled: reverting(),
                        onRestore: restore,
                      }
                    : undefined
                }
                changes={
                  changeDockVisible()
                    ? {
                        files: changeDockFiles(),
                        rejecting: reverting(),
                        onAccept: acceptChanges,
                        onReject: rejectChanges,
                        onReview: openReviewView,
                      }
                    : undefined
                }
                setPromptDockRef={(el) => {
                  promptDock = el
                }}
                fresh={!params.id}
              />
            </div>
          </div>
        </Show>
      </div>
      <Show when={!isDesktop()}>
        <nav
          aria-label="Mobile session navigation"
          class="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
          <div class="pointer-events-auto flex items-center justify-center gap-1 overflow-x-auto no-scrollbar rounded-full border border-border-base/60 bg-background-base/85 p-1 shadow-[0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-md">
            <For each={railItems()}>
              {(item) => {
                const active = () => {
                  const v = searchParams.view
                  const current = v === "preview" ? "browser" : v === "data" ? "graph" : (v ?? "graph")
                  return current === item.tab
                }
                return (
                  <button
                    class="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors"
                    classList={{
                      "bg-surface-raised-base text-text-strong": active(),
                      "text-text-weak hover:text-text-base": !active(),
                    }}
                    onClick={() => {
                      setStore("mobileTab", "studio")
                      setSearchParams({ view: item.tab })
                      if (item.tab === "code") {
                        const first = openedTabs()[0]
                        if (first) tabs().setActive(first)
                        else if (contextOpen()) tabs().setActive("context")
                        else tabs().setActive("empty")
                      }
                    }}
                    aria-label={item.label}
                    aria-pressed={active()}
                    title={item.label}
                  >
                    {item.icon()}
                  </button>
                )
              }}
            </For>
          </div>
        </nav>
      </Show>
    </div>
  )
}

function PlanApprovalBanner() {
  const trellis = useTrellisOptional()
  const [expanded, setExpanded] = createSignal(false)
  const [rejecting, setRejecting] = createSignal(false)
  const [reason, setReason] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const plan = createMemo(() => trellis?.pendingPlan)
  const mode = createMemo(() => trellis?.planMode ?? false)

  const approve = async () => {
    setBusy(true)
    await trellis?.approvePlan()
    setBusy(false)
    showToast({ title: "Plan approved", variant: "success" })
  }

  const reject = async () => {
    setBusy(true)
    await trellis?.rejectPlan(reason() || undefined)
    setBusy(false)
    setRejecting(false)
    setReason("")
    showToast({ title: "Plan rejected", variant: "default" })
  }

  const cancel = async () => {
    setBusy(true)
    await trellis?.cancelPlan()
    setBusy(false)
  }

  return (
    <>
      <Show when={mode() && !plan()}>
        <div class="mx-4 mb-2 px-3 py-1.5 rounded-lg border border-border-warning/40 bg-surface-warning/10 flex items-center gap-2">
          <div class="size-2 rounded-full bg-text-warning animate-pulse" />
          <span class="text-12-medium text-text-warning">Plan Mode Active</span>
          <div class="flex-1" />
          <Button size="small" variant="ghost" onClick={cancel} disabled={busy()}>
            Cancel
          </Button>
        </div>
      </Show>
      <Show when={plan()?.status === "submitted"}>
        {(_) => {
          const p = () => plan()!
          return (
            <div class="mx-4 mb-2 rounded-xl border border-border-warning/50 bg-surface-warning/5 overflow-hidden">
              <div class="px-4 py-3 flex items-center gap-3">
                <Icon name="alert-triangle" size="small" class="text-text-warning shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="text-13-medium text-text-strong">{p().title}</div>
                  <div class="text-11-regular text-text-weak">
                    {p().operations.length} operation{p().operations.length !== 1 ? "s" : ""}
                    {p().submittedAt ? ` \u2022 submitted ${timeAgo(p().submittedAt!)}` : ""}
                  </div>
                </div>
                <Button size="small" variant="ghost" onClick={() => setExpanded(!expanded())}>
                  {expanded() ? "Hide" : "Details"}
                </Button>
                <Button size="small" variant="ghost" onClick={approve} disabled={busy()}>
                  Approve
                </Button>
                <Button size="small" variant="ghost" onClick={() => setRejecting(true)} disabled={busy()}>
                  Reject
                </Button>
              </div>
              <Show when={expanded()}>
                <div class="px-4 pb-3 flex flex-col gap-1.5 border-t border-border-warning/20 pt-2">
                  <For each={p().operations}>
                    {(op) => (
                      <div class="flex items-center gap-2 px-2 py-1 rounded-md bg-background-base/50 text-12-regular">
                        <span class="text-text-info font-mono">{op.kind}</span>
                        <Show when={op.entityType}>
                          <span class="text-text-weak">{op.entityType}</span>
                        </Show>
                        <Show when={op.entityId}>
                          <span class="text-text-weak font-mono">{op.entityId}</span>
                        </Show>
                        <Show when={op.description}>
                          <span class="text-text-weaker truncate flex-1">{op.description}</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={rejecting()}>
                <div class="px-4 pb-3 flex items-center gap-2 border-t border-border-warning/20 pt-2">
                  <input
                    type="text"
                    placeholder="Rejection reason (optional)..."
                    value={reason()}
                    onInput={(e) => setReason(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && reject()}
                    class="flex-1 px-2 py-1 rounded-md bg-background-base border border-border-base text-13-regular text-text-base placeholder:text-text-weaker outline-none focus:border-border-strong-base"
                  />
                  <Button size="small" variant="ghost" onClick={reject} disabled={busy()}>
                    Confirm
                  </Button>
                  <IconButton icon="close-small" variant="ghost" onClick={() => setRejecting(false)} />
                </div>
              </Show>
            </div>
          )
        }}
      </Show>
    </>
  )
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

import { For, createEffect, createMemo, on, onCleanup, Show, Index, type JSX, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useMutation } from "@tanstack/solid-query"
import { Button } from "@opencode-ai/ui/button"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Dialog } from "@opencode-ai/ui/dialog"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { SessionTurn } from "@opencode-ai/ui/session-turn"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { TextField } from "@opencode-ai/ui/text-field"
import type { AssistantMessage, Message as MessageType, Part, TextPart, UserMessage } from "@opencode-ai/sdk/v2"
import { showToast } from "@opencode-ai/ui/toast"
import { Binary } from "@opencode-ai/util/binary"
import { getFilename } from "@opencode-ai/util/path"
import { Popover as KobaltePopover } from "@kobalte/core/popover"
import { shouldMarkBoundaryGesture, normalizeWheelDelta } from "@/pages/session/message-gesture"
import { SessionContextUsage } from "@/components/session-context-usage"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { sessionRouteHref } from "@/pages/session/helpers"
import { useSessionKey } from "@/pages/session/session-layout"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useFile } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useEntityDialog } from "@/components/entity-dialog"
import { useTrellis } from "@/context/trellis"
import { handleReferenceClick } from "@/lib/entity-navigate"
import { animate } from "motion"
import { messageAgentColor } from "@/utils/agent"
import { parseCommentNote, readCommentMetadata } from "@/utils/comment-note"
import { makeTimer } from "@solid-primitives/timer"
import { createReliableUpdate, createErrorBoundary, createSyncedState } from "@/utils/ui-update-reliability"
import { isSessionWorking } from "@/lib/session-working"
import { SessionActivityIndicator } from "@/components/session-activity-indicator"
import { AgentTurnActions } from "@/components/agent-turn-actions"
import type { EntityNav } from "@/lib/entity-navigate"

type MessageComment = {
  path: string
  comment: string
  selection?: {
    startLine: number
    endLine: number
  }
}

const emptyMessages: MessageType[] = []
const idle = { type: "idle" as const }

type UserActions = {
  fork?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  revert?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

const messageComments = (parts: Part[]): MessageComment[] =>
  parts.flatMap((part) => {
    if (part.type !== "text" || !(part as TextPart).synthetic) return []
    const next = readCommentMetadata(part.metadata) ?? parseCommentNote(part.text)
    if (!next) return []
    return [
      {
        path: next.path,
        comment: next.comment,
        selection: next.selection
          ? {
              startLine: next.selection.startLine,
              endLine: next.selection.endLine,
            }
          : undefined,
      },
    ]
  })

const boundaryTarget = (root: HTMLElement, target: EventTarget | null) => {
  const current = target instanceof Element ? target : undefined
  const nested = current?.closest("[data-scrollable]")
  if (!nested || nested === root) return root
  if (!(nested instanceof HTMLElement)) return root
  return nested
}

const markBoundaryGesture = (input: {
  root: HTMLDivElement
  target: EventTarget | null
  delta: number
  onMarkScrollGesture: (target?: EventTarget | null) => void
}) => {
  const target = boundaryTarget(input.root, input.target)
  if (target === input.root) {
    input.onMarkScrollGesture(input.root)
    return
  }
  if (
    shouldMarkBoundaryGesture({
      delta: input.delta,
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    })
  ) {
    input.onMarkScrollGesture(input.root)
  }
}

type StageConfig = {
  init: number
  batch: number
}

type TimelineStageInput = {
  sessionKey: () => string
  turnStart: () => number
  messages: () => UserMessage[]
  config: StageConfig
}

/**
 * Defer-mounts small timeline windows so revealing older turns does not
 * block first paint with a large DOM mount.
 *
 * Once staging completes for a session it never re-stages — backfill and
 * new messages render immediately.
 */
function createTimelineStaging(input: TimelineStageInput) {
  const [state, setState] = createStore({
    activeSession: "",
    completedSession: "",
    count: 0,
  })

  const stagedCount = createMemo(() => {
    const total = input.messages().length
    if (input.turnStart() <= 0) return total
    if (state.completedSession === input.sessionKey()) return total
    const init = Math.min(total, input.config.init)
    if (state.count <= init) return init
    if (state.count >= total) return total
    return state.count
  })

  const stagedUserMessages = createMemo(() => {
    const list = input.messages()
    const count = stagedCount()
    if (count >= list.length) return list
    return list.slice(Math.max(0, list.length - count))
  })

  let frame: number | undefined
  const cancel = () => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
    frame = undefined
  }

  createEffect(
    on(
      () => [input.sessionKey(), input.turnStart() > 0, input.messages().length] as const,
      ([sessionKey, isWindowed, total]) => {
        cancel()
        const shouldStage =
          isWindowed &&
          total > input.config.init &&
          state.completedSession !== sessionKey &&
          state.activeSession !== sessionKey
        if (!shouldStage) {
          setState({ activeSession: "", count: total })
          return
        }

        let count = Math.min(total, input.config.init)
        setState({ activeSession: sessionKey, count })

        const step = () => {
          if (input.sessionKey() !== sessionKey) {
            frame = undefined
            return
          }
          const currentTotal = input.messages().length
          count = Math.min(currentTotal, count + input.config.batch)
          setState("count", count)
          if (count >= currentTotal) {
            setState({ completedSession: sessionKey, activeSession: "" })
            frame = undefined
            return
          }
          frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
      },
    ),
  )

  const isStaging = createMemo(() => {
    const key = input.sessionKey()
    return state.activeSession === key && state.completedSession !== key
  })

  onCleanup(cancel)
  return { messages: stagedUserMessages, isStaging }
}

export function MessageTimeline(props: {
  mobileChanges: boolean
  mobileFallback: JSX.Element
  actions?: UserActions
  scroll: { overflow: boolean; bottom: boolean }
  onResumeScroll: () => void
  setScrollRef: (el: HTMLDivElement | undefined) => void
  onScheduleScrollState: (el: HTMLDivElement) => void
  onAutoScrollHandleScroll: () => void
  onMarkScrollGesture: (target?: EventTarget | null) => void
  hasScrollGesture: () => boolean
  onUserScroll: () => void
  onTurnBackfillScroll: () => void
  onAutoScrollInteraction: (event: MouseEvent) => void
  centered: boolean
  setContentRef: (el: HTMLDivElement) => void
  turnStart: number
  historyMore: boolean
  historyLoading: boolean
  onLoadEarlier: () => void
  renderedUserMessages: UserMessage[]
  anchor: (id: string) => string
}) {
  let touchGesture: number | undefined

  const navigate = useNavigate()
  const globalSDK = useGlobalSDK()
  const sdk = useSDK()
  const sync = useSync()
  const settings = useSettings()
  const dialog = useDialog()
  const language = useLanguage()
  const { params, sessionKey } = useSessionKey()
  const platform = usePlatform()
  const file = useFile()
  const layout = useLayout()
  const entityDialog = useEntityDialog()
  const trellis = useTrellis()
  const [searchParams, setSearchParams] = useSearchParams()

  const lookupEntity = async (id: string) => {
    const entity = await trellis.fetchEntity(id)
    return entity?.facts
  }

  const entityNav = (): EntityNav => ({
    navigate,
    setSearchParams,
    searchParams,
    sessionKey: params.dir ?? "",
    file,
    layout,
    dialog: entityDialog,
    lookup: lookupEntity,
  })

  const handleLinkClick = (href: string, event: MouseEvent) => {
    if (
      handleReferenceClick(
        href,
        {
          navigate,
          setSearchParams,
          searchParams,
          sessionKey: params.dir ?? "",
          file,
          layout,
          dialog: entityDialog,
          lookup: lookupEntity,
        },
        event,
      )
    ) {
      return
    }

    event.preventDefault()
    const path = href.replace(/^(\.\/|\/)/, "")
    if (!path) return
    const tab = file.tab(path)
    file.load(path)
    const tabs = layout.tabs(params.dir ?? "")
    tabs.open(tab)
    tabs.setActive(tab)
  }

  const handleFileFetch = async (path: string) => {
    const normalized = path.replace(/^(\.\/)/, "")
    if (!normalized) return undefined
    await file.load(normalized)
    return file.text(normalized)
  }

  const rendered = createMemo(() => props.renderedUserMessages.map((message) => message.id))
  const sessionID = createMemo(() => params.id)
  // Use synced state to prevent race conditions in message updates
  const syncedMessages = createSyncedState(emptyMessages)

  const sessionMessages = createMemo(() => {
    const id = sessionID()
    if (!id) return emptyMessages
    const messages = sync.data.message[id] ?? emptyMessages
    // Ensure messages are always properly sorted by creation time
    const sorted = [...messages].sort((a, b) => {
      const timeA = a.time?.created ?? 0
      const timeB = b.time?.created ?? 0
      return timeA - timeB
    })
    // Update synced state if messages changed
    if (
      sorted.length !== syncedMessages.state().length ||
      sorted.some((msg, i) => msg.id !== syncedMessages.state()[i]?.id)
    ) {
      syncedMessages.update("session-messages", () => sorted)
    }
    return syncedMessages.state()
  })
  const pending = createMemo(() =>
    sessionMessages().findLast(
      (item): item is AssistantMessage => item.role === "assistant" && typeof item.time.completed !== "number",
    ),
  )
  const sessionStatus = createMemo(() => {
    const id = sessionID()
    if (!id) return idle
    return sync.data.session_status[id] ?? idle
  })
  const working = createMemo(() => isSessionWorking(sessionStatus(), sessionMessages()))
  const tint = createMemo(() => messageAgentColor(sessionMessages(), sync.data.agent))

  // Use reliable update for timeout state to prevent UI glitches
  const [timeoutDone, setTimeoutDone, forceTimeoutDone] = createReliableUpdate(true, {
    debounceMs: 50,
    maxStaleMs: 1000,
    onStale: () => {
      console.warn("Timeout state went stale, forcing update")
      forceTimeoutDone(true)
    },
  })

  const workingStatus = createMemo<"hidden" | "showing" | "hiding">((prev) => {
    if (working()) return "showing"
    if (!timeoutDone()) return "hiding"
    return "hidden"
  })

  createEffect(() => {
    if (workingStatus() !== "hiding") return

    setTimeoutDone(false)
    makeTimer(() => setTimeoutDone(true), 260, setTimeout)
  })

  const activeMessageID = createMemo(() => {
    const parentID = pending()?.parentID
    if (parentID) {
      const messages = sessionMessages()
      const result = Binary.search(messages, parentID, (message) => message.id)
      const message = result.found ? messages[result.index] : messages.find((item) => item.id === parentID)
      if (message && message.role === "user") return message.id
    }

    const status = sessionStatus()
    if (status.type !== "idle") {
      const messages = sessionMessages()
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") return messages[i].id
      }
    }

    return undefined
  })
  const info = createMemo(() => {
    const id = sessionID()
    if (!id) return
    return sync.session.get(id)
  })
  const titleValue = createMemo(() => info()?.title)
  const shareUrl = createMemo(() => info()?.share?.url)
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")
  const parentID = createMemo(() => info()?.parentID)
  const showHeader = createMemo(() => !!(titleValue() || parentID()))
  const stageCfg = { init: 1, batch: 3 }
  const staging = createTimelineStaging({
    sessionKey,
    turnStart: () => props.turnStart,
    messages: () => props.renderedUserMessages,
    config: stageCfg,
  })

  const [title, setTitle] = createStore({
    draft: "",
    editing: false,
    menuOpen: false,
    pendingRename: false,
    pendingShare: false,
  })

  // Error boundary for session operations
  const [sessionError, executeSessionOp, resetSessionError] = createErrorBoundary(null, {
    maxRetries: 2,
    retryDelay: 500,
    onError: (err, retryCount) => {
      console.error(`Session operation failed (attempt ${retryCount}):`, err)
    },
  })
  let titleRef: HTMLInputElement | undefined

  const [share, setShare] = createStore({
    open: false,
    dismiss: null as "escape" | "outside" | null,
  })

  let more: HTMLButtonElement | undefined

  const viewShare = () => {
    const url = shareUrl()
    if (!url) return
    platform.openLink(url)
  }

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const shareMutation = useMutation(() => ({
    mutationFn: (id: string) => globalSDK.client.session.share({ sessionID: id, directory: sdk.directory }),
    onError: (err) => {
      console.error("Failed to share session", err)
    },
  }))

  const unshareMutation = useMutation(() => ({
    mutationFn: (id: string) => globalSDK.client.session.unshare({ sessionID: id, directory: sdk.directory }),
    onError: (err) => {
      console.error("Failed to unshare session", err)
    },
  }))

  const titleMutation = useMutation(() => ({
    mutationFn: (input: { id: string; title: string }) =>
      sdk.client.session.update({ sessionID: input.id, title: input.title }),
    onSuccess: (_, input) => {
      sync.set(
        produce((draft) => {
          const index = draft.session.findIndex((s) => s.id === input.id)
          if (index !== -1) draft.session[index].title = input.title
        }),
      )
      setTitle("editing", false)
    },
    onError: (err) => {
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(err),
      })
    },
  }))

  const shareSession = () => {
    const id = sessionID()
    if (!id || shareMutation.isPending) return
    if (!shareEnabled()) return
    shareMutation.mutate(id)
  }

  const unshareSession = () => {
    const id = sessionID()
    if (!id || unshareMutation.isPending) return
    if (!shareEnabled()) return
    unshareMutation.mutate(id)
  }

  createEffect(
    on(
      sessionKey,
      () =>
        setTitle({
          draft: "",
          editing: false,
          menuOpen: false,
          pendingRename: false,
          pendingShare: false,
        }),
      { defer: true },
    ),
  )

  const openTitleEditor = () => {
    if (!sessionID()) return
    setTitle({ editing: true, draft: titleValue() ?? "" })
    requestAnimationFrame(() => {
      titleRef?.focus()
      titleRef?.select()
    })
  }

  const closeTitleEditor = () => {
    if (titleMutation.isPending) return
    setTitle("editing", false)
  }

  const saveTitleEditor = () => {
    const id = sessionID()
    if (!id) return
    if (titleMutation.isPending) return

    const next = title.draft.trim()
    if (!next || next === (titleValue() ?? "")) {
      setTitle("editing", false)
      return
    }

    titleMutation.mutate({ id, title: next })
  }

  const navigateAfterSessionRemoval = (sessionID: string, parentID?: string, nextSessionID?: string) => {
    if (params.id !== sessionID) return
    if (parentID) {
      navigate(sessionRouteHref(params.dir!, parentID))
      return
    }
    if (nextSessionID) {
      navigate(sessionRouteHref(params.dir!, nextSessionID))
      return
    }
    navigate(sessionRouteHref(params.dir!))
  }

  const archiveSession = async (sessionID: string) => {
    const session = sync.session.get(sessionID)
    if (!session) return

    const sessions = sync.data.session ?? []
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    await sdk.client.session
      .update({ sessionID, time: { archived: Date.now() } })
      .then(() => {
        sync.set(
          produce((draft) => {
            const index = draft.session.findIndex((s) => s.id === sessionID)
            if (index !== -1) draft.session.splice(index, 1)
          }),
        )
        navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id)
      })
      .catch((err) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(err),
        })
      })
  }

  const deleteSession = async (sessionID: string) => {
    const session = sync.session.get(sessionID)
    if (!session) return false

    const sessions = (sync.data.session ?? []).filter((s) => !s.parentID && !s.time?.archived)
    const index = sessions.findIndex((s) => s.id === sessionID)
    const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

    const result = await sdk.client.session
      .delete({ sessionID })
      .then((x) => x.data)
      .catch((err) => {
        showToast({
          title: language.t("session.delete.failed.title"),
          description: errorMessage(err),
        })
        return false
      })

    if (!result) return false

    sync.set(
      produce((draft) => {
        const removed = new Set<string>([sessionID])

        const byParent = new Map<string, string[]>()
        for (const item of draft.session) {
          const parentID = item.parentID
          if (!parentID) continue
          const existing = byParent.get(parentID)
          if (existing) {
            existing.push(item.id)
            continue
          }
          byParent.set(parentID, [item.id])
        }

        const stack = [sessionID]
        while (stack.length) {
          const parentID = stack.pop()
          if (!parentID) continue

          const children = byParent.get(parentID)
          if (!children) continue

          for (const child of children) {
            if (removed.has(child)) continue
            removed.add(child)
            stack.push(child)
          }
        }

        draft.session = draft.session.filter((s) => !removed.has(s.id))
      }),
    )

    navigateAfterSessionRemoval(sessionID, session.parentID, nextSession?.id)
    return true
  }

  const navigateParent = () => {
    const id = parentID()
    if (!id) return
    navigate(sessionRouteHref(params.dir!, id))
  }

  function DialogDeleteSession(props: { sessionID: string }) {
    const name = createMemo(() => sync.session.get(props.sessionID)?.title ?? language.t("command.session.new"))
    const handleDelete = async () => {
      await deleteSession(props.sessionID)
      dialog.close()
    }

    return (
      <Dialog title={language.t("session.delete.title")} fit>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <div class="flex flex-col gap-1">
            <span class="text-14-regular text-text-strong">
              {language.t("session.delete.confirm", { name: name() })}
            </span>
          </div>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button variant="primary" size="large" onClick={handleDelete}>
              {language.t("session.delete.button")}
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Show
      when={!props.mobileChanges}
      fallback={<div class="relative h-full overflow-hidden">{props.mobileFallback}</div>}
    >
      <div class="relative w-full h-full min-w-0">
        <div
          class="absolute left-1/2 -translate-x-1/2 bottom-6 z-[60] pointer-events-none transition-all duration-200 ease-out"
          classList={{
            "opacity-100 translate-y-0 scale-100":
              props.scroll.overflow && !props.scroll.bottom && !staging.isStaging(),
            "opacity-0 translate-y-2 scale-95 pointer-events-none":
              !props.scroll.overflow || props.scroll.bottom || staging.isStaging(),
          }}
        >
          <button
            class="pointer-events-auto size-8 flex items-center justify-center rounded-full bg-background-base border border-border-base shadow-sm text-text-base hover:bg-background-stronger transition-colors"
            onClick={props.onResumeScroll}
          >
            <Icon name="arrow-down-to-line" />
          </button>
        </div>
        <ScrollView
          viewportRef={props.setScrollRef}
          onWheel={(e) => {
            const root = e.currentTarget
            const delta = normalizeWheelDelta({
              deltaY: e.deltaY,
              deltaMode: e.deltaMode,
              rootHeight: root.clientHeight,
            })
            if (!delta) return
            markBoundaryGesture({ root, target: e.target, delta, onMarkScrollGesture: props.onMarkScrollGesture })
          }}
          onTouchStart={(e) => {
            touchGesture = e.touches[0]?.clientY
          }}
          onTouchMove={(e) => {
            const next = e.touches[0]?.clientY
            const prev = touchGesture
            touchGesture = next
            if (next === undefined || prev === undefined) return

            const delta = prev - next
            if (!delta) return

            const root = e.currentTarget
            markBoundaryGesture({ root, target: e.target, delta, onMarkScrollGesture: props.onMarkScrollGesture })
          }}
          onTouchEnd={() => {
            touchGesture = undefined
          }}
          onTouchCancel={() => {
            touchGesture = undefined
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return
            props.onMarkScrollGesture(e.currentTarget)
          }}
          onScroll={(e) => {
            props.onScheduleScrollState(e.currentTarget)
            props.onTurnBackfillScroll()
            if (!props.hasScrollGesture()) return
            props.onUserScroll()
            props.onAutoScrollHandleScroll()
            props.onMarkScrollGesture(e.currentTarget)
          }}
          onClick={props.onAutoScrollInteraction}
          class="relative min-w-0 w-full h-full"
          style={{
            "--session-title-height": showHeader() ? "40px" : "0px",
            "--sticky-accordion-top": showHeader() ? "48px" : "0px",
            "--sticky-user-message-top": showHeader() ? "48px" : "0px",
            "--sticky-user-message-gap": showHeader() ? "14px" : "10px",
          }}
        >
          <div ref={props.setContentRef} class="min-w-0 w-full">
            <Show when={showHeader()}>
              <div
                data-session-title
                classList={{
                  "sticky top-0 z-30 bg-[linear-gradient(to_bottom,var(--background-stronger)_48px,transparent)]": true,
                  "w-full": true,
                  "pb-4": true,
                  "pl-2 pr-3 md:pl-4 md:pr-3": true,
                  "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
                }}
              >
                <div class="h-12 w-full flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1 min-w-0 flex-1 pr-3">
                    <Show when={parentID()}>
                      <IconButton
                        tabIndex={-1}
                        icon="arrow-left"
                        variant="ghost"
                        onClick={navigateParent}
                        aria-label={language.t("common.goBack")}
                      />
                    </Show>
                  </div>
                  <Show when={sessionID()}>
                    {(id) => (
                      <div class="shrink-0 flex items-center gap-3">
                        <SessionContextUsage placement="bottom" />
                        <DropdownMenu
                          gutter={4}
                          placement="bottom-end"
                          open={title.menuOpen}
                          onOpenChange={(open) => {
                            setTitle("menuOpen", open)
                            if (open) return
                          }}
                        >
                          <DropdownMenu.Trigger
                            as={IconButton}
                            icon="dot-grid"
                            variant="ghost"
                            class="size-6 rounded-md data-[expanded]:bg-surface-base-active"
                            classList={{
                              "bg-surface-base-active": share.open || title.pendingShare,
                            }}
                            aria-label={language.t("common.moreOptions")}
                            aria-expanded={title.menuOpen || share.open || title.pendingShare}
                            ref={(el: HTMLButtonElement) => {
                              more = el
                            }}
                          />
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              style={{ "min-width": "104px" }}
                              onCloseAutoFocus={(event) => {
                                if (title.pendingRename) {
                                  event.preventDefault()
                                  setTitle("pendingRename", false)
                                  openTitleEditor()
                                  return
                                }
                                if (title.pendingShare) {
                                  event.preventDefault()
                                  requestAnimationFrame(() => {
                                    setShare({ open: true, dismiss: null })
                                    setTitle("pendingShare", false)
                                  })
                                }
                              }}
                            >
                              <DropdownMenu.Item
                                onSelect={() => {
                                  setTitle("pendingRename", true)
                                  setTitle("menuOpen", false)
                                }}
                              >
                                <DropdownMenu.ItemLabel>{language.t("common.rename")}</DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                              <Show when={shareEnabled()}>
                                <DropdownMenu.Item
                                  onSelect={() => {
                                    setTitle({ pendingShare: true, menuOpen: false })
                                  }}
                                >
                                  <DropdownMenu.ItemLabel>
                                    {language.t("session.share.action.share")}
                                  </DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                              </Show>
                              <DropdownMenu.Item onSelect={() => void archiveSession(id())}>
                                <DropdownMenu.ItemLabel>{language.t("common.archive")}</DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Item
                                onSelect={() => dialog.show(() => <DialogDeleteSession sessionID={id()} />)}
                              >
                                <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>

                        <KobaltePopover
                          open={share.open}
                          anchorRef={() => more}
                          placement="bottom-end"
                          gutter={4}
                          modal={false}
                          onOpenChange={(open) => {
                            if (open) setShare("dismiss", null)
                            setShare("open", open)
                          }}
                        >
                          <KobaltePopover.Portal>
                            <KobaltePopover.Content
                              data-component="popover-content"
                              style={{ "min-width": "320px" }}
                              onEscapeKeyDown={(event) => {
                                setShare({ dismiss: "escape", open: false })
                                event.preventDefault()
                                event.stopPropagation()
                              }}
                              onPointerDownOutside={() => {
                                setShare({ dismiss: "outside", open: false })
                              }}
                              onFocusOutside={() => {
                                setShare({ dismiss: "outside", open: false })
                              }}
                              onCloseAutoFocus={(event) => {
                                if (share.dismiss === "outside") event.preventDefault()
                                setShare("dismiss", null)
                              }}
                            >
                              <div class="flex flex-col p-3">
                                <div class="flex flex-col gap-1">
                                  <div class="text-13-medium text-text-strong">
                                    {language.t("session.share.popover.title")}
                                  </div>
                                  <div class="text-12-regular text-text-weak">
                                    {shareUrl()
                                      ? language.t("session.share.popover.description.shared")
                                      : language.t("session.share.popover.description.unshared")}
                                  </div>
                                </div>
                                <div class="mt-3 flex flex-col gap-2">
                                  <Show
                                    when={shareUrl()}
                                    fallback={
                                      <Button
                                        size="large"
                                        variant="primary"
                                        class="w-full"
                                        onClick={shareSession}
                                        disabled={shareMutation.isPending}
                                      >
                                        {shareMutation.isPending
                                          ? language.t("session.share.action.publishing")
                                          : language.t("session.share.action.publish")}
                                      </Button>
                                    }
                                  >
                                    <div class="flex flex-col gap-2">
                                      <TextField
                                        value={shareUrl() ?? ""}
                                        readOnly
                                        copyable
                                        copyKind="link"
                                        tabIndex={-1}
                                        class="w-full"
                                      />
                                      <div class="grid grid-cols-2 gap-2">
                                        <Button
                                          size="large"
                                          variant="secondary"
                                          class="w-full shadow-none border border-border-weak-base"
                                          onClick={unshareSession}
                                          disabled={unshareMutation.isPending}
                                        >
                                          {unshareMutation.isPending
                                            ? language.t("session.share.action.unpublishing")
                                            : language.t("session.share.action.unpublish")}
                                        </Button>
                                        <Button
                                          size="large"
                                          variant="primary"
                                          class="w-full"
                                          onClick={viewShare}
                                          disabled={unshareMutation.isPending}
                                        >
                                          {language.t("session.share.action.view")}
                                        </Button>
                                      </div>
                                    </div>
                                  </Show>
                                </div>
                              </div>
                            </KobaltePopover.Content>
                          </KobaltePopover.Portal>
                        </KobaltePopover>
                      </div>
                    )}
                  </Show>
                </div>
              </div>
            </Show>
            <div
              role="log"
              data-slot="session-turn-list"
              class="flex flex-col items-start justify-start transition-[margin]"
              classList={{
                "w-full": true,
                "pb-44": working(),
                "pb-16": !working(),
                "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
                "mt-0.5": props.centered,
                "mt-0": !props.centered,
              }}
            >
              <Show when={props.turnStart > 0 || props.historyMore}>
                <div class="w-full flex justify-center">
                  <Button
                    variant="ghost"
                    size="large"
                    class="text-12-medium opacity-50"
                    disabled={props.historyLoading}
                    onClick={props.onLoadEarlier}
                  >
                    {props.historyLoading
                      ? language.t("session.messages.loadingEarlier")
                      : language.t("session.messages.loadEarlier")}
                  </Button>
                </div>
              </Show>
              <For each={rendered()}>
                {(messageID) => {
                  const active = createMemo(() => activeMessageID() === messageID)
                  const parts = createMemo(() => sync.data.part[messageID] ?? [])
                  const comments = createMemo(() => messageComments(parts()), [], {
                    equals: (a, b) =>
                      a.length === b.length &&
                      a.every(
                        (c, i) =>
                          c.path === b[i].path &&
                          c.comment === b[i].comment &&
                          c.selection?.startLine === b[i].selection?.startLine &&
                          c.selection?.endLine === b[i].selection?.endLine,
                      ),
                  })
                  const commentCount = createMemo(() => comments().length)
                  const turnFileDiffs = createMemo(() => {
                    const message = sessionMessages().find((item) => item.id === messageID)
                    const summary = message?.summary
                    if (!summary || typeof summary === "boolean") return false
                    return summary.diffs.length > 0
                  })
                  return (
                    <div
                      id={props.anchor(messageID)}
                      data-message-id={messageID}
                      ref={(el) => {
                        // Opacity only — a transform on this wrapper breaks position:sticky below.
                        requestAnimationFrame(() =>
                          animate(el as Element, { opacity: [0, 1] }, {
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          } as any),
                        )
                      }}
                      classList={{
                        "min-w-0 w-full max-w-full": true,
                        "md:max-w-200 2xl:max-w-[1000px]": props.centered,
                      }}
                    >
                      <Show when={commentCount() > 0}>
                        <div class="w-full px-4 md:px-5 pb-2">
                          <div class="ml-auto max-w-[82%] overflow-x-auto no-scrollbar">
                            <div class="flex w-max min-w-full justify-end gap-2">
                              <Index each={comments()}>
                                {(commentAccessor: () => MessageComment) => {
                                  const comment = createMemo(() => commentAccessor())
                                  return (
                                    <Show when={comment()}>
                                      {(c) => (
                                        <div class="shrink-0 max-w-[260px] rounded-[6px] border border-border-weak-base bg-background-stronger px-2.5 py-2">
                                          <div class="flex items-center gap-1.5 min-w-0 text-11-medium text-text-strong">
                                            <FileIcon
                                              node={{ path: c().path, type: "file" }}
                                              class="size-3.5 shrink-0"
                                            />
                                            <span class="truncate">{getFilename(c().path)}</span>
                                            <Show when={c().selection}>
                                              {(selection) => (
                                                <span class="shrink-0 text-text-weak">
                                                  {selection().startLine === selection().endLine
                                                    ? `:${selection().startLine}`
                                                    : `:${selection().startLine}-${selection().endLine}`}
                                                </span>
                                              )}
                                            </Show>
                                          </div>
                                          <div class="pt-1 text-12-regular text-text-strong whitespace-pre-wrap break-words">
                                            {c().comment}
                                          </div>
                                        </div>
                                      )}
                                    </Show>
                                  )
                                }}
                              </Index>
                            </div>
                          </div>
                        </div>
                      </Show>
                      <SessionTurn
                        sessionID={sessionID() ?? ""}
                        messageID={messageID}
                        messages={sessionMessages()}
                        actions={props.actions}
                        active={active()}
                        status={active() ? sessionStatus() : undefined}
                        showReasoningSummaries={settings.general.showReasoningSummaries()}
                        shellToolDefaultOpen={settings.general.shellToolPartsExpanded()}
                        editToolDefaultOpen={settings.general.editToolPartsExpanded()}
                        onLinkClick={handleLinkClick}
                        fileFetch={handleFileFetch}
                        classes={{
                          root: "min-w-0 w-full relative",
                          content: "flex flex-col justify-between !overflow-visible",
                          container: "w-full",
                        }}
                      >
                        <AgentTurnActions
                          userMessageId={messageID}
                          messages={sessionMessages()}
                          partsByMessage={sync.data.part}
                          hasFileDiffs={turnFileDiffs()}
                          working={active() && working()}
                          nav={entityNav()}
                        />
                      </SessionTurn>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </ScrollView>
        <Show when={working()}>
          <div data-component="session-activity-dock" class="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
            <div
              aria-hidden
              class="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(to_top,var(--background-stronger)_60%,transparent)]"
            />
            <div class="relative px-3 pb-3 pt-6 w-full">
              <div
                ref={(el) => {
                  if (!el) return
                  requestAnimationFrame(() =>
                    animate(
                      el as Element,
                      { opacity: [0, 1], y: [6, 0] },
                      { type: "spring", stiffness: 420, damping: 32 } as any,
                    ),
                  )
                }}
                class="pointer-events-auto w-full"
                classList={{ "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered }}
              >
                <SessionActivityIndicator
                  color={tint()}
                  status={sessionStatus()}
                  messages={sessionMessages()}
                  partsByMessage={sync.data.part}
                />
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}

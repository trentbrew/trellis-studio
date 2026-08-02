import { useFilteredList } from "@opencode-ai/ui/hooks"
import { useSpring } from "@opencode-ai/ui/motion-spring"
import { createEffect, on, Component, Show, onCleanup, createMemo, createSignal, untrack } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { selectionFromLines, type SelectedLineRange, useFile } from "@/context/file"
import {
  ContentPart,
  DEFAULT_PROMPT,
  isPromptEqual,
  Prompt,
  usePrompt,
  ImageAttachmentPart,
  AgentPart,
  FileAttachmentPart,
  EntityPart,
} from "@/context/prompt"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useComments } from "@/context/comments"
import { Button } from "@opencode-ai/ui/button"
import { DockShell, DockTray } from "@opencode-ai/ui/dock-surface"
import { Icon } from "@opencode-ai/ui/icon"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Select } from "@opencode-ai/ui/select"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ModelSelectorPopover } from "@/components/dialog-select-model"
import { useProviders } from "@/hooks/use-providers"
import { useCommand } from "@/context/command"
import { Persist, persisted } from "@/utils/persist"
import { usePermission } from "@/context/permission"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"
import { promptEnabled, promptProbe } from "@/testing/prompt"
import { createTextFragment, getCursorPosition, setCursorPosition, setRangeEdge } from "./prompt-input/editor-dom"
import { createPromptAttachments } from "./prompt-input/attachments"
import { ACCEPTED_FILE_TYPES } from "./prompt-input/files"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  prependHistoryEntry,
  type PromptHistoryComment,
  type PromptHistoryEntry,
  type PromptHistoryStoredEntry,
  promptLength,
} from "./prompt-input/history"
import { projectionWhiteboard } from "@/lib/whiteboard/active-projection"
import { createPromptSubmit, type FollowupDraft } from "./prompt-input/submit"
import {
  PromptPopover,
  type AtOption,
  type SlashCommand,
  type HashOption,
  type WikiOption,
} from "./prompt-input/slash-popover"
import { PromptContextItems } from "./prompt-input/context-items"
import { PromptFocusChip } from "./prompt-input/focus-chip"
import { PromptImageAttachments } from "./prompt-input/image-attachments"
import { promptPlaceholder } from "./prompt-input/placeholder"
import { ImagePreview } from "@opencode-ai/ui/image-preview"
import { resolveEntityLabel } from "@/components/cms/display"
import { useTrellis, type TrellisMilestone } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { useFocusOptional } from "@/context/focus"
import { entityRank } from "@/lib/mention-search"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { entityPartVisibleText, partVisibleText, resolveEntityPartLabel } from "./prompt-input/entity-label"
import { isSessionWorking } from "@/lib/session-working"

interface PromptInputProps {
  class?: string
  ref?: (el: HTMLDivElement) => void
  newSessionWorktree?: string
  onNewSessionWorktreeReset?: () => void
  edit?: { id: string; prompt: Prompt; context: FollowupDraft["context"] }
  onEditLoaded?: () => void
  shouldQueue?: () => boolean
  onQueue?: (draft: FollowupDraft) => void
  onAbort?: () => void
  onSubmit?: () => void
}

const EXAMPLES = [
  "prompt.example.1",
  "prompt.example.2",
  "prompt.example.3",
  "prompt.example.4",
  "prompt.example.5",
  "prompt.example.6",
  "prompt.example.7",
  "prompt.example.8",
  "prompt.example.9",
  "prompt.example.10",
  "prompt.example.11",
  "prompt.example.12",
  "prompt.example.13",
  "prompt.example.14",
  "prompt.example.15",
  "prompt.example.16",
  "prompt.example.17",
  "prompt.example.18",
  "prompt.example.19",
  "prompt.example.20",
  "prompt.example.21",
  "prompt.example.22",
  "prompt.example.23",
  "prompt.example.24",
  "prompt.example.25",
] as const

const NON_EMPTY_TEXT = /[^\s\u200B]/

export const PromptInput: Component<PromptInputProps> = (props) => {
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const files = useFile()
  const prompt = usePrompt()
  const layout = useLayout()
  const comments = useComments()
  const dialog = useDialog()
  const providers = useProviders()
  const command = useCommand()
  const permission = usePermission()
  const language = useLanguage()
  const platform = usePlatform()
  const { params, tabs, view } = useSessionLayout()
  const trellis = useTrellis()
  const trellisStore = useTrellisStoreOptional()
  const focus = useFocusOptional()
  const mentionTrellis = createMemo(() => mentionTrellisCtx(trellis, trellisStore?.facts))
  const entityLabelCtx = createMemo(() => {
    const ctx = mentionTrellis()
    if (!ctx) return undefined
    return {
      ...ctx,
      decisions: trellis.decisions,
      milestones: trellis.milestones,
    }
  })
  const visiblePromptText = (parts: Prompt) => parts.map((part) => partVisibleText(part, entityLabelCtx())).join("")
  const navigate = useNavigate()
  let editorRef!: HTMLDivElement
  let fileInputRef: HTMLInputElement | undefined
  let scrollRef!: HTMLDivElement
  let slashPopoverRef!: HTMLDivElement

  const mirror = { input: false }
  const inset = 56
  const space = `${inset}px`

  const scrollCursorIntoView = () => {
    const container = scrollRef
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return

    const cursor = getCursorPosition(editorRef)
    const length = promptLength(prompt.current().filter((part) => part.type !== "image"))
    if (cursor >= length) {
      container.scrollTop = container.scrollHeight
      return
    }

    const rect = range.getClientRects().item(0) ?? range.getBoundingClientRect()
    if (!rect.height) return

    const containerRect = container.getBoundingClientRect()
    const top = rect.top - containerRect.top + container.scrollTop
    const bottom = rect.bottom - containerRect.top + container.scrollTop
    const padding = 12

    if (top < container.scrollTop + padding) {
      container.scrollTop = Math.max(0, top - padding)
      return
    }

    if (bottom > container.scrollTop + container.clientHeight - inset) {
      container.scrollTop = bottom - container.clientHeight + inset
    }
  }

  const queueScroll = (count = 2) => {
    requestAnimationFrame(() => {
      scrollCursorIntoView()
      if (count > 1) queueScroll(count - 1)
    })
  }

  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: files.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? files.tab(tab) : tab),
  }).activeFileTab

  const commentInReview = (path: string) => {
    const sessionID = params.id
    if (!sessionID) return false

    const diffs = sync.data.session_diff[sessionID]
    if (!diffs) return false
    return diffs.some((diff) => diff.file === path)
  }

  const openComment = (item: { path: string; commentID?: string; commentOrigin?: "review" | "file" }) => {
    if (!item.commentID) return

    const focus = { file: item.path, id: item.commentID }
    comments.setActive(focus)

    const queueCommentFocus = (attempts = 6) => {
      const schedule = (left: number) => {
        requestAnimationFrame(() => {
          comments.setFocus({ ...focus })
          if (left <= 0) return
          requestAnimationFrame(() => {
            const current = comments.focus()
            if (!current) return
            if (current.file !== focus.file || current.id !== focus.id) return
            schedule(left - 1)
          })
        })
      }

      schedule(attempts)
    }

    const wantsReview = item.commentOrigin === "review" || (item.commentOrigin !== "file" && commentInReview(item.path))
    if (wantsReview) {
      if (!view().reviewPanel.opened()) view().reviewPanel.open()
      layout.fileTree.setTab("changes")
      tabs().setActive("review")
      queueCommentFocus()
      return
    }

    if (!view().reviewPanel.opened()) view().reviewPanel.open()
    layout.fileTree.setTab("all")
    const tab = files.tab(item.path)
    tabs().open(tab)
    tabs().setActive(tab)
    Promise.resolve(files.load(item.path)).finally(() => queueCommentFocus())
  }

  const recent = createMemo(() => {
    const all = tabs().all()
    const active = activeFileTab()
    const order = active ? [active, ...all.filter((x) => x !== active)] : all
    const seen = new Set<string>()
    const paths: string[] = []

    for (const tab of order) {
      const path = files.pathFromTab(tab)
      if (!path) continue
      if (seen.has(path)) continue
      seen.add(path)
      paths.push(path)
    }

    return paths
  })
  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const status = createMemo(
    () =>
      sync.data.session_status[params.id ?? ""] ?? {
        type: "idle",
      },
  )
  const working = createMemo(() => isSessionWorking(status(), sync.data.message[params.id ?? ""]))
  const tip = () => {
    if (working()) {
      return (
        <div class="flex items-center gap-2">
          <span>{language.t("prompt.action.stop")}</span>
          <span class="text-icon-base text-12-medium text-[10px]!">{language.t("common.key.esc")}</span>
        </div>
      )
    }

    return (
      <div class="flex items-center gap-2">
        <span>{language.t("prompt.action.send")}</span>
        <Icon name="enter" size="small" class="text-icon-base" />
      </div>
    )
  }
  const imageAttachments = createMemo(() =>
    prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"),
  )

  const [store, setStore] = createStore<{
    popover: "at" | "slash" | "hash" | "wiki" | null
    historyIndex: number
    savedPrompt: PromptHistoryEntry | null
    placeholder: number
    mode: "normal" | "shell"
    applyingHistory: boolean
  }>({
    popover: null,
    historyIndex: -1,
    savedPrompt: null as PromptHistoryEntry | null,
    placeholder: Math.floor(Math.random() * EXAMPLES.length),
    mode: "normal",
    applyingHistory: false,
  })

  createEffect(() => {
    const pop = store.popover
    if ((pop === "at" || pop === "wiki") && trellis.ready) {
      void trellis.fetchStoreEntities()
      void trellis.fetchDecisions({ limit: 20 })
      void trellis.fetchMilestones()
    }
  })

  const buttonsSpring = useSpring(() => (store.mode === "normal" ? 1 : 0), { visualDuration: 0.2, bounce: 0 })
  const motion = (value: number) => ({
    opacity: value,
    transform: `scale(${0.95 + value * 0.05})`,
    filter: `blur(${(1 - value) * 2}px)`,
    "pointer-events": value > 0.5 ? ("auto" as const) : ("none" as const),
  })
  const buttons = createMemo(() => motion(buttonsSpring()))
  const shell = createMemo(() => motion(1 - buttonsSpring()))
  const control = createMemo(() => ({ height: "28px", ...buttons() }))

  const commentCount = createMemo(() => {
    if (store.mode === "shell") return 0
    return prompt.context.items().filter((item) => !!item.comment?.trim()).length
  })

  const contextItems = createMemo(() => {
    const items = prompt.context.items()
    if (store.mode !== "shell") return items
    return items.filter((item) => !item.comment?.trim())
  })

  const hasUserPrompt = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return false
    const messages = sync.data.message[sessionID]
    if (!messages) return false
    return messages.some((m) => m.role === "user")
  })

  const [history, setHistory] = persisted(
    Persist.global("prompt-history", ["prompt-history.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )
  const [shellHistory, setShellHistory] = persisted(
    Persist.global("prompt-history-shell", ["prompt-history-shell.v1"]),
    createStore<{
      entries: PromptHistoryStoredEntry[]
    }>({
      entries: [],
    }),
  )

  const suggest = createMemo(() => !hasUserPrompt())

  const placeholder = createMemo(() =>
    promptPlaceholder({
      mode: store.mode,
      commentCount: commentCount(),
      example: suggest() ? language.t(EXAMPLES[store.placeholder]) : "",
      suggest: suggest(),
      t: (key, params) => language.t(key as Parameters<typeof language.t>[0], params as never),
    }),
  )

  const historyComments = () => {
    const byID = new Map(comments.all().map((item) => [`${item.file}\n${item.id}`, item] as const))
    return prompt.context.items().flatMap((item) => {
      if (item.type !== "file") return []
      const comment = item.comment?.trim()
      if (!comment) return []

      const selection = item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.selection : undefined
      const nextSelection =
        selection ??
        (item.selection
          ? ({
              start: item.selection.startLine,
              end: item.selection.endLine,
            } satisfies SelectedLineRange)
          : undefined)
      if (!nextSelection) return []

      return [
        {
          id: item.commentID ?? item.key,
          path: item.path,
          selection: { ...nextSelection },
          comment,
          time: item.commentID ? (byID.get(`${item.path}\n${item.commentID}`)?.time ?? Date.now()) : Date.now(),
          origin: item.commentOrigin,
          preview: item.preview,
        } satisfies PromptHistoryComment,
      ]
    })
  }

  const applyHistoryComments = (items: PromptHistoryComment[]) => {
    comments.replace(
      items.map((item) => ({
        id: item.id,
        file: item.path,
        selection: { ...item.selection },
        comment: item.comment,
        time: item.time,
      })),
    )
    prompt.context.replaceComments(
      items.map((item) => ({
        type: "file" as const,
        path: item.path,
        selection: selectionFromLines(item.selection),
        comment: item.comment,
        commentID: item.id,
        commentOrigin: item.origin,
        preview: item.preview,
      })),
    )
  }

  const applyHistoryPrompt = (entry: PromptHistoryEntry, position: "start" | "end") => {
    const p = entry.prompt
    const length = position === "start" ? 0 : promptLength(p)
    setStore("applyingHistory", true)
    applyHistoryComments(entry.comments)
    prompt.set(p, length)
    requestAnimationFrame(() => {
      editorRef.focus()
      setCursorPosition(editorRef, length)
      setStore("applyingHistory", false)
      queueScroll()
    })
  }

  const getCaretState = () => {
    const selection = window.getSelection()
    const textLength = promptLength(prompt.current())
    if (!selection || selection.rangeCount === 0) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    const anchorNode = selection.anchorNode
    if (!anchorNode || !editorRef.contains(anchorNode)) {
      return { collapsed: false, cursorPosition: 0, textLength }
    }
    return {
      collapsed: selection.isCollapsed,
      cursorPosition: getCursorPosition(editorRef),
      textLength,
    }
  }

  const escBlur = () => platform.platform === "desktop" && platform.os === "macos"

  const pick = () => fileInputRef?.click()

  const isEditablePointerTarget = (target: HTMLElement) => {
    if (target.closest("input, textarea, select")) return true
    return target.closest('[contenteditable="true"]') !== null
  }

  const setMode = (mode: "normal" | "shell") => {
    setStore("mode", mode)
    setStore("popover", null)
    requestAnimationFrame(() => editorRef?.focus())
  }

  const shellModeKey = "mod+shift+x"
  const normalModeKey = "mod+shift+e"

  command.register("prompt-input", () => [
    {
      id: "file.attach",
      title: language.t("prompt.action.attachFile"),
      category: language.t("command.category.file"),
      keybind: "mod+u",
      disabled: store.mode !== "normal",
      onSelect: pick,
    },
    {
      id: "prompt.mode.shell",
      title: language.t("command.prompt.mode.shell"),
      category: language.t("command.category.session"),
      keybind: shellModeKey,
      disabled: store.mode === "shell",
      onSelect: () => setMode("shell"),
    },
    {
      id: "prompt.mode.normal",
      title: language.t("command.prompt.mode.normal"),
      category: language.t("command.category.session"),
      keybind: normalModeKey,
      disabled: store.mode === "normal",
      onSelect: () => setMode("normal"),
    },
  ])

  const closePopover = () => setStore("popover", null)

  const resetHistoryNavigation = (force = false) => {
    if (!force && (store.historyIndex < 0 || store.applyingHistory)) return
    setStore("historyIndex", -1)
    setStore("savedPrompt", null)
  }

  const clearEditor = () => {
    editorRef.innerHTML = ""
  }

  const setEditorText = (text: string) => {
    clearEditor()
    editorRef.textContent = text
  }

  const focusEditorEnd = () => {
    requestAnimationFrame(() => {
      editorRef.focus()
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNodeContents(editorRef)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  const currentCursor = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) return null
    return getCursorPosition(editorRef)
  }

  const renderEditorWithCursor = (parts: Prompt) => {
    const cursor = currentCursor()
    renderEditor(parts)
    if (cursor !== null) setCursorPosition(editorRef, cursor)
  }

  createEffect(() => {
    params.id
    if (params.id) return
    if (!suggest()) return
    const interval = setInterval(() => {
      setStore("placeholder", (prev) => (prev + 1) % EXAMPLES.length)
    }, 6500)
    onCleanup(() => clearInterval(interval))
  })

  const [composing, setComposing] = createSignal(false)
  const isImeComposing = (event: KeyboardEvent) => event.isComposing || composing() || event.keyCode === 229

  const handleBlur = () => {
    closePopover()
    setComposing(false)
  }

  const handleCompositionStart = () => {
    setComposing(true)
  }

  const handleCompositionEnd = () => {
    setComposing(false)
    requestAnimationFrame(() => {
      if (composing()) return
      reconcile(prompt.current().filter((part) => part.type !== "image"))
    })
  }

  const agentList = createMemo(() =>
    sync.data.agent
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent): AtOption => ({ type: "agent", name: agent.name, display: agent.name })),
  )
  const agentNames = createMemo(() => local.agent.list().map((agent) => agent.name))

  const handleAtSelect = (option: AtOption | undefined) => {
    if (!option) return
    if (option.type === "agent") {
      addPart({ type: "agent", name: option.name, content: "@" + option.name, start: 0, end: 0 })
    } else if (option.type === "entity") {
      addPart({
        type: "entity",
        entityType: option.entityType,
        entityId: option.entityId,
        label: option.display,
        content: `@${option.entityType}:${option.entityId}`,
        start: 0,
        end: 0,
      })
    } else {
      addPart({ type: "file", path: option.path, content: "@" + option.path, start: 0, end: 0 })
    }
  }

  const atKey = (x: AtOption | undefined) => {
    if (!x) return ""
    if (x.type === "agent") return `agent:${x.name}`
    if (x.type === "entity") return `entity:${x.entityType}:${x.entityId}`
    return `file:${x.path}`
  }

  const {
    flat: atFlat,
    grouped: atGrouped,
    active: atActive,
    setActive: setAtActive,
    onInput: atOnInput,
    onKeyDown: atOnKeyDown,
  } = useFilteredList<AtOption>({
    items: async (query) => {
      const agents = untrack(() => agentList())
      const open = untrack(() => recent())
      const trellisCtx = untrack(() => mentionTrellis())
      const trellisReady = untrack(() => trellis.ready)
      const trellisIssues = untrack(() => trellis.issues)
      const trellisStoreEntities = untrack(() => trellis.storeEntities)
      const trellisDecisions = untrack(() => trellis.decisions)
      const trellisMilestones = untrack(() => trellis.milestones)

      const seen = new Set(open)
      const pinned: AtOption[] = open.map((path) => ({ type: "file", path, display: path, recent: true }))

      // Add trellis entities
      const entities: Extract<AtOption, { type: "entity" }>[] = []
      const seenEntities = new Set<string>()
      const addEntity = (entity: Extract<AtOption, { type: "entity" }>) => {
        if (seenEntities.has(entity.entityId)) return
        seenEntities.add(entity.entityId)
        entities.push(entity)
      }

      if (trellisReady && trellisCtx) {
        const labels = trellisCtx.entityLabels
        for (const e of trellisStoreEntities) {
          addEntity({
            type: "entity",
            entityType: e.type,
            entityId: e.id,
            display: resolveEntityLabel(e.id, { label: e.label, labels }),
          })
        }

        // Issues
        for (const issue of trellisIssues) {
          addEntity({
            type: "entity",
            entityType: "issue",
            entityId: issue.id,
            display: `${issue.id}: ${issue.title}`,
          })
        }

        // Decisions
        for (const d of trellisDecisions) {
          addEntity({
            type: "entity",
            entityType: "decision",
            entityId: d.id,
            display: d.toolName,
          })
        }

        // Milestones
        for (const m of trellisMilestones) {
          addEntity({
            type: "entity",
            entityType: "milestone",
            entityId: m.id,
            display: m.title ?? m.id,
          })
        }
      }

      const ranked = entities.sort(
        (a, b) =>
          entityRank({ id: a.entityId, type: a.entityType }) - entityRank({ id: b.entityId, type: b.entityType }) ||
          a.entityId.localeCompare(b.entityId),
      )

      if (!query.trim()) return [...agents, ...pinned, ...ranked.slice(0, 20)]

      const paths = await files.searchFilesAndDirectories(query)
      const fileOptions: AtOption[] = paths
        .filter((path) => !seen.has(path))
        .map((path) => ({ type: "file", path, display: path }))

      const q = query.toLowerCase()
      const filteredEntities = ranked
        .filter((e) => {
          if (e.entityId.toLowerCase().includes(q)) return true
          if (e.display.toLowerCase().includes(q)) return true
          if (e.entityType.toLowerCase().includes(q)) return true
          const suffix = e.entityId.includes(":") ? e.entityId.split(":").slice(1).join(":") : e.entityId
          return suffix.toLowerCase().includes(q)
        })
        .slice(0, 20)

      return [...agents, ...pinned, ...filteredEntities, ...fileOptions]
    },
    key: atKey,
    filterKeys: ["display", "entityId", "entityType", "path", "name"],
    groupBy: (item) => {
      if (item.type === "agent") return "agent"
      if (item.type === "entity") return "entity"
      if (item.recent) return "recent"
      return "file"
    },
    sortGroupsBy: (a, b) => {
      const rank = (category: string) => {
        if (category === "agent") return 0
        if (category === "entity") return 1
        if (category === "recent") return 2
        return 3
      }
      return rank(a.category) - rank(b.category)
    },
    onSelect: handleAtSelect,
  })

  const slashCommands = createMemo<SlashCommand[]>(() => {
    const builtin = command.options
      .filter((opt) => !opt.disabled && !opt.id.startsWith("suggested.") && opt.slash)
      .map((opt) => ({
        id: opt.id,
        trigger: opt.slash!,
        title: opt.title,
        description: opt.description,
        keybind: opt.keybind,
        type: "builtin" as const,
      }))

    const custom = sync.data.command.map((cmd) => ({
      id: `custom.${cmd.name}`,
      trigger: cmd.name,
      title: cmd.name,
      description: cmd.description,
      type: "custom" as const,
      source: cmd.source,
    }))

    return [...custom, ...builtin]
  })

  const handleSlashSelect = (cmd: SlashCommand | undefined) => {
    if (!cmd) return
    promptProbe.select(cmd.id)
    closePopover()

    if (cmd.type === "custom") {
      const text = `/${cmd.trigger} `
      setEditorText(text)
      prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      focusEditorEnd()
      return
    }

    clearEditor()
    prompt.set([{ type: "text", content: "", start: 0, end: 0 }], 0)
    command.trigger(cmd.id, "slash")
  }

  const {
    flat: slashFlat,
    active: slashActive,
    setActive: setSlashActive,
    onInput: slashOnInput,
    onKeyDown: slashOnKeyDown,
  } = useFilteredList<SlashCommand>({
    items: slashCommands,
    key: (x) => x?.id,
    filterKeys: ["trigger", "title"],
    onSelect: handleSlashSelect,
  })

  const handleHashSelect = (option: HashOption | undefined) => {
    if (!option) return
    addPart({
      type: "entity",
      entityType: option.type === "entity" ? option.entityType : option.symbolType,
      entityId: option.name,
      label: option.display,
      content: `#${option.name}`,
      start: 0,
      end: 0,
    })
  }

  const hashKey = (x: HashOption | undefined) => {
    if (!x) return ""
    return `${x.type}:${x.name}`
  }

  const handleWikiSelect = (option: WikiOption | undefined) => {
    if (!option) return
    addPart({
      type: "entity",
      entityType: option.namespace,
      entityId: option.target,
      label: option.display,
      content: `[[${option.namespace}:${option.target}]]`,
      start: 0,
      end: 0,
    })
  }

  const wikiKey = (x: WikiOption | undefined) => {
    if (!x) return ""
    return `${x.namespace}:${x.target}`
  }

  const {
    flat: hashFlat,
    active: hashActive,
    setActive: setHashActive,
    onInput: hashOnInput,
    onKeyDown: hashOnKeyDown,
  } = useFilteredList<HashOption>({
    items: async (query) => {
      if (!trellis.ready) return []

      const issues = trellis.issues
      const entities: HashOption[] = issues.map((issue) => ({
        type: "entity" as const,
        name: issue.id,
        entityType: "issue",
        display: `${issue.id}: ${issue.title}`,
      }))

      // TODO: Add symbol detection from codebase
      const symbols: HashOption[] = []

      const all = [...entities, ...symbols]
      if (!query.trim()) return all.slice(0, 10)

      return all
        .filter(
          (item) =>
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            item.display.toLowerCase().includes(query.toLowerCase()) ||
            (item.type === "entity" && item.entityType.toLowerCase().includes(query.toLowerCase())),
        )
        .slice(0, 10)
    },
    key: hashKey,
    filterKeys: ["name", "display", "entityType"],
    groupBy: (item) => item.type,
    sortGroupsBy: (a, b) => a.category.localeCompare(b.category),
    onSelect: handleHashSelect,
  })

  const {
    flat: wikiFlat,
    active: wikiActive,
    setActive: setWikiActive,
    onInput: wikiOnInput,
    onKeyDown: wikiOnKeyDown,
  } = useFilteredList<WikiOption>({
    items: async (query) => {
      const trellisReady = untrack(() => trellis.ready)
      if (!trellisReady) return []

      const trellisIssues = untrack(() => trellis.issues)
      const trellisMilestones = untrack(() => trellis.milestones)
      const trellisDecisions = untrack(() => trellis.decisions)

      const opts: WikiOption[] = []

      for (const issue of trellisIssues) {
        opts.push({ namespace: "issue", target: issue.id, display: issue.title })
      }

      for (const m of trellisMilestones) {
        opts.push({ namespace: "milestone", target: m.id, display: m.title ?? m.id })
      }

      for (const d of trellisDecisions) {
        opts.push({ namespace: "decision", target: d.id, display: d.toolName })
      }

      if (!query.trim()) return opts.slice(0, 10)

      const q = query.toLowerCase()
      return opts
        .filter(
          (o) => o.target.toLowerCase().includes(q) || o.display.toLowerCase().includes(q) || o.namespace.includes(q),
        )
        .slice(0, 10)
    },
    key: wikiKey,
    filterKeys: ["target", "display", "namespace"],
    onSelect: handleWikiSelect,
  })

  const createPill = (part: FileAttachmentPart | AgentPart | EntityPart) => {
    const pill = document.createElement("span")
    pill.setAttribute("data-type", part.type)
    if (part.type === "file") {
      pill.textContent = part.content
      pill.setAttribute("data-path", part.path)
    }
    if (part.type === "agent") {
      pill.textContent = part.content
      pill.setAttribute("data-name", part.name)
    }
    if (part.type === "entity") {
      const ctx = entityLabelCtx()
      const label = resolveEntityPartLabel(part, ctx)
      pill.textContent = entityPartVisibleText(part, ctx)
      pill.setAttribute("data-entity-type", part.entityType)
      pill.setAttribute("data-entity-id", part.entityId)
      pill.setAttribute("data-entity-content", part.content)
      pill.setAttribute("data-entity-label", label)
      pill.setAttribute("title", part.content)
      pill.style.cursor = "pointer"
      pill.addEventListener("click", () => {
        if (part.entityType === "issue") {
          navigate(`/trellis?issue=${part.entityId}`)
        }
      })
    }
    pill.setAttribute("contenteditable", "false")
    pill.style.userSelect = "text"
    return pill
  }

  const isNormalizedEditor = () =>
    Array.from(editorRef.childNodes).every((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (!text.includes("\u200B")) return true
        if (text !== "\u200B") return false

        const prev = node.previousSibling
        const next = node.nextSibling
        const prevIsBr = prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === "BR"
        return !!prevIsBr && !next
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      const el = node as HTMLElement
      if (el.dataset.type === "file") return true
      if (el.dataset.type === "agent") return true
      if (el.dataset.type === "entity") return true
      return el.tagName === "BR"
    })

  const renderEditor = (parts: Prompt) => {
    clearEditor()
    for (const part of parts) {
      if (part.type === "text") {
        editorRef.appendChild(createTextFragment(part.content))
        continue
      }
      if (part.type === "file" || part.type === "agent" || part.type === "entity") {
        editorRef.appendChild(createPill(part))
      }
    }

    const last = editorRef.lastChild
    if (last?.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR") {
      editorRef.appendChild(document.createTextNode("\u200B"))
    }
  }

  // Auto-scroll active command into view when navigating with keyboard
  createEffect(() => {
    const activeId = slashActive()
    if (!activeId || !slashPopoverRef) return

    requestAnimationFrame(() => {
      const element = slashPopoverRef.querySelector(`[data-slash-id="${activeId}"]`)
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  })

  if (promptEnabled()) {
    createEffect(() => {
      promptProbe.set({
        popover: store.popover === "wiki" ? null : store.popover,
        slash: {
          active: slashActive() ?? null,
          ids: slashFlat().map((cmd) => cmd.id),
        },
        hash: {
          active: hashActive() ?? null,
          ids: hashFlat().map((item) => hashKey(item)),
        },
      })
    })

    onCleanup(() => promptProbe.clear())
  }

  const selectPopoverActive = () => {
    if (store.popover === "at") {
      const items = atFlat()
      if (items.length === 0) return
      const active = atActive()
      const item = items.find((entry) => atKey(entry) === active) ?? items[0]
      handleAtSelect(item)
      return
    }

    if (store.popover === "slash") {
      const items = slashFlat()
      if (items.length === 0) return
      const active = slashActive()
      const item = items.find((entry) => entry.id === active) ?? items[0]
      handleSlashSelect(item)
      return
    }

    if (store.popover === "hash") {
      const items = hashFlat()
      if (items.length === 0) return
      const active = hashActive()
      const item = items.find((entry) => hashKey(entry) === active) ?? items[0]
      handleHashSelect(item)
      return
    }

    if (store.popover === "wiki") {
      const items = wikiFlat()
      if (items.length === 0) return
      const active = wikiActive()
      const item = items.find((entry) => wikiKey(entry) === active) ?? items[0]
      handleWikiSelect(item)
    }
  }

  const reconcile = (input: Prompt) => {
    if (mirror.input) {
      mirror.input = false
      if (isNormalizedEditor()) return

      renderEditorWithCursor(input)
      return
    }

    const dom = parseFromDOM()
    if (isNormalizedEditor() && isPromptEqual(input, dom)) return

    renderEditorWithCursor(input)
  }

  createEffect(
    on([() => prompt.current(), () => entityLabelCtx()], ([parts]) => {
      if (composing()) return
      reconcile(parts.filter((part) => part.type !== "image"))
    }),
  )

  const parseFromDOM = (): Prompt => {
    const parts: Prompt = []
    let position = 0
    let buffer = ""

    const flushText = () => {
      let content = buffer
      if (content.includes("\r")) content = content.replace(/\r\n?/g, "\n")
      if (content.includes("\u200B")) content = content.replace(/\u200B/g, "")
      buffer = ""
      if (!content) return
      parts.push({ type: "text", content, start: position, end: position + content.length })
      position += content.length
    }

    const pushFile = (file: HTMLElement) => {
      const content = file.textContent ?? ""
      parts.push({
        type: "file",
        path: file.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const pushAgent = (agent: HTMLElement) => {
      const content = agent.textContent ?? ""
      parts.push({
        type: "agent",
        name: agent.dataset.name!,
        content,
        start: position,
        end: position + content.length,
      })
      position += content.length
    }

    const pushEntity = (entity: HTMLElement) => {
      const visible = entity.textContent ?? ""
      const content = entity.dataset.entityContent ?? visible
      parts.push({
        type: "entity",
        entityType: entity.dataset.entityType!,
        entityId: entity.dataset.entityId!,
        label: entity.dataset.entityLabel,
        content,
        start: position,
        end: position + visible.length,
      })
      position += visible.length
    }

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        buffer += node.textContent ?? ""
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return

      const el = node as HTMLElement
      if (el.dataset.type === "file") {
        flushText()
        pushFile(el)
        return
      }
      if (el.dataset.type === "agent") {
        flushText()
        pushAgent(el)
        return
      }
      if (el.dataset.type === "entity") {
        flushText()
        pushEntity(el)
        return
      }
      if (el.tagName === "BR") {
        buffer += "\n"
        return
      }

      for (const child of Array.from(el.childNodes)) {
        visit(child)
      }
    }

    const children = Array.from(editorRef.childNodes)
    children.forEach((child, index) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes((child as HTMLElement).tagName)
      visit(child)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })

    flushText()

    if (parts.length === 0) parts.push(...DEFAULT_PROMPT)
    return parts
  }

  const handleInput = () => {
    const rawParts = parseFromDOM()
    const images = imageAttachments()
    const cursorPosition = getCursorPosition(editorRef)
    const labelCtx = entityLabelCtx()
    const rawText =
      rawParts.length === 1 && rawParts[0]?.type === "text"
        ? rawParts[0].content
        : rawParts.map((part) => partVisibleText(part, labelCtx)).join("")
    const hasNonText = rawParts.some((part) => part.type !== "text")
    const shouldReset = !NON_EMPTY_TEXT.test(rawText) && !hasNonText && images.length === 0

    if (shouldReset) {
      closePopover()
      resetHistoryNavigation()
      if (prompt.dirty()) {
        mirror.input = true
        prompt.set(DEFAULT_PROMPT, 0)
      }
      queueScroll()
      return
    }

    const shellMode = store.mode === "shell"

    if (!shellMode) {
      const atMatch = rawText.substring(0, cursorPosition).match(/@(\S*)$/)
      const slashMatch = rawText.match(/^\/(\S*)$/)
      const hashMatch = rawText.substring(0, cursorPosition).match(/#(\S*)$/)
      const wikiMatch = rawText.substring(0, cursorPosition).match(/\[\[([^\]]*?)$/)

      if (wikiMatch) {
        wikiOnInput(wikiMatch[1])
        setStore("popover", "wiki")
      } else if (atMatch) {
        atOnInput(atMatch[1])
        setStore("popover", "at")
      } else if (slashMatch) {
        slashOnInput(slashMatch[1])
        setStore("popover", "slash")
      } else if (hashMatch) {
        hashOnInput(hashMatch[1])
        setStore("popover", "hash")
      } else {
        closePopover()
      }
    } else {
      closePopover()
    }

    resetHistoryNavigation()

    mirror.input = true
    prompt.set([...rawParts, ...images], cursorPosition)
    queueScroll()
  }

  const addPart = (part: ContentPart) => {
    if (part.type === "image") return false

    const selection = window.getSelection()
    if (!selection) return false

    if (selection.rangeCount === 0 || !editorRef.contains(selection.anchorNode)) {
      editorRef.focus()
      const cursor = prompt.cursor() ?? visiblePromptText(prompt.current()).length
      setCursorPosition(editorRef, cursor)
    }

    if (selection.rangeCount === 0) return false
    const range = selection.getRangeAt(0)
    if (!editorRef.contains(range.startContainer)) return false

    if (part.type === "file" || part.type === "agent" || part.type === "entity") {
      const cursorPosition = getCursorPosition(editorRef)
      const rawText = visiblePromptText(prompt.current())
      const textBeforeCursor = rawText.substring(0, cursorPosition)
      const atMatch = textBeforeCursor.match(/@(\S*)$/)
      const hashMatch = textBeforeCursor.match(/#(\S*)$/)
      const wikiMatch = textBeforeCursor.match(/\[\[([^\]]*?)$/)
      const pill = createPill(part)
      const gap = document.createTextNode(" ")

      if (atMatch && (part.type === "file" || part.type === "agent" || part.type === "entity")) {
        const start = atMatch.index ?? cursorPosition - atMatch[0].length
        setRangeEdge(editorRef, range, "start", start)
        setRangeEdge(editorRef, range, "end", cursorPosition)
      }

      if (hashMatch && part.type === "entity" && !wikiMatch) {
        const start = hashMatch.index ?? cursorPosition - hashMatch[0].length
        setRangeEdge(editorRef, range, "start", start)
        setRangeEdge(editorRef, range, "end", cursorPosition)
      }

      if (wikiMatch && part.type === "entity") {
        const start = wikiMatch.index ?? cursorPosition - wikiMatch[0].length
        setRangeEdge(editorRef, range, "start", start)
        setRangeEdge(editorRef, range, "end", cursorPosition)
      }

      range.deleteContents()
      range.insertNode(gap)
      range.insertNode(pill)
      range.setStartAfter(gap)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    if (part.type === "text") {
      const fragment = createTextFragment(part.content)
      const last = fragment.lastChild
      range.deleteContents()
      range.insertNode(fragment)
      if (last) {
        if (last.nodeType === Node.TEXT_NODE) {
          const text = last.textContent ?? ""
          if (text === "\u200B") {
            range.setStart(last, 0)
          }
          if (text !== "\u200B") {
            range.setStart(last, text.length)
          }
        }
        if (last.nodeType !== Node.TEXT_NODE) {
          const isBreak = last.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName === "BR"
          const next = last.nextSibling
          const emptyText = next?.nodeType === Node.TEXT_NODE && (next.textContent ?? "") === ""
          if (isBreak && (!next || emptyText)) {
            const placeholder = next && emptyText ? next : document.createTextNode("\u200B")
            if (!next) last.parentNode?.insertBefore(placeholder, null)
            placeholder.textContent = "\u200B"
            range.setStart(placeholder, 0)
          } else {
            range.setStartAfter(last)
          }
        }
      }
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    handleInput()
    closePopover()
    return true
  }

  const addToHistory = (prompt: Prompt, mode: "normal" | "shell") => {
    const currentHistory = mode === "shell" ? shellHistory : history
    const setCurrentHistory = mode === "shell" ? setShellHistory : setHistory
    const next = prependHistoryEntry(currentHistory.entries, prompt, mode === "shell" ? [] : historyComments())
    if (next === currentHistory.entries) return
    setCurrentHistory("entries", next)
  }

  createEffect(
    on(
      () => props.edit?.id,
      (id) => {
        const edit = props.edit
        if (!id || !edit) return

        for (const item of prompt.context.items()) {
          prompt.context.remove(item.key)
        }

        for (const item of edit.context) {
          prompt.context.add({
            type: item.type,
            path: item.path,
            selection: item.selection,
            comment: item.comment,
            commentID: item.commentID,
            commentOrigin: item.commentOrigin,
            preview: item.preview,
          })
        }

        setStore("mode", "normal")
        setStore("popover", null)
        setStore("historyIndex", -1)
        setStore("savedPrompt", null)
        prompt.set(edit.prompt, promptLength(edit.prompt))
        requestAnimationFrame(() => {
          editorRef.focus()
          setCursorPosition(editorRef, promptLength(edit.prompt))
          queueScroll()
        })
        props.onEditLoaded?.()
      },
      { defer: true },
    ),
  )

  const navigateHistory = (direction: "up" | "down") => {
    const result = navigatePromptHistory({
      direction,
      entries: store.mode === "shell" ? shellHistory.entries : history.entries,
      historyIndex: store.historyIndex,
      currentPrompt: prompt.current(),
      currentComments: historyComments(),
      savedPrompt: store.savedPrompt,
    })
    if (!result.handled) return false
    setStore("historyIndex", result.historyIndex)
    setStore("savedPrompt", result.savedPrompt)
    applyHistoryPrompt(result.entry, result.cursor)
    return true
  }

  const { addAttachments, removeAttachment, handlePaste } = createPromptAttachments({
    editor: () => editorRef,
    isDialogActive: () => !!dialog.active,
    focusEditor: () => {
      editorRef.focus()
      setCursorPosition(editorRef, promptLength(prompt.current()))
    },
    addPart,
    readClipboardImage: platform.readClipboardImage,
  })

  const variants = createMemo(() => ["default", ...local.model.variant.list()])
  const accepting = createMemo(() => {
    const id = params.id
    if (!id) return permission.isAutoAcceptingDirectory(sdk.directory)
    return permission.isAutoAccepting(id, sdk.directory)
  })
  const acceptLabel = createMemo(() =>
    language.t(accepting() ? "command.permissions.autoaccept.disable" : "command.permissions.autoaccept.enable"),
  )
  const toggleAccept = () => {
    if (!params.id) {
      permission.toggleAutoAcceptDirectory(sdk.directory)
      return
    }

    permission.toggleAutoAccept(params.id, sdk.directory)
  }

  const { abort, handleSubmit } = createPromptSubmit({
    info,
    contextPaths: () => {
      const paths: string[] = []
      const projection = projectionWhiteboard.path()
      if (projection) paths.push(projection)
      for (const tab of recent()) {
        if (paths.length >= 3) break
        if (paths.includes(tab)) continue
        paths.push(tab)
      }
      return paths
    },
    imageAttachments,
    commentCount,
    autoAccept: () => accepting(),
    mode: () => store.mode,
    working,
    editor: () => editorRef,
    queueScroll,
    promptLength,
    addToHistory,
    resetHistoryNavigation: () => {
      resetHistoryNavigation(true)
    },
    setMode: (mode) => setStore("mode", mode),
    setPopover: (popover) => setStore("popover", popover),
    newSessionWorktree: () => props.newSessionWorktree,
    onNewSessionWorktreeReset: props.onNewSessionWorktreeReset,
    shouldQueue: props.shouldQueue,
    onQueue: props.onQueue,
    onAbort: props.onAbort,
    onSubmit: props.onSubmit,
    focusForSend: () => focus?.forSend(),
  })

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "u") {
      event.preventDefault()
      if (store.mode !== "normal") return
      pick()
      return
    }

    if (event.key === "Backspace") {
      const selection = window.getSelection()
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode
        const offset = selection.anchorOffset
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? ""
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange()
            range.setStart(node, 0)
            range.collapse(true)
            selection.removeAllRanges()
            selection.addRange(range)
          }
        }
      }
    }

    if (event.key === "!" && store.mode === "normal") {
      const cursorPosition = getCursorPosition(editorRef)
      if (cursorPosition === 0) {
        setStore("mode", "shell")
        setStore("popover", null)
        event.preventDefault()
        return
      }
    }

    if (event.key === "Escape") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (store.mode === "shell") {
        setStore("mode", "normal")
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (working()) {
        abort()
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (escBlur()) {
        editorRef.blur()
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (store.mode === "shell") {
      const { collapsed, cursorPosition, textLength } = getCaretState()
      if (event.key === "Backspace" && collapsed && cursorPosition === 0 && textLength === 0) {
        setStore("mode", "normal")
        event.preventDefault()
        return
      }
    }

    // Handle Shift+Enter BEFORE IME check - Shift+Enter is never used for IME input
    // and should always insert a newline regardless of composition state
    if (event.key === "Enter" && event.shiftKey) {
      addPart({ type: "text", content: "\n", start: 0, end: 0 })
      event.preventDefault()
      return
    }

    if (event.key === "Enter" && isImeComposing(event)) {
      return
    }

    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey

    if (store.popover) {
      if (event.key === "Tab") {
        selectPopoverActive()
        event.preventDefault()
        return
      }
      const nav = event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter"
      const ctrlNav = ctrl && (event.key === "n" || event.key === "p")
      if (nav || ctrlNav) {
        if (store.popover === "at") {
          atOnKeyDown(event)
          event.preventDefault()
          return
        }
        if (store.popover === "slash") {
          slashOnKeyDown(event)
        }
        if (store.popover === "hash") {
          hashOnKeyDown(event)
        }
        if (store.popover === "wiki") {
          wikiOnKeyDown(event)
        }
        event.preventDefault()
        return
      }
    }

    if (ctrl && event.code === "KeyG") {
      if (store.popover) {
        closePopover()
        event.preventDefault()
        return
      }
      if (working()) {
        abort()
        event.preventDefault()
      }
      return
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const { collapsed } = getCaretState()
      if (!collapsed) return

      const cursorPosition = getCursorPosition(editorRef)
      const textContent = visiblePromptText(prompt.current())
      const direction = event.key === "ArrowUp" ? "up" : "down"
      if (!canNavigateHistoryAtCursor(direction, textContent, cursorPosition, store.historyIndex >= 0)) return
      if (navigateHistory(direction)) {
        event.preventDefault()
      }
      return
    }

    // Note: Shift+Enter is handled earlier, before IME check
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (event.repeat) return
      if (
        working() &&
        visiblePromptText(prompt.current()).trim().length === 0 &&
        imageAttachments().length === 0 &&
        commentCount() === 0
      ) {
        return
      }
      handleSubmit(event)
    }
  }

  return (
    <div class="relative size-full _max-h-[320px] flex flex-col gap-0">
      <PromptPopover
        popover={store.popover}
        setSlashPopoverRef={(el) => (slashPopoverRef = el)}
        atFlat={atFlat()}
        atGrouped={atGrouped.latest ?? []}
        atActive={atActive() ?? undefined}
        atKey={atKey}
        setAtActive={setAtActive}
        onAtSelect={handleAtSelect}
        slashFlat={slashFlat()}
        slashActive={slashActive() ?? undefined}
        setSlashActive={setSlashActive}
        onSlashSelect={handleSlashSelect}
        hashFlat={hashFlat()}
        hashActive={hashActive() ?? undefined}
        setHashActive={setHashActive}
        onHashSelect={handleHashSelect}
        wikiFlat={wikiFlat()}
        wikiActive={wikiActive() ?? undefined}
        setWikiActive={setWikiActive}
        onWikiSelect={handleWikiSelect}
        commandKeybind={command.keybind}
        t={(key) => language.t(key as Parameters<typeof language.t>[0])}
      />
      <DockShell
        classList={{
          "group/prompt-input": true,
          "shadow-xs-border": true,
          [props.class ?? ""]: !!props.class,
        }}
      >
        <div class="p-2">
          <PromptFocusChip t={(key) => language.t(key as Parameters<typeof language.t>[0])} />
        </div>
        <form onSubmit={handleSubmit} class="flex flex-col min-h-0">
          <PromptContextItems
            items={contextItems()}
            active={(item) => {
              const active = comments.active()
              return !!item.commentID && item.commentID === active?.id && item.path === active?.file
            }}
            openComment={openComment}
            remove={(item) => {
              if (item.commentID) comments.remove(item.path, item.commentID)
              prompt.context.remove(item.key)
            }}
            t={(key) => language.t(key as Parameters<typeof language.t>[0])}
          />
          <PromptImageAttachments
            attachments={imageAttachments()}
            onOpen={(attachment) =>
              dialog.show(() => <ImagePreview src={attachment.dataUrl} alt={attachment.filename} />)
            }
            onRemove={removeAttachment}
            removeLabel={language.t("prompt.attachment.remove")}
          />
          <div
            class="relative"
            onPointerDown={(e) => {
              const target = e.target
              if (!(target instanceof HTMLElement)) return
              if (e.button !== 0) return
              if (
                target.closest(
                  '[data-action="prompt-attach"], [data-action="prompt-submit"], [data-action="prompt-permissions"]',
                )
              ) {
                return
              }
              if (isEditablePointerTarget(target)) return

              e.stopPropagation()
              focusEditorEnd()
            }}
          >
            <div
              class="relative max-h-[240px] overflow-y-auto no-scrollbar"
              ref={(el) => (scrollRef = el)}
              style={{ "scroll-padding-bottom": space }}
            >
              <div
                data-component="prompt-input"
                ref={(el) => {
                  editorRef = el
                  props.ref?.(el)
                }}
                role="textbox"
                aria-multiline="true"
                aria-label={placeholder()}
                contenteditable="true"
                autocapitalize={store.mode === "normal" ? "sentences" : "off"}
                autocorrect={store.mode === "normal" ? "on" : "off"}
                spellcheck={store.mode === "normal"}
                onInput={handleInput}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                classList={{
                  "select-text": true,
                  "w-full pl-3 pr-2 pt-2 text-14-regular text-text-strong focus:outline-none whitespace-pre-wrap": true,
                  "[&_[data-type=file]]:text-syntax-property": true,
                  "[&_[data-type=agent]]:text-syntax-type": true,
                  "[&_[data-type=entity]]:text-syntax-type": true,
                  "font-mono!": store.mode === "shell",
                }}
                style={{ "padding-bottom": space }}
              />
              <Show when={!prompt.dirty()}>
                <div
                  class="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 text-14-regular text-text-weak pointer-events-none whitespace-nowrap truncate"
                  classList={{ "font-mono!": store.mode === "shell" }}
                  style={{ "padding-bottom": space }}
                >
                  {placeholder()}
                </div>
              </Show>
            </div>

            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-x-0 bottom-0"
              style={{
                height: space,
                background:
                  "linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)",
              }}
            />

            <div class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES.join(",")}
                class="hidden"
                onChange={(e) => {
                  const list = e.currentTarget.files
                  if (list) void addAttachments(Array.from(list))
                  e.currentTarget.value = ""
                }}
              />

              <div class="flex items-center gap-1 pointer-events-auto">
                <Tooltip placement="top" inactive={!prompt.dirty() && !working()} value={tip()}>
                  <IconButton
                    data-action="prompt-submit"
                    type="submit"
                    disabled={store.mode !== "normal" || (!prompt.dirty() && !working() && commentCount() === 0)}
                    tabIndex={store.mode === "normal" ? undefined : -1}
                    icon={working() ? "stop" : "arrow-up"}
                    variant="primary"
                    class="size-8"
                    style={buttons()}
                    aria-label={working() ? language.t("prompt.action.stop") : language.t("prompt.action.send")}
                  />
                </Tooltip>
              </div>
            </div>

            <div class="pointer-events-none absolute bottom-2 left-2">
              <div
                aria-hidden={store.mode !== "normal"}
                class="pointer-events-auto"
                style={{
                  "pointer-events": buttonsSpring() > 0.5 ? "auto" : "none",
                }}
              >
                <TooltipKeybind
                  placement="top"
                  title={language.t("prompt.action.attachFile")}
                  keybind={command.keybind("file.attach")}
                >
                  <Button
                    data-action="prompt-attach"
                    type="button"
                    variant="ghost"
                    class="size-8 p-0"
                    style={buttons()}
                    onClick={pick}
                    disabled={store.mode !== "normal"}
                    tabIndex={store.mode === "normal" ? undefined : -1}
                    aria-label={language.t("prompt.action.attachFile")}
                  >
                    <Icon name="plus" class="size-4.5" />
                  </Button>
                </TooltipKeybind>
              </div>
            </div>
          </div>
        </form>
      </DockShell>
      <Show when={store.mode === "normal" || store.mode === "shell"}>
        <DockTray attach="top">
          <div class="px-1.75 pt-4 pb-1 flex items-center gap-1 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0 flex-1 relative">
              <div
                class="h-7 flex items-center gap-1.5 max-w-[160px] min-w-0 absolute inset-y-0 left-0"
                style={{
                  padding: "0 4px 0 8px",
                  ...shell(),
                }}
              >
                <span class="truncate text-13-medium text-text-strong">{language.t("prompt.mode.shell")}</span>
                <div class="size-4 shrink-0" />
              </div>
              <div class="flex items-center gap-1.5 min-w-0 flex-1">
                {/* <div data-component="prompt-agent-control">
                  <TooltipKeybind
                    placement="top"
                    gutter={4}
                    title={language.t("command.agent.cycle")}
                    keybind={command.keybind("agent.cycle")}
                  >
                    <Select
                      size="normal"
                      options={agentNames()}
                      current={local.agent.current()?.name ?? ""}
                      onSelect={local.agent.set}
                      class="capitalize max-w-[160px] text-text-base"
                      valueClass="truncate text-13-regular text-text-base"
                      triggerStyle={control()}
                      triggerProps={{ "data-action": "prompt-agent" }}
                      variant="ghost"
                    />
                  </TooltipKeybind>
                </div> */}
                <div data-component="prompt-model-control">
                  <Show
                    when={providers.free().length === 0}
                    fallback={
                      <TooltipKeybind
                        placement="top"
                        gutter={4}
                        title={language.t("command.model.choose")}
                        keybind={command.keybind("model.choose")}
                      >
                        <Button
                          data-action="prompt-model"
                          as="div"
                          variant="ghost"
                          size="normal"
                          class="min-w-0 max-w-[320px] text-13-regular text-text-base group"
                          style={control()}
                          onClick={() => {
                            void import("@/components/dialog-select-model-unpaid").then((x) => {
                              dialog.show(() => <x.DialogSelectModelUnpaid model={local.model} />)
                            })
                          }}
                        >
                          <Show when={local.model.current()?.provider?.id}>
                            <ProviderIcon
                              id={local.model.current()?.provider?.id ?? ""}
                              class="size-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150"
                              style={{ "will-change": "opacity", transform: "translateZ(0)" }}
                            />
                          </Show>
                          <span class="truncate">
                            {local.model.current()?.name ?? language.t("dialog.model.select.title")}
                          </span>
                          <Icon name="chevron-down" size="small" class="shrink-0" />
                        </Button>
                      </TooltipKeybind>
                    }
                  >
                    <TooltipKeybind
                      placement="top"
                      gutter={4}
                      title={language.t("command.model.choose")}
                      keybind={command.keybind("model.choose")}
                    >
                      <ModelSelectorPopover
                        model={local.model}
                        triggerAs={Button}
                        triggerProps={{
                          variant: "ghost",
                          size: "normal",
                          style: control(),
                          class: "min-w-0 max-w-[320px] text-13-regular text-text-base group",
                          "data-action": "prompt-model",
                        }}
                      >
                        <Show when={local.model.current()?.provider?.id}>
                          <ProviderIcon
                            id={local.model.current()?.provider?.id ?? ""}
                            class="size-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150"
                            style={{ "will-change": "opacity", transform: "translateZ(0)" }}
                          />
                        </Show>
                        <span class="truncate">
                          {local.model.current()?.name ?? language.t("dialog.model.select.title")}
                        </span>
                        <Icon name="chevron-down" size="small" class="shrink-0" />
                      </ModelSelectorPopover>
                    </TooltipKeybind>
                  </Show>
                </div>
                <div data-component="prompt-variant-control">
                  <TooltipKeybind
                    placement="top"
                    gutter={4}
                    title={language.t("command.model.variant.cycle")}
                    keybind={command.keybind("model.variant.cycle")}
                  >
                    <Select
                      size="normal"
                      options={variants()}
                      current={local.model.variant.current() ?? "default"}
                      label={(x) => (x === "default" ? language.t("common.default") : x)}
                      onSelect={(x) => local.model.variant.set(x === "default" ? undefined : x)}
                      class="capitalize max-w-[160px] text-text-base"
                      valueClass="truncate text-13-regular text-text-base"
                      triggerStyle={control()}
                      triggerProps={{ "data-action": "prompt-model-variant" }}
                      variant="ghost"
                    />
                  </TooltipKeybind>
                </div>
                <TooltipKeybind
                  placement="top"
                  gutter={8}
                  title={acceptLabel()}
                  keybind={command.keybind("permissions.autoaccept")}
                >
                  <Button
                    data-action="prompt-permissions"
                    variant="ghost"
                    onClick={toggleAccept}
                    classList={{
                      "h-7 w-7 p-0 shrink-0 flex items-center justify-center": true,
                      "text-text-base": !accepting(),
                      "hover:bg-surface-success-base": accepting(),
                    }}
                    style={control()}
                    aria-label={acceptLabel()}
                    aria-pressed={accepting()}
                  >
                    <Icon name="shield" size="small" classList={{ "text-icon-success-base": accepting() }} />
                  </Button>
                </TooltipKeybind>
              </div>
            </div>
          </div>
        </DockTray>
      </Show>
    </div>
  )
}

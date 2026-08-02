import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createResource,
  batch,
  onCleanup,
  onMount,
  untrack,
  type JSX,
} from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { base64Encode } from "@opencode-ai/util/encode"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { Select } from "@opencode-ai/ui/select"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useNavigate } from "@solidjs/router"
import { sessionRouteHref } from "@/pages/session/helpers"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import {
  type TrellisIssue,
  type TrellisOp,
  type TrellisDecision,
  type TrellisBranch,
  type TrellisMilestone,
  type TrellisGardenCluster,
  type TrellisGardenStats,
  type TrellisEvalSummary,
  type TrellisAgentReport,
  type TrellisIssueScore,
  type TrellisDogfood,
  type TrellisGraphNode,
  type TrellisGraphEdge,
  type TrellisPlan,
  type TrellisSuggestion,
  type TrellisRecoverableIdea,
  type TrellisConversation,
  type TrellisDiffResult,
  type TrellisWorkspaceConfig,
  type WorkUnit,
  useTrellis,
} from "@/context/trellis"
import { useSync } from "@/context/sync"
import { graphNav } from "@/lib/graph-nav"
import { showToast } from "@opencode-ai/ui/toast"
import * as d3Force from "d3-force"
import * as d3Select from "d3-selection"
import * as d3Drag from "d3-drag"
import { loadHideEmpty, saveHideEmpty } from "@/components/database/entity-sidebar"
import { SidebarTree } from "@/components/database/sidebar-tree"
import {
  ENTITY_COLORS,
  ENTITY_ICON_VIEWBOX,
  EntityIcon,
  entityColor,
  entityTypeLabel,
  type EntityTheme,
} from "@/lib/entity-theme"
import { chooseIconName, fileIconSpriteUrl } from "@opencode-ai/ui/file-icon"
import { EntitySurface } from "@/components/entity-detail/surface"
import { EntityHoverProvider, EntityNavProvider } from "@/components/entity-detail/nav"
import {
  RouteContent,
  RouteHeader,
  RouteNav,
  RoutePanel,
  RouteSidebar,
  ResizableRouteSidebar,
  ResizableSidebarLayout,
  RouteView,
} from "@/components/route"
import { AffordanceShell, Pill, SectionHeader, TagChip } from "@/components/affordance"
import { isNavV2Enabled } from "@/lib/nav-flag"
import * as d3Zoom from "d3-zoom"
import { DragDropProvider, DragDropSensors, createDraggable, createDroppable } from "@thisbeyond/solid-dnd"
import { TrellisOpBadge } from "./trellis-op-icon"
import { CalendarView } from "@/pages/session/calendar-view"
import { useEntityDialog } from "@/components/entity-dialog"
import type { Todo } from "@opencode-ai/sdk/v2/client"
import { formatServerError } from "@/utils/server-errors"
import { createLayoutSaver, hydrate as hydrateLayout, loadLayout, snapshot, type Layout } from "./graph-layout"
import { renderCanvas } from "./graph-canvas"
import { graphPreload, invalidatePreload } from "@/lib/graph-preloader"
export { HomeDashboard } from "./trellis/home-dashboard"
import {
  TIER,
  GRAPH_LABEL_MIN_ZOOM,
  GRAPH_SIM_ALPHA_MIN,
  GRAPH_SIM_DECAY_MUL,
  GRAPH_MINIMAP_W,
  GRAPH_MINIMAP_W_MOBILE,
  NODE_ICON_STROKE,
  createGraphBeacon,
  fitClusterTransform,
  shouldShowGraphBeacon,
  wheelPanBy,
  type GraphCallbacks,
  type LayoutPersistence,
  type Physics,
  type RenderHandle,
  type SimNode,
  nodeColor,
  nodeIcon,
  nodeRadius,
  DEFAULT_PHYSICS,
} from "./graph-shared"

const cols = [
  { id: "backlog", label: "Backlog", tone: "var(--text-weak)" },
  { id: "in_progress", label: "In Progress", tone: "var(--text-weak)" },
  { id: "paused", label: "Paused", tone: "var(--text-weak)" },
  { id: "closed", label: "Closed", tone: "var(--text-weak)" },
] as const

type BoardOrder = "newest" | "oldest" | "priority" | "blocked" | "ac" | "title"

const ORDER_OPTIONS: { id: BoardOrder; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "priority", label: "Priority" },
  { id: "blocked", label: "Blocked first" },
  { id: "ac", label: "AC progress" },
  { id: "oldest", label: "Oldest first" },
  { id: "title", label: "Title" },
]

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function issueCol(status: string) {
  return status === "queue" ? "backlog" : status
}

const todoCol: Record<string, string> = {
  pending: "backlog",
  in_progress: "in_progress",
  completed: "closed",
}

const unitCol: Record<WorkUnit["status"], string> = {
  backlog: "backlog",
  in_progress: "in_progress",
  done: "closed",
}

const unitStatus: Partial<Record<string, WorkUnit["status"]>> = {
  backlog: "backlog",
  in_progress: "in_progress",
  closed: "done",
}

type BoardEntry = { kind: "issue"; item: TrellisIssue; col: string } | { kind: "workunit"; item: WorkUnit; col: string }

function entryKey(entry: BoardEntry) {
  return `${entry.kind}:${entry.item.id}`
}

function entryTags(entry: BoardEntry) {
  return entry.kind === "issue" ? entry.item.labels : entry.item.tags
}

function entryDetail(entry: BoardEntry) {
  if (entry.kind === "issue") return entry.item.description
  return entry.item.cycle || entry.item.specPath
}

function entryBranch(entry: BoardEntry) {
  return entry.kind === "issue" ? entry.item.branch : undefined
}

function prompt(entry: BoardEntry) {
  const item = entry.item
  const label = entry.kind === "issue" ? "Trellis issue" : "Trellis WorkUnit"
  const tags = entryTags(entry)
  const criteria = (item.criteria ?? [])
    .map((c) => {
      const status = c.status ? ` [${c.status}]` : ""
      const command = c.command ? `\n  command: ${c.command}` : ""
      return `- ${c.description ?? c.id}${status}${command}`
    })
    .join("\n")
  const meta = [
    `ID: ${item.id}`,
    `Title: ${item.title}`,
    `Status: ${item.status}`,
    `Priority: ${item.priority}`,
    tags.length ? `Tags: ${tags.join(", ")}` : undefined,
    "branch" in item && item.branch ? `Branch: ${item.branch}` : undefined,
    "cycle" in item && item.cycle ? `Cycle: ${item.cycle}` : undefined,
    "specPath" in item && item.specPath ? `Spec: ${item.specPath}` : undefined,
    item.assignee ? `Assignee: ${item.assignee}` : undefined,
    entryDetail(entry) ? `Details: ${entryDetail(entry)}` : undefined,
    item.criteriaCount ? `Acceptance: ${item.criteriaPassed}/${item.criteriaCount}` : undefined,
  ].filter((line): line is string => !!line)

  return `Begin implementing this ${label}.

${meta.join("\n")}

${criteria ? `Acceptance criteria:\n${criteria}\n\n` : ""}Inspect the codebase, make the required changes, validate them, and summarize the result.`
}

export type TrellisBoardController = {
  startCreate: (col?: string) => void
  refresh: () => void
  visibleCount: () => number
  totalCount: () => number
}

export function TrellisBoard(props: {
  todos?: Todo[]
  hideToolbar?: boolean
  query?: string
  onQueryChange?: (v: string) => void
  order?: BoardOrder
  onOrderChange?: (v: BoardOrder) => void
  onReady?: (ctrl: TrellisBoardController) => void
}) {
  const trellis = useTrellis()
  const entityDialog = useEntityDialog()
  const language = useLanguage()
  const local = useLocal()
  const navigate = useNavigate()
  const sdk = useSDK()
  const sync = useSync()
  const issues = createMemo(() => trellis.issues)
  const units = createMemo(() => trellis.workUnits)
  const entries = createMemo<BoardEntry[]>(() => [
    ...issues().map((item) => ({ kind: "issue" as const, item, col: issueCol(item.status) })),
    ...units().map((item) => ({ kind: "workunit" as const, item, col: unitCol[item.status] })),
  ])
  const [internalQuery, setInternalQuery] = createSignal("")
  const [internalOrder, setInternalOrder] = createSignal<BoardOrder>("newest")
  const query = () => props.query ?? internalQuery()
  const setQuery = (v: string) => (props.onQueryChange ? props.onQueryChange(v) : setInternalQuery(v))
  const order = () => props.order ?? internalOrder()
  const setOrder = (v: BoardOrder) => (props.onOrderChange ? props.onOrderChange(v) : setInternalOrder(v))
  const searchTerms = createMemo(() => query().toLowerCase().trim().split(/\s+/).filter(Boolean))
  const visibleEntries = createMemo(() => entries().filter((entry) => matchesEntry(entry, searchTerms())))
  const visiblePlanSteps = createMemo(() => (props.todos ?? []).filter((step) => matchesPlanStep(step, searchTerms())))
  const [selected, setSelected] = createSignal<string | undefined>()
  const [draggingId, setDraggingId] = createSignal<string | undefined>()
  const [creatingCol, setCreatingCol] = createSignal<string | null>(null)
  const [newTitle, setNewTitle] = createSignal("")
  const [newPriority, setNewPriority] = createSignal<"medium" | "high" | "low" | "critical">("medium")
  const [play, setPlay] = createStore({
    id: undefined as string | undefined,
  })

  // Sync issues with active task context
  // TODO: Implement active task sync when context is available

  onMount(() => {
    props.onReady?.({
      startCreate: (col?: string) => setCreatingCol(col ?? "backlog"),
      refresh: () => void trellis.refresh(),
      visibleCount: () => visibleEntries().length,
      totalCount: () => entries().length,
    })
  })

  const onSelect = (entry: BoardEntry) => {
    setSelected(entryKey(entry))
    entityDialog.push(entry.item.id, entry.kind)
    // TODO: Set active issue when context is available
  }

  const onDragEnd: import("@thisbeyond/solid-dnd").DragEventHandler = (event) => {
    setDraggingId(undefined)
    const key = event.draggable?.id as string | undefined
    const target = event.droppable?.id as string | undefined
    if (!key || !target) return

    const issue = issues().find((i) => entryKey({ kind: "issue", item: i, col: i.status }) === key)
    if (issue) {
      if (issueCol(issue.status) === target) return

      const source = issue.status

      if (target === "in_progress" && source === "paused") {
        void trellis.resumeIssue(issue.id)
        return
      }
      if (target === "in_progress") {
        void trellis.startIssue(issue.id)
        return
      }
      if (target === "paused" && source === "in_progress") {
        void trellis.pauseIssue(issue.id, "Paused via kanban board")
        return
      }
      if (target === "closed") {
        // force=true skips AC gate — intentional for quick kanban close
        void trellis.closeIssue(issue.id, true)
        return
      }
      if (source === "closed") {
        void (async () => {
          await trellis.reopenIssue(issue.id)
          if (target !== "backlog") await trellis.updateIssueStatus(issue.id, target)
        })()
        return
      }
      void trellis.updateIssueStatus(issue.id, target)
      return
    }

    const unit = units().find((u) => entryKey({ kind: "workunit", item: u, col: unitCol[u.status] }) === key)
    const status = target ? unitStatus[target] : undefined
    if (!unit || !status || unit.status === status) return
    void trellis.updateWorkUnit(unit.id, { status })
  }

  const submitNewIssue = async (status: string) => {
    const title = newTitle().trim()
    if (!title) return
    await trellis.createIssue({
      title,
      priority: newPriority(),
    })
    batch(() => {
      setCreatingCol(null)
      setNewTitle("")
      setNewPriority("medium")
    })
  }

  const begin = async (entry: BoardEntry) => {
    if (play.id) return

    const model = local.model.current()
    const agent = local.agent.current()
    const variant = local.model.variant.current()
    if (!model || !agent) {
      showToast({
        variant: "error",
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    setPlay("id", entryKey(entry))
    try {
      const created = await sdk.client.session
        .create()
        .then((x) => x.data ?? undefined)
        .catch((err) => {
          showToast({
            variant: "error",
            title: language.t("prompt.toast.sessionCreateFailed.title"),
            description: formatServerError(err, language.t),
          })
          return undefined
        })
      if (!created) return

      sync.set("session", (list) => {
        if (list.some((item) => item.id === created.id)) return list
        return [...list, created].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      })
      local.session.promote(sdk.directory, created.id)
      navigate(sessionRouteHref(base64Encode(sdk.directory), created.id))

      await sdk.client.session
        .promptAsync({
          sessionID: created.id,
          agent: agent.name,
          model: {
            modelID: model.id,
            providerID: model.provider.id,
          },
          variant,
          parts: [{ type: "text", text: prompt(entry) }],
        })
        .catch((err) => {
          showToast({
            variant: "error",
            title: language.t("prompt.toast.promptSendFailed.title"),
            description: formatServerError(err, language.t),
          })
        })
    } finally {
      setPlay("id", undefined)
    }
  }

  return (
    <div class="size-full min-h-0 flex flex-col bg-background-base overflow-hidden">
      {/* <div class="shrink-0 px-6 py-4 border-b border-border-weaker-base flex items-center gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <Icon name="checklist" size="small" />
          <div class="text-14-medium text-text-strong">Trellis Board</div>
          <div class="text-12-regular text-text-weak">
            {issues().length} issues · {units().length} work units
          </div>
        </div>
        <div class="flex-1" />
        <Button size="small" variant="ghost" onClick={() => void trellis.refresh()}>
          Refresh
        </Button>
      </div> */}

      <Show
        when={trellis.ready}
        fallback={
          <div class="flex-1 flex items-center justify-center text-12-regular text-text-weak">
            {language.t("common.loading")}
            {language.t("common.loading.ellipsis")}
          </div>
        }
      >
        <Show
          when={!trellis.error}
          fallback={
            <div class="flex-1 flex items-center justify-center text-12-regular text-text-weak">{trellis.error}</div>
          }
        >
          <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Show when={!props.hideToolbar}>
              <div class="shrink-0 border-b border-border-weaker-base bg-background-base/80 px-3 py-2 flex flex-wrap items-center gap-3">
                <div class="relative h-8 flex-1 rounded-md border border-border-base/50 bg-surface-raised-base/30 focus-within:border-border-strong-base/80 focus-within:bg-surface-raised-base/50 transition-colors">
                  <Icon name="search" size="small" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-icon-weak" />
                  <InlineInput
                    placeholder="Search issues..."
                    value={query()}
                    onInput={(e: InputEvent) => setQuery((e.target as HTMLInputElement).value)}
                    class="h-full w-full bg-transparent border-none pl-8 pr-8 text-12-regular text-text-base placeholder:text-text-weaker outline-none"
                  />
                  <Show when={query().trim()}>
                    <button
                      type="button"
                      title="Clear search"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                      class="absolute right-1 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-md text-icon-weak hover:bg-background-base hover:text-text-base transition-colors"
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                  </Show>
                </div>
                <div class="h-8 rounded-md border border-border-base/50 bg-surface-raised-base/30 px-2 flex items-center gap-1.5">
                  <Icon name="sliders" size="small" class="text-icon-weak" />
                  <Select
                    current={ORDER_OPTIONS.find((item) => item.id === order())}
                    onSelect={(item) => item && setOrder(item.id)}
                    options={ORDER_OPTIONS}
                    value={(item) => item.id}
                    label={(item) => item.label}
                    size="small"
                    variant="ghost"
                    class="!h-7 !px-1"
                    valueClass="min-w-24 text-12-medium"
                  />
                </div>
                <div class="h-8 rounded-md border border-border-base/50 bg-surface-raised-base/30 px-2 flex items-center text-11-regular tabular-nums text-text-weak">
                  {visibleEntries().length}/{entries().length}
                </div>
                <IconButton
                  icon="refresh-cw"
                  variant="ghost"
                  size="small"
                  title="Refresh"
                  aria-label="Refresh board"
                  onClick={() => void trellis.refresh()}
                  class="!size-8"
                />
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => {
                    setCreatingCol("backlog")
                  }}
                >
                  + add issue
                </Button>
              </div>
            </Show>
            <DragDropProvider onDragEnd={onDragEnd}>
              <DragDropSensors />
              <div class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
                <div class="h-full flex gap-4 p-4">
                  <For each={cols}>
                    {(col) => (
                      <Col
                        id={col.id}
                        label={col.label}
                        tone={col.tone}
                        entries={visibleEntries().filter((item) => item.col === col.id)}
                        planSteps={visiblePlanSteps().filter((t) => todoCol[t.status] === col.id)}
                        order={order()}
                        onSelect={onSelect}
                        selected={selected()}
                        draggingId={draggingId()}
                        setDraggingId={setDraggingId}
                        creating={creatingCol() === col.id}
                        onStartCreate={() => setCreatingCol(col.id)}
                        onCancelCreate={() => {
                          batch(() => {
                            setCreatingCol(null)
                            setNewTitle("")
                            setNewPriority("medium")
                          })
                        }}
                        newTitle={newTitle()}
                        onTitleChange={setNewTitle}
                        newPriority={newPriority()}
                        onPriorityChange={setNewPriority}
                        onSubmit={() => submitNewIssue(col.id)}
                        onPlay={begin}
                        playing={play.id}
                      />
                    )}
                  </For>
                </div>
              </div>
            </DragDropProvider>
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default function TrellisPage() {
  return <TrellisBoard />
}

function Col(props: {
  id: string
  label: string
  tone: string
  entries: BoardEntry[]
  planSteps?: Todo[]
  order: BoardOrder
  onSelect: (entry: BoardEntry) => void
  selected?: string
  draggingId?: string
  setDraggingId: (id: string | undefined) => void
  creating: boolean
  onStartCreate: () => void
  onCancelCreate: () => void
  newTitle: string
  onTitleChange: (v: string) => void
  newPriority: "medium" | "high" | "low" | "critical"
  onPriorityChange: (v: "medium" | "high" | "low" | "critical") => void
  onSubmit: () => void
  onPlay: (entry: BoardEntry) => void
  playing?: string
}) {
  const list = createMemo(() => sort(props.entries, props.order))
  const droppable = createDroppable(props.id)

  const headerBg = () => "bg-surface-raised-base/80"

  const columnIcon = () => {
    switch (props.id) {
      case "backlog":
        return "folder"
      case "in_progress":
        return "arrow-right"
      case "paused":
        return "stop"
      case "closed":
        return "check-small"
      default:
        return "folder"
    }
  }

  const columnBg = () => "bg-surface-raised-base/40"

  const headerPillBg = () => "bg-background-base text-text-weak border border-border-base/50"

  return (
    <section
      ref={droppable.ref}
      class={`h-full w-72 flex-shrink-0 flex flex-col rounded-xl border border-border-base/50 ${columnBg()}`}
      classList={{
        "ring-2 ring-border-strong-base bg-surface-raised-base/60 opacity-100": droppable.isActiveDroppable,
        "opacity-50 saturate-50": props.id === "closed" && !droppable.isActiveDroppable,
      }}
    >
      <div class={`shrink-0 px-3 py-2 flex rounded-t-xl items-center gap-2 ${headerBg()}`}>
        <Icon name={columnIcon()} size="small" class="text-text-weak" />
        <div class={`rounded-full px-2 py-0.5 text-11-medium ${headerPillBg()}`}>{list().length}</div>
        <div class="text-12-medium uppercase tracking-wide text-text-strong">{props.label}</div>
        <div class="flex-1" />
        <Show
          when={!props.creating}
          fallback={
            <button
              onClick={props.onCancelCreate}
              class="flex items-center justify-center size-6 rounded-md hover:bg-surface-raised-base transition-colors"
            >
              <Icon name="close-small" size="small" class="text-text-weak" />
            </button>
          }
        >
          <button
            onClick={props.onStartCreate}
            class="flex items-center justify-center size-6 rounded-md hover:bg-surface-raised-base transition-colors"
          >
            <Icon name="plus-small" size="small" class="text-text-weak" />
          </button>
        </Show>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        <Show
          when={list().length > 0 || (props.planSteps ?? []).length > 0}
          fallback={<div class="px-2 py-4 text-12-regular text-text-weak text-center">No items</div>}
        >
          <For each={props.planSteps ?? []}>{(step) => <PlanCard step={step} />}</For>
          <For each={list()}>
            {(entry) => (
              <Card
                entry={entry}
                onClick={() => props.onSelect(entry)}
                selected={props.selected === entryKey(entry)}
                isDragging={props.draggingId === entryKey(entry)}
                setDraggingId={props.setDraggingId}
                draggingId={props.draggingId}
                onPlay={() => props.onPlay(entry)}
                playing={props.playing === entryKey(entry)}
                disabled={!!props.playing}
              />
            )}
          </For>
        </Show>

        <Show when={props.creating}>
          <div class="mt-1 p-2 rounded-md bg-surface-raised-base border border-border-base flex flex-col gap-2">
            <InlineInput
              placeholder="Issue title..."
              value={props.newTitle}
              onInput={(e: InputEvent) => props.onTitleChange((e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && props.onSubmit()}
              class="w-full"
              autofocus
            />
            <div class="flex items-center gap-2">
              <Select
                current={props.newPriority}
                onSelect={(v) => v && props.onPriorityChange(v as "low" | "medium" | "high" | "critical")}
                options={["low", "medium", "high", "critical"]}
                label={(x) => x.charAt(0).toUpperCase() + x.slice(1)}
                class="w-24"
                size="small"
              />
              <div class="flex-1" />
              <IconButton
                icon="check-small"
                variant="ghost"
                onClick={props.onSubmit}
                disabled={!props.newTitle.trim()}
              />
              <IconButton icon="close-small" variant="ghost" onClick={props.onCancelCreate} />
            </div>
          </div>
        </Show>
      </div>
    </section>
  )
}

function PlanCard(props: { step: Todo }) {
  const icon = () => {
    if (props.step.status === "completed") return "check-small"
    if (props.step.status === "in_progress") return "arrow-right"
    return "dash"
  }

  return (
    <div class="rounded-md border border-dashed border-border-info/40 bg-surface-raised-base/40 px-3 py-2 flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        <Icon name={icon()} size="small" class="mt-0.5 shrink-0 text-icon-info" />
        <span class="rounded-full bg-surface-raised-base/60 px-2 py-0.5 text-10-medium text-text-info">plan</span>
        <span class="text-10-medium uppercase text-text-weak/70">{props.step.priority}</span>
      </div>
      <div class="text-13-medium text-text-strong/90 leading-5">{props.step.content}</div>
    </div>
  )
}

function Card(props: {
  entry: BoardEntry
  onClick: () => void
  selected?: boolean
  isDragging?: boolean
  setDraggingId: (id: string | undefined) => void
  draggingId?: string
  onPlay: () => void
  playing?: boolean
  disabled?: boolean
}) {
  const item = () => props.entry.item
  const key = createMemo(() => entryKey(props.entry))
  const tags = createMemo(() => entryTags(props.entry))
  const detail = createMemo(() => entryDetail(props.entry))
  const branch = createMemo(() => entryBranch(props.entry))
  const draggable = createDraggable(key())
  const pct = createMemo(() => {
    if (item().criteriaCount === 0) return 0
    return Math.round((item().criteriaPassed / item().criteriaCount) * 100)
  })
  const done = createMemo(() => item().criteriaCount > 0)
  const blockers = createMemo(() => entryBlockers(props.entry))
  const blocked = createMemo(() => entryIsBlocked(props.entry))
  const ready = createMemo(() => props.entry.kind === "issue" && props.entry.item.status === "queue")

  return (
    <div
      ref={draggable.ref}
      onClick={props.onClick}
      onMouseDown={() => props.setDraggingId(key())}
      onMouseUp={() => props.setDraggingId(undefined)}
      class="rounded-md border px-3 py-2 flex flex-col gap-2 transition-all cursor-pointer backdrop-blur-sm"
      classList={{
        "border-border-strong-base bg-surface-raised-base/90 shadow-sm": props.selected,
        "border-border-base/50 bg-background-base/70 hover:bg-background-base/80 hover:border-border-strong-base/70":
          !props.selected && !blocked(),
        "border-red-500/50 bg-red-500/10 hover:border-red-500/70": blocked() && !props.selected,
        "opacity-40 scale-95 shadow-none": props.isDragging || draggable.isActiveDraggable,
        "opacity-60 scale-98 shadow-sm": props.draggingId === key() && !draggable.isActiveDraggable,
        "cursor-grab hover:scale-[1.02] hover:shadow-sm": !draggable.isActiveDraggable && !props.isDragging,
        "cursor-grabbing": draggable.isActiveDraggable,
      }}
    >
      <div class="flex items-start gap-2">
        <EntityIcon type={props.entry.kind} size={12} class="mt-0.5" />
        <div class="text-12-medium text-text-info/80 shrink-0 font-mono">{item().id}</div>
        <PriorityBadge priority={item().priority} />
        <Show when={ready()}>
          <Pill tone="info" class="shrink-0">
            ready
          </Pill>
        </Show>
        <div class="flex-1" />
        <Show when={branch()}>
          {(branch) => <div class="text-11-regular text-text-weak truncate max-w-24">{branch()}</div>}
        </Show>
        <button
          type="button"
          disabled={props.disabled}
          title="Start implementation session"
          aria-label={`Start implementation session for ${item().id}`}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            props.onPlay()
          }}
          class="flex items-center justify-center size-6 -mr-1 rounded-md text-icon-weak hover:text-text-info hover:bg-surface-raised-base transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <Show when={props.playing} fallback={<Icon name="play" size="small" />}>
            <Spinner class="size-3" />
          </Show>
        </button>
      </div>

      <div class="text-13-medium text-text-strong/95 leading-5">{item().title}</div>

      <Show when={blocked() && blockers().length > 0}>
        <div class="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-11-medium text-red-400">
          <Icon name="circle-ban-sign" size="small" class="shrink-0" />
          <div class="min-w-0 truncate" title={`Blocked by ${blockers().join(", ")}`}>
            Blocked by {blockers().join(", ")}
          </div>
        </div>
      </Show>

      <Show when={detail()}>
        {(desc) => <div class="text-12-regular text-text-weak/80 line-clamp-2">{desc()}</div>}
      </Show>

      <Show when={tags().length > 0}>
        <div class="flex flex-wrap gap-1">
          <For each={tags()}>{(label) => <TagChip>{label}</TagChip>}</For>
        </div>
      </Show>

      <div class="border-t border-border-base/20 pt-2 mt-1 flex items-center gap-2 text-11-regular text-text-weak/80">
        <Show when={done()}>
          <>
            <CriteriaRadial value={pct()} passed={item().criteriaPassed} total={item().criteriaCount} />
            <div class="text-text-weak/90">
              {item().criteriaPassed}/{item().criteriaCount} AC
            </div>
          </>
        </Show>
        <div class="flex-1" />
        <Show when={item().assignee}>{(assignee) => <div class="text-text-weak/90">{assignee()}</div>}</Show>
      </div>
    </div>
  )
}

function priorityLabel(priority: string) {
  switch (priority) {
    case "critical":
      return "!!!"
    case "high":
      return "!!"
    case "medium":
      return "!"
    default:
      return ""
  }
}

function PriorityBadge(props: { priority: string }) {
  const meta = createMemo(() => priorityMeta(props.priority))
  const label = createMemo(() => priorityLabel(props.priority))

  return (
    <div
      class="inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-10-medium uppercase"
      style={{
        color: meta().color,
        background: meta().background,
        "border-color": meta().border,
      }}
      title={`${props.priority} importance`}
    >
      <Icon name={meta().icon} size="small" class="size-3" />
      <Show when={label()}>
        <span>{label()}</span>
      </Show>
    </div>
  )
}

function CriteriaRadial(props: { value: number; passed: number; total: number }) {
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const offset = createMemo(() => circumference - (Math.max(0, Math.min(100, props.value)) / 100) * circumference)
  const color = createMemo(() => criteriaColor(props.value))

  return (
    <div
      class="relative size-8 shrink-0"
      title={`${props.passed}/${props.total} acceptance criteria passed`}
      aria-label={`${props.passed}/${props.total} acceptance criteria passed`}
    >
      <svg viewBox="0 0 28 28" class="size-8 -rotate-90" aria-hidden="true">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="var(--border-base)" stroke-width="3" opacity="0.45" />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke={color()}
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray={`${circumference} ${circumference}`}
          stroke-dashoffset={offset()}
        />
      </svg>
      <div class="absolute inset-0 flex items-center justify-center text-[9px] font-medium tabular-nums text-text-weak">
        {props.value}
      </div>
    </div>
  )
}

function priorityMeta(priority: string) {
  switch (priority) {
    case "critical":
      return {
        icon: "warning",
        color: "rgb(248, 113, 113)",
        background: "rgba(239, 68, 68, 0.14)",
        border: "rgba(239, 68, 68, 0.36)",
      }
    case "high":
      return {
        icon: "arrow-up",
        color: "rgb(248, 113, 113)",
        background: "rgba(239, 68, 68, 0.12)",
        border: "rgba(239, 68, 68, 0.32)",
      }
    case "medium":
      return {
        icon: "dash",
        color: "rgb(234, 179, 8)",
        background: "rgba(234, 179, 8, 0.12)",
        border: "rgba(234, 179, 8, 0.32)",
      }
    case "low":
      return {
        icon: "arrow-down-to-line",
        color: "rgb(96, 165, 250)",
        background: "rgba(59, 130, 246, 0.12)",
        border: "rgba(59, 130, 246, 0.32)",
      }
    default:
      return {
        icon: "dash",
        color: "var(--text-weak)",
        background: "color-mix(in oklch, var(--surface-raised-base) 80%, transparent)",
        border: "var(--border-base)",
      }
  }
}

function criteriaColor(value: number) {
  if (value >= 80) return "var(--icon-success)"
  if (value >= 40) return "var(--icon-warning)"
  return "var(--icon-info)"
}

function entryBlockers(entry: BoardEntry) {
  return entry.kind === "issue" ? (entry.item.blockedBy ?? []) : []
}

function entryIsBlocked(entry: BoardEntry) {
  if (entry.kind !== "issue") return false
  return entry.item.isBlocked ?? entryBlockers(entry).length > 0
}

function criteriaPct(entry: BoardEntry) {
  if (entry.item.criteriaCount === 0) return 0
  return Math.round((entry.item.criteriaPassed / entry.item.criteriaCount) * 100)
}

function priorityRank(entry: BoardEntry) {
  return PRIORITY_RANK[entry.item.priority] ?? 99
}

function sort(list: BoardEntry[], order: BoardOrder) {
  return list.slice().sort((a, b) => {
    switch (order) {
      case "oldest":
        return a.item.createdAt.localeCompare(b.item.createdAt)
      case "priority":
        return priorityRank(a) - priorityRank(b) || b.item.createdAt.localeCompare(a.item.createdAt)
      case "blocked":
        return (
          Number(entryIsBlocked(b)) - Number(entryIsBlocked(a)) ||
          priorityRank(a) - priorityRank(b) ||
          b.item.createdAt.localeCompare(a.item.createdAt)
        )
      case "ac":
        return criteriaPct(b) - criteriaPct(a) || priorityRank(a) - priorityRank(b)
      case "title":
        return a.item.title.localeCompare(b.item.title) || b.item.createdAt.localeCompare(a.item.createdAt)
      case "newest":
      default:
        return b.item.createdAt.localeCompare(a.item.createdAt)
    }
  })
}

function matchesEntry(entry: BoardEntry, terms: string[]) {
  if (terms.length === 0) return true
  const item = entry.item
  const fields = [
    item.id,
    item.title,
    item.status,
    item.priority,
    item.assignee,
    entryDetail(entry),
    entryBranch(entry),
    ...entryTags(entry),
    ...entryBlockers(entry),
  ]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase())
  return terms.every((term) => fields.some((field) => field.includes(term)))
}

function matchesPlanStep(step: Todo, terms: string[]) {
  if (terms.length === 0) return true
  const fields = [step.content, step.status, step.priority].map((value) => value.toLowerCase())
  return terms.every((term) => fields.some((field) => field.includes(term)))
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function OpTimeline() {
  const trellis = useTrellis()
  const [limit, setLimit] = createSignal(50)
  const [filter, setFilter] = createSignal("")

  onMount(() => {
    void trellis.fetchOps(limit())
  })

  const reload = () => void trellis.fetchOps(limit(), filter() || undefined)

  const ops = createMemo(() => {
    const all = trellis.ops
    return all.slice().reverse()
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <InlineInput
          placeholder="Filter by file..."
          value={filter()}
          onInput={(e: InputEvent) => setFilter((e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && reload()}
          class="flex-1"
        />
        <Button size="small" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={ops().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <div class="text-12-regular">No ops recorded yet</div>
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={ops()}>
              {(op) => (
                <div class="flex items-start gap-3 px-3 py-2 border-b border-border-weaker-base hover:bg-surface-raised-base/50 transition-colors">
                  <TrellisOpBadge kind={op.kind} class="mt-0.5 shrink-0 min-w-0" />
                  <div class="flex-1 min-w-0">
                    <Show when={op.filePath}>
                      <div class="text-11-mono text-text-weak truncate">{op.filePath}</div>
                    </Show>
                    <Show when={op.branchName}>
                      <div class="text-11-mono text-text-info truncate">{op.branchName}</div>
                    </Show>
                    <Show when={op.milestoneMessage}>
                      <div class="text-11-regular text-text-base italic truncate">{op.milestoneMessage}</div>
                    </Show>
                  </div>
                  <div class="shrink-0 text-11-regular text-text-weaker whitespace-nowrap">{timeAgo(op.timestamp)}</div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Decision List
// ---------------------------------------------------------------------------

export function DecisionList() {
  const trellis = useTrellis()
  const [selected, setSelected] = createSignal<TrellisDecision | undefined>()
  const [limit, setLimit] = createSignal(50)

  onMount(() => {
    void trellis.fetchDecisions({ limit: limit() })
  })

  const reload = () => void trellis.fetchDecisions({ limit: limit() })

  const list = createMemo(() => {
    const all = trellis.decisions
    return all.slice().reverse()
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Decision Traces</div>
        <Button size="small" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <Show when={!selected()}>
        <div class="flex-1 overflow-auto">
          <Show
            when={list().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
                <div class="text-12-regular">No decisions recorded yet</div>
              </div>
            }
          >
            <div class="flex flex-col">
              <For each={list()}>
                {(d) => (
                  <button
                    class="flex items-start gap-3 px-3 py-2 border-b border-border-weaker-base hover:bg-surface-raised-base/50 transition-colors text-left w-full"
                    style={decisionStyle()}
                    onClick={() => setSelected(d)}
                  >
                    <div class="mt-0.5 shrink-0">
                      <EntityIcon type="decision" size={16} />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-12-medium text-text-strong">{d.toolName}</div>
                      <Show when={d.context}>
                        <div class="text-11-regular text-text-weak truncate">session: {d.context}</div>
                      </Show>
                      <Show when={d.outputSummary}>
                        <div class="text-11-regular text-text-weaker truncate">{d.outputSummary}</div>
                      </Show>
                    </div>
                    <div class="shrink-0 text-11-regular text-text-weaker whitespace-nowrap">
                      {timeAgo(d.timestamp)}
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={selected()}>
        {(d) => (
          <div class="flex-1 overflow-auto flex flex-col">
            <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
              <IconButton icon="arrow-left" variant="ghost" onClick={() => setSelected(undefined)} />
              <div class="text-12-medium text-text-strong">{d().toolName}</div>
              <div class="flex-1" />
              <div class="text-11-regular text-text-weaker">{timeAgo(d().timestamp)}</div>
            </div>
            <div class="p-3 flex flex-col gap-3">
              <Show when={d().context}>
                <div class="flex flex-col gap-1">
                  <SectionHeader label="Session" size="xs" />
                  <div class="text-12-regular text-text-base">{d().context}</div>
                </div>
              </Show>
              <Show when={d().input}>
                <div class="flex flex-col gap-1">
                  <SectionHeader label="Input" size="xs" />
                  <pre class="text-11-mono text-text-base p-2 rounded bg-background-base border border-border-base overflow-x-auto max-h-48">
                    {JSON.stringify(d().input, null, 2)}
                  </pre>
                </div>
              </Show>
              <Show when={d().outputSummary}>
                <div class="flex flex-col gap-1">
                  <SectionHeader label="Output" size="xs" />
                  <pre class="text-11-mono text-text-base p-2 rounded bg-background-base border border-border-base overflow-x-auto max-h-48">
                    {d().outputSummary}
                  </pre>
                </div>
              </Show>
              <Show when={d().relatedEntities && d().relatedEntities!.length > 0}>
                <div class="flex flex-col gap-1">
                  <SectionHeader label="Related Entities" size="xs" />
                  <div class="flex flex-wrap gap-1">
                    <For each={d().relatedEntities}>
                      {(e) => (
                        <span class="text-11-mono px-1.5 py-0.5 rounded bg-surface-raised-base text-text-info">
                          {e}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
              <Show when={d().custom && Object.keys(d().custom!).length > 0}>
                <div class="flex flex-col gap-1">
                  <SectionHeader label="Metadata" size="xs" />
                  <pre class="text-11-mono text-text-base p-2 rounded bg-background-base border border-border-base overflow-x-auto max-h-32">
                    {JSON.stringify(d().custom, null, 2)}
                  </pre>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Branch Manager
// ---------------------------------------------------------------------------

export function BranchManager() {
  const trellis = useTrellis()
  const [branches, setBranches] = createSignal<TrellisBranch[]>([])
  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const reload = async () => setBranches(await trellis.fetchBranches())

  onMount(reload)

  const submit = async () => {
    const n = name().trim()
    if (!n) return
    setBusy(true)
    try {
      await trellis.createBranch(n)
      setName("")
      setCreating(false)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const doSwitch = async (n: string) => {
    setBusy(true)
    try {
      await trellis.switchBranch(n)
      await reload()
      await trellis.refresh()
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (n: string) => {
    setBusy(true)
    try {
      await trellis.deleteBranch(n)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Branches</div>
        <Button size="small" variant="ghost" onClick={() => setCreating(true)} disabled={creating()}>
          New
        </Button>
        <Button size="small" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <Show when={creating()}>
        <div class="px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
          <InlineInput
            placeholder="Branch name..."
            value={name()}
            onInput={(e: InputEvent) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && submit()}
            class="flex-1"
            autofocus
          />
          <IconButton icon="check-small" variant="ghost" onClick={submit} disabled={!name().trim() || busy()} />
          <IconButton icon="close-small" variant="ghost" onClick={() => setCreating(false)} />
        </div>
      </Show>
      <div class="flex-1 overflow-auto">
        <Show
          when={branches().length > 0}
          fallback={<div class="px-3 py-8 text-center text-12-regular text-text-weaker">No branches</div>}
        >
          <For each={branches()}>
            {(b) => (
              <button
                class="flex items-center gap-3 px-3 py-2 border-b border-border-weaker-base hover:bg-surface-raised-base/50 transition-colors w-full text-left"
                onClick={() => !b.isCurrent && doSwitch(b.name)}
                disabled={busy()}
              >
                <Show when={!b.isCurrent} fallback={<Icon name="check-small" size="small" class="text-icon-success" />}>
                  <EntityIcon type="branch" size={16} />
                </Show>
                <div class="flex-1 min-w-0">
                  <div class={`text-12-medium ${b.isCurrent ? "text-text-strong" : "text-text-base"}`}>{b.name}</div>
                </div>
                <Show when={b.isCurrent}>
                  <span class="text-10-medium uppercase text-text-success">current</span>
                </Show>
                <Show when={!b.isCurrent}>
                  <IconButton
                    icon="close-small"
                    variant="ghost"
                    size="small"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      doDelete(b.name)
                    }}
                    disabled={busy()}
                  />
                </Show>
              </button>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Milestone List
// ---------------------------------------------------------------------------

function MilestoneList() {
  const trellis = useTrellis()
  const [list, setList] = createSignal<TrellisMilestone[]>([])
  const [creating, setCreating] = createSignal(false)
  const [msg, setMsg] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const reload = async () => setList(await trellis.fetchMilestones())

  onMount(reload)

  const submit = async () => {
    const m = msg().trim()
    if (!m) return
    setBusy(true)
    try {
      await trellis.createMilestone(m)
      setMsg("")
      setCreating(false)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Milestones</div>
        <Button size="small" variant="ghost" onClick={() => setCreating(true)} disabled={creating()}>
          New
        </Button>
        <Button size="small" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <Show when={creating()}>
        <div class="px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
          <InlineInput
            placeholder="Milestone message..."
            value={msg()}
            onInput={(e: InputEvent) => setMsg((e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && submit()}
            class="flex-1"
            autofocus
          />
          <IconButton icon="check-small" variant="ghost" onClick={submit} disabled={!msg().trim() || busy()} />
          <IconButton icon="close-small" variant="ghost" onClick={() => setCreating(false)} />
        </div>
      </Show>
      <div class="flex-1 overflow-auto">
        <Show
          when={list().length > 0}
          fallback={<div class="px-3 py-8 text-center text-12-regular text-text-weaker">No milestones</div>}
        >
          <For each={list()}>
            {(m) => (
              <div class="px-3 py-2 border-b border-border-weaker-base flex items-start gap-3">
                <div class="mt-0.5 shrink-0">
                  <EntityIcon type="milestone" size={16} />
                </div>
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                  <div class="text-12-medium text-text-strong">{m.message ?? m.id}</div>
                  <div class="flex items-center gap-2 text-11-regular text-text-weaker">
                    <Show when={m.createdAt}>
                      <span>{timeAgo(m.createdAt!)}</span>
                    </Show>
                    <Show when={m.affectedFiles.length > 0}>
                      <span>{m.affectedFiles.length} files</span>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Idea Garden
// ---------------------------------------------------------------------------

function GardenView() {
  const trellis = useTrellis()
  const [clusters, setClusters] = createSignal<TrellisGardenCluster[]>([])
  const [stats, setStats] = createSignal<TrellisGardenStats | undefined>()
  const [keyword, setKeyword] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const reload = async () => {
    const [c, s] = await Promise.all([
      trellis.fetchGarden({ keyword: keyword() || undefined }),
      trellis.fetchGardenStats(),
    ])
    setClusters(c)
    setStats(s)
  }

  onMount(reload)

  const revive = async (id: string) => {
    setBusy(true)
    try {
      await trellis.reviveCluster(id)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const statusColor: Record<string, string> = {
    abandoned: "text-text-error",
    draft: "text-text-warning",
    revived: "text-text-success",
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <InlineInput
          placeholder="Search ideas..."
          value={keyword()}
          onInput={(e: InputEvent) => setKeyword((e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && reload()}
          class="flex-1"
        />
        <Button size="small" variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      <Show when={stats()}>
        {(s) => (
          <div class="shrink-0 px-3 py-1.5 border-b border-border-weaker-base flex items-center gap-3 text-11-regular text-text-weaker">
            <span>{s().total} clusters</span>
            <span>{s().abandoned} abandoned</span>
            <span>{s().draft} draft</span>
            <span>{s().revived} revived</span>
          </div>
        )}
      </Show>
      <div class="flex-1 overflow-auto">
        <Show
          when={clusters().length > 0}
          fallback={<div class="px-3 py-8 text-center text-12-regular text-text-weaker">No idea clusters found</div>}
        >
          <For each={clusters()}>
            {(c) => (
              <div class="px-3 py-2 border-b border-border-weaker-base flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <span class={`text-10-medium uppercase ${statusColor[c.status] ?? "text-text-weak"}`}>
                    {c.status}
                  </span>
                  <span class="text-10-medium text-text-weaker">{c.detectedBy}</span>
                  <div class="flex-1" />
                  <span class="text-11-regular text-text-weaker">{c.opCount} ops</span>
                </div>
                <div class="text-12-medium text-text-strong">{c.estimatedIntent}</div>
                <div class="flex items-center gap-2 text-11-regular text-text-weaker">
                  <span>{c.affectedFiles.length} files</span>
                  <span>{timeAgo(c.abandonedAt)}</span>
                </div>
                <Show when={c.affectedFiles.length > 0}>
                  <div class="flex flex-wrap gap-1">
                    <For each={c.affectedFiles.slice(0, 5)}>
                      {(f) => (
                        <span class="text-10-mono px-1 py-0.5 rounded bg-surface-raised-base text-text-weak truncate max-w-48">
                          {f}
                        </span>
                      )}
                    </For>
                    <Show when={c.affectedFiles.length > 5}>
                      <span class="text-10-regular text-text-weaker">+{c.affectedFiles.length - 5} more</span>
                    </Show>
                  </div>
                </Show>
                <Show when={c.status === "abandoned"}>
                  <Button size="small" variant="ghost" onClick={() => revive(c.id)} disabled={busy()}>
                    Revive
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dogfood Indicator
// ---------------------------------------------------------------------------

function DogfoodIndicator() {
  const trellis = useTrellis()
  const [status, setStatus] = createSignal<TrellisDogfood | undefined>()

  onMount(async () => {
    try {
      setStatus(await trellis.fetchDogfood())
    } catch {
      // not available
    }
  })

  return (
    <Show when={status()?.active || false}>
      <button
        class="flex items-center gap-1 px-2 py-0.5 rounded-full text-10-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
        title={`Dogfood mode active — ${status()!.created.length} issues created`}
        onClick={async () => {
          const result = await trellis.triggerDogfood()
          if (result) setStatus(result)
        }}
      >
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Dogfood
      </button>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// Trellis Panel (sub-tabbed wrapper)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

// SimNode / SimLink / GraphCallbacks / LayoutPersistence live in `./graph-shared`
// so both the SVG (renderSvg) and Canvas2D (renderCanvas) renderers agree on
// shape. Keep the legacy SimLink alias for internal use only.
type SimLink = { source: SimNode; target: SimNode; type: TrellisGraphEdge["type"] }

// Entity color + icon maps are imported from `@/lib/entity-theme` (single source of truth).

// Cardinality notation per edge type: [source, target]
// "1" = one (bar), "*" = many (crow's foot), "0..1" = zero-or-one (circle+bar), "1..*" = one-or-more (bar+fork)
const EDGE_CARDINALITY: Record<string, [string, string]> = {
  contains: ["1", "*"],
  assigns: ["1", "1"],
  blocks: ["1", "1"],
  remembers: ["1", "*"],
  tracks: ["1", "*"],
  parent: ["1", "*"],
  imports: ["*", "*"],
  links: ["*", "*"],
}

// Draw crow's foot cardinality marker at a point along an edge
// angle: radians pointing from the marker toward the opposite node
function drawCardinality(
  parent: d3Select.Selection<SVGGElement, unknown, null, undefined>,
  card: string,
  x: number,
  y: number,
  angle: number,
) {
  const sz = 6
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // perpendicular
  const px = -sin
  const py = cos

  if (card === "1") {
    // single bar ⊣
    parent
      .append("line")
      .attr("x1", x + px * sz)
      .attr("y1", y + py * sz)
      .attr("x2", x - px * sz)
      .attr("y2", y - py * sz)
      .attr("stroke", "var(--text-weaker)")
      .attr("stroke-width", 1.2)
  } else if (card === "*") {
    // crow's foot (three lines fanning out)
    for (const offset of [-1, 0, 1]) {
      parent
        .append("line")
        .attr("x1", x)
        .attr("y1", y)
        .attr("x2", x + cos * sz * 1.2 + px * sz * offset * 0.7)
        .attr("y2", y + sin * sz * 1.2 + py * sz * offset * 0.7)
        .attr("stroke", "var(--text-weaker)")
        .attr("stroke-width", 1.2)
    }
  } else if (card === "0..1") {
    // circle + bar
    parent
      .append("circle")
      .attr("cx", x + cos * sz)
      .attr("cy", y + sin * sz)
      .attr("r", 3)
      .attr("fill", "none")
      .attr("stroke", "var(--text-weaker)")
      .attr("stroke-width", 1.2)
    parent
      .append("line")
      .attr("x1", x + px * sz)
      .attr("y1", y + py * sz)
      .attr("x2", x - px * sz)
      .attr("y2", y - py * sz)
      .attr("stroke", "var(--text-weaker)")
      .attr("stroke-width", 1.2)
  } else if (card === "1..*") {
    // bar + crow's foot
    parent
      .append("line")
      .attr("x1", x + px * sz)
      .attr("y1", y + py * sz)
      .attr("x2", x - px * sz)
      .attr("y2", y - py * sz)
      .attr("stroke", "var(--text-weaker)")
      .attr("stroke-width", 1.2)
    const forkBase = { x: x + cos * sz, y: y + sin * sz }
    for (const offset of [-1, 0, 1]) {
      parent
        .append("line")
        .attr("x1", forkBase.x)
        .attr("y1", forkBase.y)
        .attr("x2", forkBase.x + cos * sz * 0.8 + px * sz * offset * 0.7)
        .attr("y2", forkBase.y + sin * sz * 0.8 + py * sz * offset * 0.7)
        .attr("stroke", "var(--text-weaker)")
        .attr("stroke-width", 1.2)
    }
  }
}

// ---------------------------------------------------------------------------
// GraphView — force-directed entity graph (TRL-19)
// ---------------------------------------------------------------------------

export const FILTER_TYPES = [
  "issue",
  "agent",
  "project",
  "memory",
  "mcp",
  "sprite",
  "workunit",
  "cycle",
  "epic",
  "roadmap",
  "suggestion",
  "whiteboard",
  "file",
  "directory",
  "op",
] as const

const GRAPH = {
  label: 900,
  edge: 250,
  card: 150,
  icon: 20000,
  dense: 1500,
  pad: 140,
} as const

const PHYSICS_KEY = "trellis:graph-physics"
function loadPhysics(): Physics {
  try {
    const raw = localStorage.getItem(PHYSICS_KEY)
    if (!raw) return DEFAULT_PHYSICS
    const p = JSON.parse(raw) as Partial<Physics>
    return {
      dist: clampMul(p.dist ?? 1.5),
      charge: clampMul(p.charge ?? 1.5),
      collide: clampMul(p.collide ?? 1),
      decay: clampMul(p.decay ?? 1),
    }
  } catch {
    return DEFAULT_PHYSICS
  }
}
function savePhysics(p: Physics) {
  try {
    localStorage.setItem(PHYSICS_KEY, JSON.stringify(p))
  } catch {}
}
function clampMul(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(0.25, Math.min(4, n))
}

function cfg(size: number) {
  return {
    label: size <= GRAPH.label,
    edge: size <= GRAPH.edge,
    card: size <= GRAPH.card,
    icon: size <= GRAPH.icon,
    dense: size >= GRAPH.dense,
    dist: size > 2200 ? 45 : size > 1200 ? 60 : 90,
    charge: size > 2200 ? -90 : size > 1200 ? -130 : -250,
    collide: size > 2200 ? 11 : size > 1200 ? 15 : 22,
    decay: (size > 2200 ? 0.09 : size > 1200 ? 0.07 : 0.05) * GRAPH_SIM_DECAY_MUL,
    link: size > 2200 ? 0.2 : size > 1200 ? 0.3 : 0.5,
  }
}

function bounds(t: d3Zoom.ZoomTransform, width: number, height: number) {
  // Scale padding inversely with zoom so culling boundaries expand when zoomed out
  const pad = GRAPH.pad / Math.min(1, t.k)
  return {
    left: (-t.x - pad) / t.k,
    top: (-t.y - pad) / t.k,
    right: (width - t.x + pad) / t.k,
    bottom: (height - t.y + pad) / t.k,
  }
}

function visible(n: SimNode, box: ReturnType<typeof bounds>) {
  const x = n.x ?? 0
  const y = n.y ?? 0
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

function visibleLink(l: d3Force.SimulationLinkDatum<SimNode>, box: ReturnType<typeof bounds>) {
  const s = l.source as SimNode
  const t = l.target as SimNode
  const sx = s.x ?? 0
  const sy = s.y ?? 0
  const tx = t.x ?? 0
  const ty = t.y ?? 0
  return (
    Math.max(sx, tx) >= box.left &&
    Math.min(sx, tx) <= box.right &&
    Math.max(sy, ty) >= box.top &&
    Math.min(sy, ty) <= box.bottom
  )
}

export type GraphFetchOptions = {
  includeHidden: boolean
  includeImports: boolean
  includeLinks: boolean
  includeOps: boolean
}

export function GraphView(
  props: {
    hideSidebar?: boolean
    scopedTypes?: string[]
    hideEmpty?: boolean
    onHideEmptyChange?: (next: boolean) => void
    options?: GraphFetchOptions
    onOptionsChange?: (next: GraphFetchOptions) => void
    themes?: Record<string, EntityTheme>
    revision?: number
    highlightIds?: string[]
  } = {},
) {
  const trellis = useTrellis()
  const sdk = useSDK()
  const scopedSet = () => (props.scopedTypes ? new Set(props.scopedTypes) : null)
  // Sidebar widths with localStorage persistence
  const storageKey = `graph-sidebar-widths-${sdk.directory}`
  const savedWidths = () => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }
  const [leftWidth, setLeftWidth] = createSignal(savedWidths()?.left ?? 224)
  const [rightWidth, setRightWidth] = createSignal(savedWidths()?.right ?? 360)
  createEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ left: leftWidth(), right: rightWidth() }))
  })
  // Responsive clamp: never let the preview drawer eat more than ~half the viewport.
  const maxRightWidth = () => {
    if (typeof window === "undefined") return 720
    return Math.max(320, Math.min(720, Math.floor(window.innerWidth * 0.5)))
  }
  const clampRight = () => {
    const max = maxRightWidth()
    if (rightWidth() > max) setRightWidth(max)
  }
  onMount(() => {
    if (typeof window === "undefined") return
    clampRight()
    window.addEventListener("resize", clampRight)
    onCleanup(() => window.removeEventListener("resize", clampRight))
  })
  // Hidden files on by default — the backend filters are now fast enough to
  // handle it and most users want to see their full project tree.
  const [internalHidden, setInternalHidden] = createSignal(true)
  const [internalImports, setInternalImports] = createSignal(true)
  const [internalLinks, setInternalLinks] = createSignal(true)
  // Ops are the causal stream; on by default so the graph shows VCS history.
  // Users can toggle off in the physics panel when the graph gets too dense.
  const [internalOps, setInternalOps] = createSignal(true)
  const [internalHideEmpty, setInternalHideEmpty] = createSignal(loadHideEmpty())
  const hideEmpty = () => props.hideEmpty ?? internalHideEmpty()
  const setHideEmpty = (next: boolean) => {
    if (props.onHideEmptyChange) props.onHideEmptyChange(next)
    else setInternalHideEmpty(next)
    saveHideEmpty(next)
  }
  const includeHidden = () => props.options?.includeHidden ?? internalHidden()
  const includeImports = () => props.options?.includeImports ?? internalImports()
  const includeLinks = () => props.options?.includeLinks ?? internalLinks()
  const includeOps = () => props.options?.includeOps ?? internalOps()
  const updateOption = (key: keyof GraphFetchOptions, value: boolean) => {
    if (props.options && props.onOptionsChange) {
      props.onOptionsChange({ ...props.options, [key]: value })
      return
    }
    if (key === "includeHidden") setInternalHidden(value)
    if (key === "includeImports") setInternalImports(value)
    if (key === "includeLinks") setInternalLinks(value)
    if (key === "includeOps") setInternalOps(value)
  }
  const [physics, setPhysics] = createSignal<Physics>(loadPhysics())
  const [beaconChromeDim, setBeaconChromeDim] = createSignal(false)
  const [autoRecenterPending, setAutoRecenterPending] = createSignal(true)
  onMount(() => setAutoRecenterPending(true))

  // Background loading state
  const [graphData, setGraphData] = createSignal<any>(undefined)
  const [isLoading, setIsLoading] = createSignal(false)
  const [loadingError, setLoadingError] = createSignal<string | null>(null)
  let abortController: AbortController | null = null
  let loadingRequestId = 0
  let loadDebounce: ReturnType<typeof setTimeout> | null = null

  // Background graph loading with cancellation support
  const loadGraph = async () => {
    // Use preloaded data immediately if available
    if (graphPreload.data) {
      setGraphData(graphPreload.data)
      setIsLoading(false)
      invalidatePreload() // clear so next revision change fetches fresh
      return
    }

    const id = ++loadingRequestId
    if (abortController) {
      abortController.abort()
      abortController = null
    }

    setIsLoading(true)
    setLoadingError(null)
    abortController = new AbortController()

    const result = await trellis
      .fetchGraph({
        includeHidden: includeHidden(),
        includeImports: includeImports(),
        includeLinks: includeLinks(),
        includeOps: includeOps(),
      })
      .catch((err: unknown) => {
        if (id === loadingRequestId && !abortController?.signal.aborted) {
          setLoadingError(err instanceof Error ? err.message : "Failed to load graph")
          setGraphData(undefined)
        }
        return null
      })

    if (result && id === loadingRequestId && !abortController?.signal.aborted) {
      setGraphData(result)
      setLoadingError(null)
    }
    if (id === loadingRequestId) {
      setIsLoading(false)
      abortController = null
    }
  }

  // Trigger graph loading when dependencies change, debounced so rapid
  // revision bumps (store + trellis updating in the same tick) coalesce.
  createEffect(() => {
    void [trellis.revision, includeHidden(), includeImports(), includeLinks(), includeOps(), props.revision ?? 0]
    if (loadDebounce) clearTimeout(loadDebounce)
    loadDebounce = setTimeout(() => {
      loadDebounce = null
      void loadGraph()
    }, 150)
  })

  // Cleanup on unmount
  onCleanup(() => {
    if (loadDebounce) {
      clearTimeout(loadDebounce)
      loadDebounce = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  })

  const graph = () => graphData()
  const initialFilters = props.scopedTypes
    ? new Set(props.scopedTypes)
    : new Set([
        "issue",
        "agent",
        "project",
        "memory",
        "mcp",
        "sprite",
        "workunit",
        "cycle",
        "epic",
        "roadmap",
        "suggestion",
        "whiteboard",
        "file",
        "directory",
        "op",
      ])
  const [activeFilters, setActiveFilters] = createSignal<Set<string>>(initialFilters)
  const seenTypes = new Set<string>(props.scopedTypes ?? FILTER_TYPES)
  const highlightSet = createMemo(() => new Set(props.highlightIds ?? []))
  const [selected, setSelected] = createSignal<SimNode | null>(null)
  // Back/forward history of visited node IDs so the user can traverse the
  // graph through entity links and backtrack, browser-style.
  const [history, setHistory] = createStore<{ back: string[]; forward: string[] }>({ back: [], forward: [] })
  let svgRef: SVGSVGElement | undefined
  let graphApi: ReturnType<typeof renderForceGraph> | undefined

  // Resolve an id to a node from the current graph data.
  const nodeById = (id: string): SimNode | null => {
    const data = graph()
    if (!data) return null
    return (data.nodes.find((n: any) => n.id === id) as SimNode | undefined) ?? null
  }

  // Select a node and record the previous selection on the back stack. Any
  // forward history is invalidated because a new branch is being taken.
  const navigateTo = (id: string) => {
    const target = nodeById(id)
    if (!target) return
    const current = selected()?.id
    if (current === id) return
    batch(() => {
      if (current) setHistory("back", (b) => [...b, current])
      setHistory("forward", [])
      setSelected(target)
    })
  }

  const goBack = () => {
    const b = history.back
    if (b.length === 0) return
    const prevId = b[b.length - 1]
    const target = nodeById(prevId)
    if (!target) {
      // Stale id — drop it and try again.
      setHistory("back", (s) => s.slice(0, -1))
      goBack()
      return
    }
    const current = selected()?.id
    batch(() => {
      setHistory("back", (s) => s.slice(0, -1))
      if (current) setHistory("forward", (f) => [...f, current])
      setSelected(target)
    })
  }

  const goForward = () => {
    const f = history.forward
    if (f.length === 0) return
    const nextId = f[f.length - 1]
    const target = nodeById(nextId)
    if (!target) {
      setHistory("forward", (s) => s.slice(0, -1))
      goForward()
      return
    }
    const current = selected()?.id
    batch(() => {
      setHistory("forward", (s) => s.slice(0, -1))
      if (current) setHistory("back", (b) => [...b, current])
      setSelected(target)
    })
  }

  const typeCounts = createMemo(() => {
    const data = graph()
    if (!data) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    for (const n of data.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1
    }
    return counts
  })
  const graphTypes = createMemo(() => {
    const counts = typeCounts()
    return [...new Set([...FILTER_TYPES, ...Object.keys(counts)])].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  })

  createEffect(() => {
    const scope = props.scopedTypes
    if (!scope) return
    setActiveFilters(new Set(scope))
    batch(() => {
      setSelected(null)
      setHistory({ back: [], forward: [] })
    })
  })

  createEffect(() => {
    if (props.scopedTypes) return
    const fresh = graphTypes().filter((type) => !seenTypes.has(type))
    if (fresh.length === 0) return
    fresh.forEach((type) => seenTypes.add(type))
    setActiveFilters((prev) => new Set([...prev, ...fresh]))
  })

  // Process graph data asynchronously for large graphs to keep UI responsive
  let graphRaf: number | null = null
  createEffect(() => {
    const data = graph()
    if (!data || !svgRef) return

    // Cancel any pending graph render
    if (graphRaf) cancelAnimationFrame(graphRaf)

    const themes = props.themes
    const fresh = highlightSet()
    const active = activeFilters()

    // For large graphs, defer processing to next frame so loading spinner can paint
    const processGraph = () => {
      graphRaf = null

      const filteredNodes: SimNode[] = data.nodes
        .filter((n: any) => active.has(n.type))
        .map((n: any) => {
          const theme = themes?.[n.type] ?? themes?.[n.type.toLowerCase()]
          if (!theme) return { ...n, fresh: fresh.has(n.id) }
          return { ...n, color: theme.color, icon: theme.icon, fresh: fresh.has(n.id) }
        })

      const nodeIds = new Set(filteredNodes.map((n: any) => n.id))
      const filteredLinks = data.edges
        .filter((e: any) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))
        .map((e: any) => ({ ...e }))

      // Persist layout per workspace directory. Scoping by directory means each
      // project keeps its own arrangement and switching projects doesn't trash it.
      const saver = createLayoutSaver(sdk.directory)
      graphApi = renderForceGraph(
        svgRef,
        filteredNodes,
        filteredLinks,
        {
          onSelect: (node) => {
            // Route graph-node clicks through history so backtracking works even
            // when you jump between nodes by clicking on the canvas.
            navigateTo(node.id)
          },
          onDeselect: () => {
            batch(() => {
              setSelected(null)
              setHistory({ back: [], forward: [] })
            })
          },
          getSelectedId: () => selected()?.id ?? null,
          inset: () => (selected() ? rightWidth() + 32 : 0),
          layout: {
            load: () => loadLayout(sdk.directory),
            save: saver.save,
            flush: saver.flush,
          },
          onBeaconChromeDim: setBeaconChromeDim,
        },
        untrack(physics),
      )
      if (props.scopedTypes) requestAnimationFrame(() => graphApi?.fit())
    }

    graphRaf = requestAnimationFrame(processGraph)

    onCleanup(() => {
      if (graphRaf) {
        cancelAnimationFrame(graphRaf)
        graphRaf = null
      }
      graphApi?.stop()
      graphApi = undefined
      setBeaconChromeDim(false)
    })
  })

  // Live physics updates — reheat sim without rebuilding the graph.
  createEffect(() => {
    const p = physics()
    savePhysics(p)
    graphApi?.setPhysics(p)
  })

  // Keep the renderer's selection highlight in sync with external changes.
  // Defer by a frame so the drawer's CSS slide-in gets to paint before we
  // kick off the graph's own zoom animation — otherwise a heavy refresh
  // competes with the drawer transition and the viewport briefly blarcht.
  createEffect(() => {
    const id = selected()?.id ?? null
    const api = graphApi
    if (!api) return
    requestAnimationFrame(() => api.focus(id))
  })

  // When returning to Graph view, fly back to the node cloud if the saved
  // viewport is off-screen (same as clicking the return beacon).
  createEffect(() => {
    if (!autoRecenterPending()) return
    const api = graphApi
    if (!api || !graph()) return
    setAutoRecenterPending(false)
    requestAnimationFrame(() => api.goToNodesIfOffscreen())
  })

  // External selection requests (e.g. agent file edits routing the user to
  // graph view). We wait until graph data is loaded and the requested node
  // exists in the current filtered set before consuming the request — that
  // way a switch from code → graph view doesn't drop the request mid-flight.
  createEffect(() => {
    const pending = graphNav.pending()
    if (!pending) return
    const data = graph()
    if (!data) return
    const target = nodeById(pending)
    if (!target) return
    if (!activeFilters().has(target.type)) {
      // Make sure the requested node's type is visible — otherwise the
      // selection would highlight a hidden node.
      setActiveFilters((prev) => new Set([...prev, target.type]))
    }
    navigateTo(pending)
    graphNav.clear()
  })

  const allActive = createMemo(() => graphTypes().length > 0 && graphTypes().every((type) => activeFilters().has(type)))
  const toggleAll = () => {
    setActiveFilters(() => (allActive() ? new Set<string>() : new Set<string>(graphTypes())))
  }

  // Hide the left filter rail while the preview drawer is open so the graph
  // keeps as much horizontal real estate as possible.
  const previewOpen = () => selected() !== null

  // Total horizontal footprint of the left rail (sidebar + its resize
  // handle). Handle pixel count stays aligned with @opencode-ai/ui's
  // ResizeHandle width.
  const HANDLE_WIDTH = 4
  const leftSlot = () => leftWidth() + HANDLE_WIDTH

  return (
    <div class="flex w-full h-full bg-background-base overflow-hidden">
      {/* Left sidebar: type filters. Stays mounted so the preview open/close
          transition slides the panel in/out smoothly — the outer wrapper
          animates its width (layout collapse) while the inner rail holds its
          intrinsic width and fades out to keep the sliding clipping crisp. */}
      <Show when={!props.hideSidebar}>
        <div
          class="shrink-0 overflow-hidden relative"
          style={{
            width: previewOpen() ? "0px" : `${leftSlot()}px`,
            transition: "width 420ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          aria-hidden={previewOpen()}
        >
          <div
            class="flex h-full absolute top-0 left-0 bottom-0"
            style={{
              width: `${leftSlot()}px`,
              opacity: previewOpen() ? 0 : 1,
              "will-change": "opacity",
              transition: "opacity 220ms ease-out",
            }}
          >
            <GraphFilterSidebar
              width={leftWidth()}
              types={graphTypes()}
              counts={typeCounts()}
              total={graph()?.nodes.length}
              active={activeFilters()}
              allActive={allActive()}
              hideEmpty={hideEmpty()}
              onToggle={(type) =>
                setActiveFilters((prev) => {
                  const next = new Set(prev)
                  if (next.has(type)) next.delete(type)
                  else next.add(type)
                  return next
                })
              }
              onToggleAll={toggleAll}
              themes={props.themes}
            />

            {/* Left resize handle */}
            <div class="relative" onPointerDown={(e) => e.stopPropagation()} inert={previewOpen() || undefined}>
              <ResizeHandle
                direction="horizontal"
                size={leftWidth()}
                min={180}
                max={400}
                onResize={(width) => setLeftWidth(width)}
              />
            </div>
          </div>
        </div>
      </Show>

      {/* Graph surface */}
      <div class="relative flex-1 h-full overflow-hidden">
        <Show when={!isLoading() && graph()}>
          <FloatingPhysicsPanel
            physics={physics()}
            onPhysicsChange={setPhysics}
            onPhysicsReset={() => setPhysics(DEFAULT_PHYSICS)}
            hideEmpty={hideEmpty()}
            onHideEmptyChange={() => setHideEmpty(!hideEmpty())}
            includeHidden={includeHidden()}
            includeImports={includeImports()}
            includeLinks={includeLinks()}
            includeOps={includeOps()}
            onToggleHidden={() => updateOption("includeHidden", !includeHidden())}
            onToggleImports={() => updateOption("includeImports", !includeImports())}
            onToggleLinks={() => updateOption("includeLinks", !includeLinks())}
            onToggleOps={() => updateOption("includeOps", !includeOps())}
            chromeDimmed={beaconChromeDim()}
          />
        </Show>

        <svg ref={svgRef!} class="w-full h-full" style="touch-action: none;" />

        {/* Loading state */}
        <Show when={isLoading()}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Spinner />
            <span class="text-12-regular text-text-weak">Loading graph</span>
          </div>
        </Show>

        {/* Error state */}
        <Show when={loadingError()}>
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="max-w-sm px-6 py-4 text-center pointer-events-auto">
              <div class="text-13-medium text-text-weak mb-1">Error loading graph</div>
              <div class="text-11-regular text-text-weaker mb-3">{loadingError()}</div>
              <button
                class="px-3 py-1 text-11-medium bg-surface-raised-base border border-border-base rounded hover:bg-surface-raised-hover transition-colors"
                onClick={() => loadGraph()}
              >
                Retry
              </button>
            </div>
          </div>
        </Show>

        {/* Empty state — shown when the backend has no /trellis/graph route
            (e.g. running against stock opencode-ai without the trellis fork) */}
        <Show when={!isLoading() && !loadingError() && graph()?.nodes.length === 0}>
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="max-w-sm px-6 py-4 text-center pointer-events-auto">
              <div class="text-13-medium text-text-weak mb-1">No graph data</div>
              <div class="text-11-regular text-text-weaker">
                Either this project has no tracked entities yet, or the backend is missing the trellis routes.
              </div>
            </div>
          </div>
        </Show>

        {/* Right-side detail drawer */}
        <GraphDetailDrawer
          width={rightWidth()}
          maxWidth={maxRightWidth()}
          onResize={(w) => setRightWidth(Math.min(w, maxRightWidth()))}
          node={selected()}
          canBack={history.back.length > 0}
          canForward={history.forward.length > 0}
          onBack={goBack}
          onForward={goForward}
          onClose={() => {
            const inset = rightWidth() + 32
            batch(() => {
              setSelected(null)
              setHistory({ back: [], forward: [] })
            })
            graphApi?.recenter(inset)
            graphApi?.focus(null)
          }}
          onNavigate={(id) => navigateTo(id)}
          onHover={(id) => graphApi?.setHoveredId(id)}
        />
      </div>
    </div>
  )
}

function FloatingPhysicsPanel(props: {
  physics: Physics
  onPhysicsChange: (p: Physics) => void
  onPhysicsReset: () => void
  hideEmpty: boolean
  onHideEmptyChange: () => void
  includeHidden: boolean
  includeImports: boolean
  includeLinks: boolean
  includeOps: boolean
  onToggleHidden: () => void
  onToggleImports: () => void
  onToggleLinks: () => void
  onToggleOps: () => void
  chromeDimmed?: boolean
}) {
  const [open, setOpen] = createSignal(false)
  const mobile = createMediaQuery("(max-width: 767px)")
  const panelW = () => (mobile() ? GRAPH_MINIMAP_W_MOBILE : GRAPH_MINIMAP_W)
  return (
    <div
      class="absolute z-20 rounded-md border border-border-base shadow-lg"
      style={{
        bottom: "144px",
        left: "12px",
        width: `${panelW()}px`,
        background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
        opacity: props.chromeDimmed ? 0.12 : 1,
        "pointer-events": props.chromeDimmed ? "none" : "auto",
        transition: "opacity 180ms ease-out",
      }}
    >
      <div class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-weaker-base">
        <button
          class="flex items-center gap-1.5 text-10-medium uppercase tracking-wide text-text-weaker hover:text-text-base transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open()}
        >
          <Icon
            name="chevron-right"
            size="small"
            class="text-icon-weak transition-transform"
            style={{ transform: open() ? "rotate(90deg)" : "rotate(0deg)" }}
          />
          Graph
        </button>
        <button
          class="text-10-medium uppercase tracking-wide text-text-weaker hover:text-text-base transition-colors"
          onClick={props.onPhysicsReset}
          title="Reset all physics multipliers to 1×"
        >
          Reset
        </button>
      </div>
      <Show when={open()}>
        <div class="py-1">
          <GraphToggleRow
            icon={<Icon name="eye-off" size="small" class="text-icon-weak" />}
            label="Hide empty"
            active={props.hideEmpty}
            onClick={props.onHideEmptyChange}
            title="Hide entity types with no records"
          />
          <GraphToggleRow
            icon={<Icon name="eye" size="small" class="text-icon-weak" />}
            label="Hidden files"
            active={props.includeHidden}
            onClick={props.onToggleHidden}
            title="Include dotfiles and gitignored paths"
          />
          <GraphToggleRow
            icon={<Icon name="link" size="small" class="text-icon-weak" />}
            label="Import edges"
            active={props.includeImports}
            onClick={props.onToggleImports}
            title="Edges from imports / requires / @import"
          />
          <GraphToggleRow
            icon={<Icon name="file-text" size="small" class="text-icon-weak" />}
            label="Link edges"
            active={props.includeLinks}
            onClick={props.onToggleLinks}
            title="Edges from markdown and wiki-links"
          />
          <GraphToggleRow
            icon={<EntityIcon type="op" size={14} color={props.includeOps ? ENTITY_COLORS.op : "var(--text-weaker)"} />}
            label="Ops"
            active={props.includeOps}
            onClick={props.onToggleOps}
            title="Include recent causal-stream ops"
          />
          <div class="mx-2.5 my-1 border-t border-border-weaker-base" />
          <PhysicsSlider
            label="Distance"
            value={props.physics.dist}
            onInput={(v) => props.onPhysicsChange({ ...props.physics, dist: v })}
          />
          <PhysicsSlider
            label="Repulsion"
            value={props.physics.charge}
            onInput={(v) => props.onPhysicsChange({ ...props.physics, charge: v })}
          />
          <PhysicsSlider
            label="Collision"
            value={props.physics.collide}
            onInput={(v) => props.onPhysicsChange({ ...props.physics, collide: v })}
          />
          <PhysicsSlider
            label="Decay"
            value={props.physics.decay}
            onInput={(v) => props.onPhysicsChange({ ...props.physics, decay: v })}
          />
        </div>
      </Show>
    </div>
  )
}

function GraphToggleRow(props: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-12-medium transition-colors"
      classList={{
        "text-text-strong": props.active,
        "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": !props.active,
      }}
      onClick={props.onClick}
      aria-pressed={props.active}
      title={props.title}
    >
      {props.icon}
      <span class="flex-1 truncate">{props.label}</span>
      <span
        class="size-1.5 shrink-0 rounded-full transition-colors"
        classList={{
          "bg-text-strong": props.active,
          "bg-border-base": !props.active,
        }}
      />
    </button>
  )
}

function GraphFilterSidebar(props: {
  types: string[]
  counts: Record<string, number>
  active: Set<string>
  allActive: boolean
  hideEmpty: boolean
  onToggle: (type: string) => void
  onToggleAll: () => void
  width: number
  themes?: Record<string, EntityTheme>
  total?: number
}) {
  const SYSTEM_SET = new Set<string>(FILTER_TYPES)
  const visible = (type: string) => !props.hideEmpty || (props.counts[type] ?? 0) > 0 || props.active.has(type)
  const systemTypes = () => props.types.filter((t) => SYSTEM_SET.has(t) && visible(t))
  const customTypes = () => props.types.filter((t) => !SYSTEM_SET.has(t) && visible(t))
  const total = () => props.total ?? props.types.reduce((sum, type) => sum + (props.counts[type] ?? 0), 0)

  const [open, setOpen] = createSignal(loadSidebarSections())
  const toggleSection = (k: SidebarSection) => {
    setOpen((prev) => {
      const next = { ...prev, [k]: !prev[k] }
      saveSidebarSections(next)
      return next
    })
  }

  return (
    <RouteSidebar width={props.width} title="Entities" meta={String(total())}>
      <SidebarSectionHeader
        label="System entities"
        open={open().system}
        onToggle={() => toggleSection("system")}
        rightAction={{ label: props.allActive ? "None" : "All", onClick: props.onToggleAll }}
        spaced
      />
      <Show when={open().system}>
        <SidebarTree>
          <For each={systemTypes()}>
            {(type) => (
              <EntityFilterButton
                type={type}
                active={props.active.has(type)}
                count={props.counts[type] ?? 0}
                onClick={() => props.onToggle(type)}
                theme={props.themes?.[type] ?? props.themes?.[type.toLowerCase()]}
              />
            )}
          </For>
        </SidebarTree>
      </Show>

      <SidebarSectionHeader
        label="Custom entities"
        open={open().custom}
        onToggle={() => toggleSection("custom")}
        spaced
      />
      <Show when={open().custom}>
        <SidebarTree>
          <Show
            when={customTypes().length > 0}
            fallback={<div class="pl-4 pr-2.5 py-2 text-11-regular text-text-weaker italic">No custom entities</div>}
          >
            <For each={customTypes()}>
              {(type) => (
                <EntityFilterButton
                  type={type}
                  active={props.active.has(type)}
                  count={props.counts[type] ?? 0}
                  onClick={() => props.onToggle(type)}
                />
              )}
            </For>
          </Show>
        </SidebarTree>
      </Show>
    </RouteSidebar>
  )
}

type SidebarSection = "system" | "custom"
const SIDEBAR_SECTIONS_KEY = "trellis:sidebar-sections"
const DEFAULT_SECTIONS: Record<SidebarSection, boolean> = {
  system: true,
  custom: true,
}
function loadSidebarSections(): Record<SidebarSection, boolean> {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_KEY)
    if (!raw) return DEFAULT_SECTIONS
    const p = JSON.parse(raw) as Partial<Record<SidebarSection, boolean>>
    return { ...DEFAULT_SECTIONS, ...p }
  } catch {
    return DEFAULT_SECTIONS
  }
}
function saveSidebarSections(s: Record<SidebarSection, boolean>) {
  try {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(s))
  } catch {}
}

function SidebarSectionHeader(props: {
  label: string
  open: boolean
  onToggle: () => void
  rightAction?: { label: string; onClick: () => void; title?: string }
  spaced?: boolean
}) {
  return (
    <div class="px-2 pb-1.5 flex items-center justify-between" classList={{ "mt-4": !!props.spaced }}>
      <button
        class="flex items-center gap-1.5 text-10-medium uppercase tracking-wide text-text-weaker hover:text-text-base transition-colors"
        onClick={props.onToggle}
        aria-expanded={props.open}
      >
        <Icon
          name="chevron-right"
          size="small"
          class="text-icon-weak transition-transform"
          style={{ transform: props.open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <span>{props.label}</span>
      </button>
      <Show when={props.rightAction}>
        {(action) => (
          <button
            class="text-10-medium uppercase tracking-wide text-text-weaker hover:text-text-base transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              action().onClick()
            }}
            title={action().title}
          >
            {action().label}
          </button>
        )}
      </Show>
    </div>
  )
}

function EntityFilterButton(props: {
  type: string
  active: boolean
  count: number
  onClick: () => void
  theme?: EntityTheme
}) {
  const color = () => props.theme?.color ?? entityColor(props.type)
  const icon = () => props.theme?.icon
  return (
    <button
      class="w-full flex items-center gap-2 pl-4 pr-2.5 py-2 rounded-md text-left text-12-medium transition-all group"
      classList={{
        "text-text-strong bg-surface-raised-base/50": props.active,
        "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": !props.active,
      }}
      onClick={props.onClick}
      aria-pressed={props.active}
    >
      <EntityIcon type={props.type} size={14} color={color()} icon={icon()} />
      <span class="flex-1 truncate">{props.theme?.label ?? entityTypeLabel(props.type)}</span>
      <span class="text-11-regular text-text-weaker tabular-nums opacity-45 group-hover:opacity-60 transition-opacity">
        {props.count}
      </span>
      <span
        class="size-1.5 shrink-0 rounded-full transition-colors"
        classList={{
          "bg-text-strong": props.active,
          "bg-border-base": !props.active,
        }}
      />
    </button>
  )
}

function PhysicsSlider(props: { label: string; value: number; onInput: (v: number) => void }) {
  return (
    <div class="px-2.5 py-1">
      <div class="flex items-center justify-between text-12-medium text-text-weak">
        <span>{props.label}</span>
        <span class="text-10-regular tabular-nums text-text-weaker">{props.value.toFixed(2)}×</span>
      </div>
      <input
        type="range"
        min="0.25"
        max="4"
        step="0.05"
        value={props.value}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
        class="w-full h-1 mt-1 accent-text-strong"
      />
    </div>
  )
}

function GraphDetailDrawer(props: {
  node: SimNode | null
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onClose: () => void
  onNavigate: (id: string, namespace?: string) => void
  onHover: (id: string | null) => void
  width: number
  maxWidth: number
  onResize: (w: number) => void
}) {
  // Keep the previously rendered node alive through the slide-out transition
  // so the contents don't blip off the moment the user closes the drawer.
  // We mirror props.node into `held`, but only clear it after the drawer's
  // transform animation has finished — `props.node` itself still drives the
  // transform/opacity so the latest state always wins on reopen.
  const SLIDE_MS = 560
  const [held, setHeld] = createSignal<SimNode | null>(props.node)
  let clearTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    const next = props.node
    if (clearTimer) {
      clearTimeout(clearTimer)
      clearTimer = undefined
    }
    if (next) {
      setHeld(next)
      return
    }
    clearTimer = setTimeout(() => {
      // Re-check: another node might have been selected mid-transition.
      if (!props.node) setHeld(null)
    }, SLIDE_MS)
  })
  onCleanup(() => {
    if (clearTimer) clearTimeout(clearTimer)
  })

  return (
    <div class="absolute top-0 right-0 bottom-0 h-full p-4 rounded pointer-events-none">
      <div
        class="relative z-20 bg-background-base flex flex-col rounded-lg border border-border-base/50 h-full overflow-hidden"
        style={{
          width: `${props.width}px`,
          transform: props.node ? "translateX(0)" : "translateX(110%)",
          opacity: props.node ? 1 : 0,
          "pointer-events": props.node ? "auto" : "none",
          "will-change": "transform, opacity",
          // Slow, eased drawer glide — part of the guided-tour pacing so the
          // viewport has room to reframe alongside the panel. Opacity rides
          // along on a shorter curve so content fades, not pops.
          transition: `transform ${SLIDE_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms ease-out`,
        }}
      >
        {/* Left-edge resize handle: drag toward the graph to widen the drawer */}
        <Show when={held()}>
          <div class="absolute left-0 top-0 bottom-0 z-30" onPointerDown={(e) => e.stopPropagation()}>
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={props.width}
              min={300}
              max={props.maxWidth}
              onResize={props.onResize}
            />
          </div>
        </Show>
        <Show when={held()}>
          {(n) => (
            <EntityNavProvider navigate={props.onNavigate}>
              <EntityHoverProvider onHover={props.onHover}>
                <EntitySurface
                  id={n().id}
                  type={n().type}
                  title={n().label}
                  meta={n().id}
                  status={n().status}
                  priority={n().priority}
                  navV2={isNavV2Enabled()}
                  onBack={props.onBack}
                  onForward={props.onForward}
                  canBack={props.canBack}
                  canForward={props.canForward}
                  onClose={props.onClose}
                />
              </EntityHoverProvider>
            </EntityNavProvider>
          )}
        </Show>
      </div>
    </div>
  )
}

// Dispatcher — SVG below TIER.light, Canvas2D above. Both engines return
// the same `{ stop, focus, setHoveredId }` handle so the caller doesn't care
// which path was taken.
//
// `?renderer=canvas` or `?renderer=svg` overrides the auto-selection — useful
// for parity testing and when you want to force a specific path on a small
// graph during development.
function renderForceGraph(
  svgEl: SVGSVGElement,
  nodes: SimNode[],
  links: (Omit<TrellisGraphEdge, "source" | "target"> & { source: string; target: string })[],
  cb: GraphCallbacks,
  physics: Physics = DEFAULT_PHYSICS,
): RenderHandle {
  const force = typeof location !== "undefined" ? new URLSearchParams(location.search).get("renderer") : null
  if (force === "canvas") return renderCanvas(svgEl, nodes, links, cb, physics)
  if (force === "svg") return renderSvg(svgEl, nodes, links, cb, physics)
  if (nodes.length <= TIER.light) return renderSvg(svgEl, nodes, links, cb, physics)
  return renderCanvas(svgEl, nodes, links, cb, physics)
}

function renderSvg(
  svgEl: SVGSVGElement,
  nodes: SimNode[],
  links: (Omit<TrellisGraphEdge, "source" | "target"> & { source: string; target: string })[],
  cb: GraphCallbacks,
  physics: Physics = DEFAULT_PHYSICS,
) {
  const width = svgEl.clientWidth || 800
  const height = svgEl.clientHeight || 600
  const opt = cfg(nodes.length)
  // Skip expensive per-hover/per-tick work on big graphs
  const heavy = nodes.length > 1500

  // Hydrate persisted positions BEFORE handing nodes to d3's force layout.
  // If most nodes are already placed, the simulation will keep them roughly
  // in the same spot and only rearrange new/missing nodes.
  const saved = cb.layout?.load()
  const hydrated = hydrateLayout(nodes, saved)
  const warmStart = hydrated > 0 && hydrated >= Math.floor(nodes.length * 0.6)

  const svg = d3Select.select(svgEl)
  svg.selectAll("*").remove()

  // Keyframe for edge flow animation (hover + zoomed in)
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style")
  styleEl.textContent =
    "@keyframes edgeFlow{to{stroke-dashoffset:-16}}.edge-flow{animation:edgeFlow 0.5s linear infinite}@keyframes nodeBirth{0%{opacity:1;transform:scale(3.4);filter:drop-shadow(0 0 18px #22c55e)}100%{opacity:0;transform:scale(1);filter:drop-shadow(0 0 0 transparent)}}.node-birth{animation:nodeBirth 5.5s ease-out forwards;transform-box:fill-box;transform-origin:center;pointer-events:none}"
  svgEl.prepend(styleEl)

  const EDGE_ANIM_ZOOM = 1.0
  const HOVER_MIN_ZOOM = 0
  const ZOOM_MIN = 0.05
  const NODE_HIT_PX = 12

  const g = svg.append("g")
  let zoom = saved?.zoom
    ? d3Zoom.zoomIdentity.translate(saved.zoom.x, saved.zoom.y).scale(saved.zoom.k)
    : d3Zoom.zoomIdentity
  let raf = 0
  let tickCounter = 0
  let drawTimer: ReturnType<typeof setTimeout> | undefined
  let lastDrawAt = 0

  // Cinematic opening: fade the whole scene in on first paint. Skipped on warm
  // start because the layout is already there and any flicker feels like jank.
  // CSS transitions are compositor-driven so the cost is ~zero on the main thread.
  const introMs = 550
  if (!warmStart) {
    g.style("opacity", "0").style("transition", `opacity ${introMs}ms ease-out`)
    // Schedule after the current frame so the browser registers the starting
    // opacity before we flip it.
    requestAnimationFrame(() => {
      g.style("opacity", "1")
      // Clear the transition after it plays so it doesn't interfere with d3's
      // own transitions later (hover, selection focus, etc).
      setTimeout(() => g.style("transition", null), introMs + 50)
    })
  }

  // Persistence helper: snapshot zoom + positions into the debounced saver.
  // Defined early so the zoom restore below and the drag handlers can use it.
  const persist = () => {
    if (!cb.layout) return
    cb.layout.save(snapshot(nodes, { x: zoom.x, y: zoom.y, k: zoom.k }))
  }

  // Figma-like gesture state
  let spacePressed = false

  // Hover state
  let hoveredId: string | null = null

  // Build adjacency and an id → node index for O(1) lookups everywhere.
  const byId = new Map<string, SimNode>()
  for (const n of nodes) byId.set(n.id, n)
  const adjacency = new Map<string, Set<string>>()
  for (const n of nodes) adjacency.set(n.id, new Set())
  for (const l of links) {
    const s = adjacency.get(l.source)
    const t = adjacency.get(l.target)
    if (s) s.add(l.target)
    if (t) t.add(l.source)
  }
  // Precompute each node's "closure" (self + neighbors) so hover doesn't
  // rebuild the Set on every mouseenter of a large graph.
  const closure = new Map<string, Set<string>>()
  for (const [id, neigh] of adjacency) {
    closure.set(id, new Set<string>([id, ...neigh]))
  }

  let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null

  // Tooltip overlay (HTML div positioned over the SVG)
  const container = svgEl.parentElement!
  const tooltip = container.appendChild(document.createElement("div"))
  tooltip.setAttribute("class", "graph-tooltip")
  tooltip.style.cssText =
    "position:absolute;pointer-events:none;z-index:20;display:none;" +
    "padding:0;border-radius:8px;font-size:11px;line-height:1.4;" +
    "background:color-mix(in srgb, var(--surface-raised-base) 85%, transparent);" +
    "backdrop-filter:blur(4px);" +
    "border:1px solid var(--border-base);" +
    "color:var(--text-strong);box-shadow:0 6px 20px rgba(0,0,0,.35);" +
    "width:max-content;max-width:min(480px,90vw);" +
    "opacity:0;transform:translateY(2px);" +
    "transition:opacity 80ms ease-out,transform 80ms ease-out;"

  // Minimap overlay (Canvas2D, bottom-left). Canvas scales to ~10k nodes without
  // breaking a sweat; SVG would create thousands of DOM elements just for dots.
  const mini = window.matchMedia("(max-width: 767px)").matches
  const MAP_W = mini ? GRAPH_MINIMAP_W_MOBILE : GRAPH_MINIMAP_W
  const MAP_H = mini ? 64 : 120
  const MAP_PAD = mini ? 4 : 6
  const minimap = container.appendChild(document.createElement("canvas"))
  const dpr = window.devicePixelRatio || 1
  minimap.width = MAP_W * dpr
  minimap.height = MAP_H * dpr
  minimap.setAttribute("class", "graph-minimap")
  minimap.style.cssText =
    `position:absolute;left:12px;bottom:12px;z-index:15;` +
    `width:${MAP_W}px;height:${MAP_H}px;` +
    `background:color-mix(in srgb, var(--bg-elevated) 88%, transparent);` +
    `border:1px solid var(--border-base);border-radius:6px;` +
    `box-shadow:0 2px 10px rgba(0,0,0,.35);` +
    `cursor:pointer;transition:opacity 180ms ease-out;`
  const mctx = minimap.getContext("2d")!
  mctx.scale(dpr, dpr)

  // Cached world-bounds across all nodes. Recomputed each minimap paint since
  // the node count is small enough (< ~10k) that two passes cost ~0.1ms.
  type Bounds = { minX: number; minY: number; maxX: number; maxY: number; scale: number }
  function worldBounds(): Bounds {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const x = n.x ?? 0
      const y = n.y ?? 0
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    // Also include the current viewport so the indicator is always visible
    // (e.g. if the user has panned way off the node cloud).
    const vx0 = -zoom.x / zoom.k
    const vy0 = -zoom.y / zoom.k
    const vx1 = (width - zoom.x) / zoom.k
    const vy1 = (height - zoom.y) / zoom.k
    minX = Math.min(minX, vx0)
    minY = Math.min(minY, vy0)
    maxX = Math.max(maxX, vx1)
    maxY = Math.max(maxY, vy1)
    // Defend against single-node / degenerate graphs.
    if (!Number.isFinite(minX)) {
      minX = 0
      minY = 0
      maxX = width
      maxY = height
    }
    const dx = maxX - minX || 1
    const dy = maxY - minY || 1
    const scale = Math.min((MAP_W - MAP_PAD * 2) / dx, (MAP_H - MAP_PAD * 2) / dy)
    return { minX, minY, maxX, maxY, scale }
  }

  function toMap(x: number, y: number, b: Bounds): [number, number] {
    return [MAP_PAD + (x - b.minX) * b.scale, MAP_PAD + (y - b.minY) * b.scale]
  }

  // Scratch color cache so we don't resolve CSS vars per dot.
  const colorCache = new Map<string, string>()
  function cachedColor(n: SimNode): string {
    const hit = colorCache.get(n.type)
    if (hit) return hit
    const c = nodeColor(n)
    colorCache.set(n.type, c)
    return c
  }

  let minimapRaf = 0
  function paintMinimap() {
    if (minimapRaf) return
    minimapRaf = requestAnimationFrame(() => {
      minimapRaf = 0
      mctx.clearRect(0, 0, MAP_W, MAP_H)
      const b = worldBounds()
      // Node dots — single point per node, colored by type.
      mctx.globalAlpha = 0.7
      // Grouping by color to minimize fillStyle churn.
      const byColor = new Map<string, SimNode[]>()
      for (const n of nodes) {
        const c = cachedColor(n)
        const arr = byColor.get(c)
        if (arr) arr.push(n)
        else byColor.set(c, [n])
      }
      for (const [color, arr] of byColor) {
        mctx.fillStyle = color
        for (const n of arr) {
          const [mx, my] = toMap(n.x ?? 0, n.y ?? 0, b)
          mctx.fillRect(mx - 0.75, my - 0.75, 1.5, 1.5)
        }
      }
      // Viewport rectangle (what's currently visible in the main view).
      mctx.globalAlpha = 1
      const vx0 = -zoom.x / zoom.k
      const vy0 = -zoom.y / zoom.k
      const vw = width / zoom.k
      const vh = height / zoom.k
      const [rx, ry] = toMap(vx0, vy0, b)
      const rw = vw * b.scale
      const rh = vh * b.scale
      // Dim everything outside the viewport so the "you are here" area pops.
      // Uses the even-odd fill rule: the outer rect and the inner viewport rect
      // together leave a "window" through which the dots remain at full brightness.
      mctx.fillStyle = "rgba(0,0,0,0.45)"
      const mask = new Path2D()
      mask.rect(0, 0, MAP_W, MAP_H)
      mask.rect(rx, ry, rw, rh)
      mctx.fill(mask, "evenodd")
      // Viewport outline on top of the mask.
      mctx.strokeStyle = "rgba(255,255,255,0.9)"
      mctx.lineWidth = 1
      mctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1)
      refreshBeacon()
    })
  }

  // Click/drag on the minimap to recenter the main view. The event coordinates
  // are in minimap (px) space; we invert the transform to get the world target.
  function minimapTo(evt: MouseEvent): [number, number] | null {
    const rect = minimap.getBoundingClientRect()
    const mx = evt.clientX - rect.left
    const my = evt.clientY - rect.top
    if (mx < 0 || my < 0 || mx > MAP_W || my > MAP_H) return null
    const b = worldBounds()
    const wx = (mx - MAP_PAD) / b.scale + b.minX
    const wy = (my - MAP_PAD) / b.scale + b.minY
    return [wx, wy]
  }

  function panTo(wx: number, wy: number) {
    // Center main viewport on (wx, wy) at current scale.
    const k = zoom.k
    const tx = width / 2 - wx * k
    const ty = height / 2 - wy * k
    svg.call(zoomBehavior.transform, d3Zoom.zoomIdentity.translate(tx, ty).scale(k))
  }

  let minimapDragging = false
  const onMinimapDown = (e: MouseEvent) => {
    e.preventDefault()
    minimapDragging = true
    const p = minimapTo(e)
    if (p) panTo(p[0], p[1])
  }
  const onMinimapMove = (e: MouseEvent) => {
    if (!minimapDragging) return
    const p = minimapTo(e)
    if (p) panTo(p[0], p[1])
  }
  const onMinimapUp = () => {
    minimapDragging = false
  }
  minimap.addEventListener("mousedown", onMinimapDown)
  window.addEventListener("mousemove", onMinimapMove)
  window.addEventListener("mouseup", onMinimapUp)

  const zoomBehavior = d3Zoom
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([ZOOM_MIN, 4])
    .extent((): [[number, number], [number, number]] => [
      [0, 0],
      [svgEl.clientWidth || width, svgEl.clientHeight || height],
    ])
    .filter((event: any) => {
      // Zoom only on ctrl/cmd+wheel (pinch sends ctrlKey) or mouse drag
      if (event.type === "wheel") return event.ctrlKey || event.metaKey
      return event.button === 0 || event.button === 1
    })
    .on("zoom", (event: d3Zoom.D3ZoomEvent<SVGSVGElement, unknown>) => {
      zoom = event.transform
      g.attr("transform", String(event.transform))
      draw()
      paintMinimap()
      refreshBeacon()
      persist()
    })
  svg.call(zoomBehavior)

  function goToNodes() {
    const next = fitClusterTransform(nodes, width, height, { minScale: ZOOM_MIN, maxScale: 2 })
    if (!next) return
    svg
      .transition()
      .duration(550)
      .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
      .call(zoomBehavior.transform, next)
  }

  const beacon = createGraphBeacon(container, goToNodes, {
    mobile: mini,
    onLayout: (layout) => {
      const dim = layout.show && layout.overlapsChrome
      minimap.style.opacity = dim ? "0.12" : "1"
      minimap.style.pointerEvents = dim ? "none" : "auto"
      cb.onBeaconChromeDim?.(dim)
    },
  })
  const refreshBeacon = () => {
    const state = shouldShowGraphBeacon(nodes, zoom, width, height)
    beacon.update({ viewW: width, viewH: height, zoom, show: state.show, cluster: state.cluster })
  }

  function goToNodesIfOffscreen(): boolean {
    const state = shouldShowGraphBeacon(nodes, zoom, width, height)
    if (!state.show) return false
    goToNodes()
    return true
  }

  // Figma gestures: two-finger scroll → pan, ctrl/cmd+scroll or pinch → zoom.
  // translateBy multiplies by k — wheelPanBy divides by k for constant screen speed.
  svgEl.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const [dx, dy] = wheelPanBy(zoom.k, e, height)
      svg.call(zoomBehavior.translateBy, dx, dy)
    },
    { passive: false },
  )

  // Middle mouse button cursor feedback
  svgEl.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      svgEl.style.cursor = "grabbing"
    }
  })
  svgEl.addEventListener("mouseup", (e: MouseEvent) => {
    if (e.button === 1 && !spacePressed) svgEl.style.cursor = "default"
  })

  // Space+drag to pan. Skip when the user is typing in an editable element so
  // Space keystrokes still reach prompt inputs, textareas, and contenteditable
  // surfaces elsewhere in the app.
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    return false
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "Space" || spacePressed) return
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    spacePressed = true
    svgEl.style.cursor = "grab"
    zoomBehavior.scaleExtent([zoom.k, zoom.k])
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code !== "Space") return
    if (!spacePressed) return
    e.preventDefault()
    spacePressed = false
    svgEl.style.cursor = "default"
    zoomBehavior.scaleExtent([ZOOM_MIN, 4])
  }

  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)

  // Make SVG focusable and auto-focus it. Suppress the browser's default focus
  // ring — the graph surface covers the whole canvas and the blue outline is
  // visually distracting.
  svgEl.setAttribute("tabindex", "0")
  svgEl.style.outline = "none"
  svgEl.focus()

  // Background click → deselect
  svg.on("click", (event: MouseEvent) => {
    if (event.target === svgEl) cb.onDeselect()
  })

  const simLinks = links.map((l) => ({ ...l })) as d3Force.SimulationLinkDatum<SimNode>[]

  let activePhysics: Physics = { ...physics }
  const physDist = () => opt.dist * activePhysics.dist
  const physCharge = () => opt.charge * activePhysics.charge
  const physCollide = () => opt.collide * activePhysics.collide
  const physDecay = () => opt.decay * activePhysics.decay

  const simulation = d3Force
    .forceSimulation<SimNode>(nodes)
    .force(
      "link",
      d3Force
        .forceLink<SimNode, d3Force.SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(physDist()),
    )
    .force("charge", d3Force.forceManyBody<SimNode>().strength(physCharge()))
    .force("collide", d3Force.forceCollide<SimNode>(physCollide()))
    .alphaDecay(physDecay())
    .alphaMin(GRAPH_SIM_ALPHA_MIN)

  // Skip `center` force on warm-start or the whole graph drifts toward the
  // viewport center and undoes the user's saved layout.
  if (!warmStart) {
    simulation.force("center", d3Force.forceCenter(width / 2, height / 2))
  }

  // Warm-start = low initial alpha so nodes don't fly around just to re-settle
  // in the exact positions they were already in.
  if (warmStart) simulation.alpha(0.15).alphaTarget(0)

  // Hover/selection transitions. We rely on CSS transitions (compositor-driven)
  // rather than d3.transition() so attr writes in `applyHover` tween "for free"
  // without burning main-thread time. Disabled on heavy graphs — at that scale
  // the browser can't keep up with thousands of simultaneous transitions.
  const animate = !heavy
  const hoverTransition = animate
    ? "stroke 110ms ease-out, stroke-opacity 110ms ease-out, stroke-width 110ms ease-out, opacity 110ms ease-out"
    : "none"

  // Links. `imports` edges render dashed so they visually distinguish from
  // structural edges like `parent` / `contains`.
  // Default opacity is intentionally dim so file icons and active focus states
  // pop against the mesh. Hover/selection lifts them back up.
  const edgeOpacityDefault = 0.18
  const link = g
    .append("g")
    .attr("class", "links")
    .selectAll<SVGLineElement, d3Force.SimulationLinkDatum<SimNode>>("line")
    .data(simLinks)
    .join("line")
    .attr("stroke", "var(--text-weak)")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", edgeOpacityDefault)
    .attr("stroke-linecap", "round")
    .attr("stroke-dasharray", (d) =>
      (d as any).type === "imports" ? "3,3" : (d as any).type === "links" ? "1,4" : "none",
    )
    .style("transition", hoverTransition)

  // Edge label text (relationship name at midpoint). Pill background gives the
  // label enough contrast to be readable over crossing edges and dense nodes.
  const edgeLabelG = g.append("g").attr("class", "edge-labels")
  const edgeLabel = edgeLabelG
    .selectAll<SVGTextElement, (typeof simLinks)[number]>("text")
    .data(opt.edge ? simLinks : [])
    .join("text")
    .text((d) => (d as any).type as string)
    .attr("font-size", "9px")
    .attr("font-weight", "500")
    .attr("fill", "var(--text-base)")
    .attr("stroke", "var(--background-base)")
    .attr("stroke-width", 3)
    .attr("stroke-linejoin", "round")
    .attr("paint-order", "stroke")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .attr("dy", "0.35em")
    .style("opacity", 0.35)
    .style("transition", hoverTransition)

  // Crow's foot cardinality markers (drawn once, repositioned on tick)
  const cardinalityG = g.append("g").attr("class", "cardinality")

  function hitRadius(d: SimNode) {
    const r = nodeRadius(d) + (d.type === "file" || d.type === "directory" ? 4 : 0)
    return Math.max(r, NODE_HIT_PX / zoom.k)
  }
  function ringRadius(d: SimNode) {
    const r = nodeRadius(d) + (d.type === "file" || d.type === "directory" ? 4 : 0)
    return Math.max(r, 4 / zoom.k)
  }

  // Nodes (group = circle + icon).
  // IMPORTANT: no CSS `transition` on `transform` here — the simulation writes
  // transforms every tick and the browser would interpolate each one, torching
  // main-thread time. We animate opacity only, and only on small graphs.
  const nodeG = g
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, SimNode>("g")
    .data(nodes)
    .join("g")
    .style("contain", "strict")
    .style("cursor", "pointer")
    .on("click", (event: MouseEvent, d: SimNode) => {
      event.stopPropagation()
      cb.onSelect(d)
    })
    .on("mouseenter", (_event: MouseEvent, d: SimNode) => {
      // Zoom threshold prevents strobing in dense clusters, so hover can fire
      // immediately for a snappy, responsive feel.
      if (zoom.k < HOVER_MIN_ZOOM) return
      hoveredId = d.id
      applyHover()
      showTooltip(d)
      startHoverAnim(d.id)
    })
    .on("mouseleave", () => {
      if (hoveredId === null) return
      hoveredId = null
      applyHover()
      hideTooltip()
      startHoverAnim(null)
    })

  const hit = nodeG
    .append("circle")
    .attr("class", "node-hit")
    .attr("r", hitRadius)
    .attr("fill", "transparent")
    .attr("pointer-events", "all")

  // Node ring. Default stroke opacity is dim so the file-icon glyphs inside
  // carry the visual weight; hover/selection lifts the ring to full color.
  const ringOpacityDefault = 0.35
  nodeG
    .append("circle")
    .attr("class", "node-ring")
    .attr("r", ringRadius)
    .attr("pointer-events", "none")
    .attr("fill", (d) => nodeColor(d))
    .attr("fill-opacity", 0.2)
    .attr("stroke", (d) => nodeColor(d))
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", ringOpacityDefault)
    .style("transition", hoverTransition)

  nodeG
    .filter((d) => !!d.fresh)
    .append("circle")
    .attr("class", "node-birth")
    .attr("r", (d) => nodeRadius(d) + 6)
    .attr("fill", "rgba(34,197,94,0.18)")
    .attr("stroke", "#22c55e")
    .attr("stroke-width", 3)

  if (opt.icon) {
    nodeG.each(function (d) {
      const r = nodeRadius(d)
      const sel = d3Select.select(this)

      // Use the real file-type sprite for file/directory nodes so users can
      // recognize TypeScript, Markdown, images, etc. at a glance — same icons
      // the file tree and tabs use. Entity types keep their Lucide glyph.
      if (d.type === "file" || d.type === "directory") {
        const rawPath = d.id.startsWith("file:") ? d.id.slice(5) : d.id.startsWith("dir:") ? d.id.slice(4) : d.id
        const iconName = chooseIconName(rawPath, d.type as "file" | "directory", false)
        // Bigger size + no background stroke: the sprite icons are full-color.
        const iconSize = Math.max(r * 1.8, 14)
        sel
          .append("svg")
          .attr("viewBox", "0 0 32 32")
          .attr("width", iconSize)
          .attr("height", iconSize)
          .attr("x", -iconSize / 2)
          .attr("y", -iconSize / 2)
          .attr("pointer-events", "none")
          .append("use")
          .attr("href", `${fileIconSpriteUrl}#${iconName}`)
        return
      }

      const path = nodeIcon(d)
      if (!path) return
      // Icon fits inside the circle with visible padding around it.
      const iconSize = Math.max(r * 1.05, 9)
      sel
        .append("svg")
        .attr("viewBox", ENTITY_ICON_VIEWBOX)
        .attr("width", iconSize)
        .attr("height", iconSize)
        .attr("x", -iconSize / 2)
        .attr("y", -iconSize / 2)
        .attr("fill", "none")
        .attr("stroke", nodeColor(d))
        .attr("stroke-width", NODE_ICON_STROKE)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("pointer-events", "none")
        .html(path)
    })
  }

  // Labels
  const label = g
    .append("g")
    .attr("class", "labels")
    .selectAll<SVGTextElement, SimNode>("text")
    .data(opt.label ? nodes : [])
    .join("text")
    .text((d) => d.label)
    .attr("font-size", "10px")
    .attr("fill", "var(--text-weak)")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .attr("dy", "2.2em")

  // Direct-hover scale only (no cursor-proximity swell or magnetic pull).
  const hoverScale = 2.1
  let hoverAnim = 1
  let hoverAnimTarget = 1
  let hoverAnimId: string | null = null
  let hoverAnimRaf = 0
  function nodeTransform(d: SimNode): string {
    const x = d.x ?? 0
    const y = d.y ?? 0
    if (hoverAnimId === d.id && hoverAnim !== 1) {
      return `translate(${x},${y}) scale(${hoverAnim})`
    }
    return `translate(${x},${y})`
  }
  function paintNodeTransforms() {
    nodeG.attr("transform", nodeTransform)
  }
  function tickHoverAnim() {
    hoverAnimRaf = 0
    const diff = hoverAnimTarget - hoverAnim
    if (Math.abs(diff) < 0.005) {
      hoverAnim = hoverAnimTarget
      if (hoverAnimTarget === 1) hoverAnimId = null
      paintNodeTransforms()
      return
    }
    hoverAnim += diff * 0.28
    paintNodeTransforms()
    hoverAnimRaf = requestAnimationFrame(tickHoverAnim)
  }
  function startHoverAnim(id: string | null) {
    if (id) {
      hoverAnimId = id
      hoverAnimTarget = hoverScale
    } else {
      hoverAnimTarget = 1
    }
    if (!hoverAnimRaf) hoverAnimRaf = requestAnimationFrame(tickHoverAnim)
  }

  const labelsAtZoom = () => opt.label && zoom.k >= GRAPH_LABEL_MIN_ZOOM
  const edgesAtZoom = () => opt.edge && zoom.k >= GRAPH_LABEL_MIN_ZOOM

  // Drag
  const dragBehavior = d3Drag
    .drag<SVGGElement, SimNode>()
    .on("start", (event: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on("drag", (event: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on("end", (event: d3Drag.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
      persist()
    })
  nodeG.call(dragBehavior)

  function applyHover() {
    const selectedId = cb.getSelectedId()
    // Primary focus = hovered (if any), else the selection.
    // Secondary focus = the selection, when a different node is being hovered.
    const primary = hoveredId ?? selectedId
    const secondary = hoveredId && selectedId && selectedId !== hoveredId ? selectedId : null

    // Hover highlighting uses CSS transitions declared on each selection
    // (stroke / stroke-opacity / stroke-width on links, opacity on nodes and
    // labels). Writing attrs directly here lets a single DOM mutation per
    // element kick off a graceful CSS tween — this is both cheaper than d3
    // transitions on heavy graphs and avoids d3's per-frame attr writes from
    // fighting the CSS animation.
    const nodeSel = nodeG
    const linkSel = link
    const edgeSel = edgeLabel
    const labelSel = label
    const cardSel = cardinalityG

    if (primary === null) {
      ;(nodeSel as any).style("opacity", null)
      // Reset node rings to dim default stroke-opacity.
      nodeG.select(".node-ring").attr("stroke-opacity", ringOpacityDefault).attr("fill-opacity", 0.2)
      ;(linkSel as any)
        .classed("edge-flow", false)
        .attr("stroke", "var(--text-weak)")
        .attr("stroke-width", 1)
        .attr("stroke-opacity", edgeOpacityDefault)
        .attr("stroke-dasharray", (d: any) =>
          (d as any).type === "imports" ? "3,3" : (d as any).type === "links" ? "1,4" : "none",
        )
      ;(edgeSel as any).style("opacity", 0.35)
      ;(labelSel as any).style("opacity", null)
      ;(cardSel as any).style("opacity", null)
      return
    }

    const box = bounds(zoom, width, height)
    const primaryConn = closure.get(primary) ?? new Set<string>([primary])
    const secondaryConn = secondary ? (closure.get(secondary) ?? new Set<string>([secondary])) : null

    const primaryNode = byId.get(primary)
    const primaryColor = primaryNode ? nodeColor(primaryNode) : "var(--border-base)"
    const secondaryNode = secondary ? byId.get(secondary) : null
    const secondaryColor = secondaryNode ? nodeColor(secondaryNode) : null

    // Only dim viewport-visible nodes — skipping off-screen ones saves thousands
    // of DOM writes on large graphs and avoids jarring opacity resets on scroll.
    ;(nodeSel as any).style("opacity", (d: SimNode) => {
      if (!visible(d, box)) return null
      if (primaryConn.has(d.id)) return 1
      if (secondaryConn && secondaryConn.has(d.id)) return 0.55
      return 0.35
    })

    // Light up the rings of connected nodes; everyone else stays at the dim
    // default so focused subgraphs pop visually.
    nodeG
      .select(".node-ring")
      .attr("stroke-opacity", (d: any) => {
        if (primaryConn.has(d.id)) return 1
        if (secondaryConn && secondaryConn.has(d.id)) return 0.7
        return ringOpacityDefault
      })
      .attr("fill-opacity", (d: any) => {
        if (primaryConn.has(d.id)) return 0.5
        if (secondaryConn && secondaryConn.has(d.id)) return 0.3
        return 0.1
      })

    // Classify each link: 0 = neither, 1 = primary, 2 = secondary only
    const classify = (d: any): 0 | 1 | 2 => {
      const s = (d.source as SimNode).id
      const t = (d.target as SimNode).id
      if (s === primary || t === primary) return 1
      if (secondary && (s === secondary || t === secondary)) return 2
      return 0
    }

    const flowEdges = animate && zoom.k >= EDGE_ANIM_ZOOM
    ;(linkSel as any)
      .classed("edge-flow", (d: any) => flowEdges && classify(d) === 1)
      .attr("stroke", (d: any) => {
        const c = classify(d)
        if (c === 1) return primaryColor
        if (c === 2 && secondaryColor) return secondaryColor
        return "var(--border-base)"
      })
      .attr("stroke-width", (d: any) => {
        const c = classify(d)
        if (c === 1) return 2
        if (c === 2) return 1.5
        return 0.5
      })
      .attr("stroke-opacity", (d: any) => {
        const c = classify(d)
        if (c === 1) return 0.9
        if (c === 2) return 0.45
        return 0.25
      })
      .attr("stroke-dasharray", (d: any) => {
        const c = classify(d)
        if (flowEdges && c === 1) return "4 4"
        return (d as any).type === "imports" ? "3,3" : (d as any).type === "links" ? "1,4" : "none"
      })
    ;(edgeSel as any).style("opacity", (d: any) => {
      const c = classify(d)
      if (c === 1) return 1
      if (c === 2) return 0.5
      return 0.25
    })
    ;(labelSel as any).style("opacity", (d: SimNode) => {
      if (primaryConn.has(d.id)) return 1
      if (secondaryConn && secondaryConn.has(d.id)) return 0.5
      return 0.25
    })
    ;(cardSel as any).style("opacity", 0.25)
  }

  function tooltipInfo(d: SimNode) {
    const color = nodeColor(d)
    // Wrap in a padded block so the tooltip itself can have zero outer padding
    // (so thumbnails / code previews sit edge-to-edge against the border).
    return (
      `<div style="padding:10px 24px 10px 12px">` +
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">` +
      `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>` +
      `<span style="font-weight:600">${entityTypeLabel(d.type)}</span>` +
      `</div>` +
      `<div style="color:var(--text-weak);white-space:nowrap">${d.label}</div>` +
      (d.status
        ? `<div style="color:var(--text-weaker);margin-top:1px">Status: ${d.status.replace(/_/g, " ")}</div>`
        : "") +
      (d.priority ? `<div style="color:var(--text-weaker)">Priority: ${d.priority}</div>` : "") +
      `</div>`
    )
  }

  function showTooltip(d: SimNode) {
    tooltip.innerHTML = tooltipInfo(d)
    if (tooltipHideTimer !== null) {
      clearTimeout(tooltipHideTimer)
      tooltipHideTimer = null
    }
    tooltip.style.display = "block"
    positionTooltip(d)
    requestAnimationFrame(() => {
      tooltip.style.opacity = "1"
      tooltip.style.transform = "translateY(0)"
    })
  }

  function positionTooltip(d: SimNode) {
    const rect = svgEl.getBoundingClientRect()
    const sx = (d.x ?? 0) * zoom.k + zoom.x
    const sy = (d.y ?? 0) * zoom.k + zoom.y
    const r = nodeRadius(d) * zoom.k
    const tw = tooltip.offsetWidth
    const th = tooltip.offsetHeight
    // Place above the node, centered horizontally
    let left = sx - tw / 2
    let top = sy - r - th - 10
    // Flip below if off top edge
    if (top < 4) top = sy + r + 10
    // Clamp horizontal
    if (left < 4) left = 4
    if (left + tw > rect.width - 4) left = rect.width - tw - 4
    tooltip.style.left = left + "px"
    tooltip.style.top = top + "px"
  }

  function hideTooltip() {
    tooltip.style.opacity = "0"
    tooltip.style.transform = "translateY(4px)"
    tooltipHideTimer = setTimeout(() => {
      tooltip.style.display = "none"
      tooltipHideTimer = null
    }, 140)
  }

  function refresh() {
    const box = bounds(zoom, width, height)
    nodeG.style("display", (d) => (visible(d, box) ? null : "none"))
    if (opt.label) {
      const show = labelsAtZoom()
      label.style("display", (d) => (show && visible(d, box) ? null : "none"))
    }
    link.style("display", (d) => (visibleLink(d, box) ? null : "none"))
    if (opt.edge) {
      const show = edgesAtZoom()
      edgeLabel.style("display", (d) => (show && visibleLink(d, box) ? null : "none"))
    }
    hit.attr("r", hitRadius)
    nodeG.select(".node-ring").attr("r", ringRadius)

    // Fade labels when zoomed in but below full readability
    if (labelsAtZoom() && hoveredId === null) {
      const opacity = Math.min(1, Math.max(0.2, (zoom.k - ZOOM_MIN) / 1.5))
      label.style("opacity", opacity)
    } else if (opt.label) {
      label.style("opacity", null)
    }

    // Drop hover state when zoomed out past threshold
    if (hoveredId !== null && zoom.k < HOVER_MIN_ZOOM) {
      hoveredId = null
      applyHover()
      hideTooltip()
      startHoverAnim(null)
      return
    }
    // Reposition tooltip and re-evaluate edge animations on zoom/pan while hovered
    if (hoveredId !== null) {
      const n = byId.get(hoveredId)
      if (n) positionTooltip(n)
      applyHover()
    }
  }

  // Throttle offscreen-culling on heavy graphs: writing display:none across
  // thousands of nodes every zoom frame is what causes the "blank screen for a
  // second" on click (the zoom transition runs refresh() per frame). With this
  // we cull at most every ~180ms during an animation, which keeps the zoom
  // transition smooth, then let the final settle paint clean up.
  const drawMinGap = heavy ? 180 : 0
  function draw() {
    if (raf || drawTimer) return
    const now = performance.now()
    const wait = drawMinGap ? Math.max(0, drawMinGap - (now - lastDrawAt)) : 0
    const run = () => {
      raf = 0
      drawTimer = undefined
      lastDrawAt = performance.now()
      refresh()
    }
    if (wait > 0) {
      drawTimer = setTimeout(() => {
        drawTimer = undefined
        raf = requestAnimationFrame(run)
      }, wait)
    } else {
      raf = requestAnimationFrame(run)
    }
  }

  // When the simulation cools to a stop, capture the final layout. The saver is
  // debounced so this also coalesces with any in-flight drag/zoom writes.
  simulation.on("end", () => persist())

  simulation.on("tick", () => {
    tickCounter++
    // On heavy graphs, only paint every other tick. The simulation still
    // advances physics on every tick; we just skip the DOM write.
    if (heavy && tickCounter & 1) return

    link
      .attr("x1", (d) => (d.source as SimNode).x ?? 0)
      .attr("y1", (d) => (d.source as SimNode).y ?? 0)
      .attr("x2", (d) => (d.target as SimNode).x ?? 0)
      .attr("y2", (d) => (d.target as SimNode).y ?? 0)

    if (edgesAtZoom()) {
      edgeLabel
        .attr("x", (d) => ((d.source as SimNode).x! + (d.target as SimNode).x!) / 2)
        .attr("y", (d) => ((d.source as SimNode).y! + (d.target as SimNode).y!) / 2)
    }

    if (opt.card) {
      cardinalityG.selectAll("*").remove()
      if (zoom.k >= GRAPH_LABEL_MIN_ZOOM) {
        for (const sl of simLinks) {
          const s = sl.source as SimNode
          const t = sl.target as SimNode
          const sx = s.x ?? 0
          const sy = s.y ?? 0
          const tx = t.x ?? 0
          const ty = t.y ?? 0
          const dx = tx - sx
          const dy = ty - sy
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len < 1) continue
          const angle = Math.atan2(dy, dx)
          const rel = (sl as any).type as string
          const [srcCard, tgtCard] = EDGE_CARDINALITY[rel] ?? ["1", "*"]
          const inset = 14
          drawCardinality(cardinalityG, srcCard, sx + (dx / len) * inset, sy + (dy / len) * inset, angle)
          drawCardinality(cardinalityG, tgtCard, tx - (dx / len) * inset, ty - (dy / len) * inset, angle + Math.PI)
        }
      }
    }

    paintNodeTransforms()
    if (labelsAtZoom()) label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0)

    // Cull offscreen nodes occasionally (every 8 ticks) — zoom/pan also calls draw().
    if ((tickCounter & 7) === 0) draw()
    // Refresh the minimap on a lighter cadence — every 4 ticks is enough to
    // keep it feeling live during settle without doubling our per-tick cost.
    if ((tickCounter & 3) === 0) paintMinimap()
  })

  draw()
  paintMinimap()
  refreshBeacon()

  function fit() {
    const run = () => {
      if (nodes.length === 0) return
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of nodes) {
        const nx = n.x ?? width / 2
        const ny = n.y ?? height / 2
        minX = Math.min(minX, nx)
        maxX = Math.max(maxX, nx)
        minY = Math.min(minY, ny)
        maxY = Math.max(maxY, ny)
      }
      const pad = 120
      const bw = maxX - minX + pad * 2
      const bh = maxY - minY + pad * 2
      const scale = Math.max(ZOOM_MIN, Math.min(width / bw, height / bh, 2))
      const x = (minX + maxX) / 2
      const y = (minY + maxY) / 2
      const next = d3Zoom.zoomIdentity.translate(width / 2 - x * scale, height / 2 - y * scale).scale(scale)
      svg
        .transition()
        .duration(550)
        .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
        .call(zoomBehavior.transform, next)
    }
    if (nodes.some((n) => n.x == null || n.y == null)) requestAnimationFrame(run)
    else run()
  }

  function recenter(inset: number) {
    const gap = Math.max(0, Math.min(inset, width))
    const k = zoom.k
    const x = ((width - gap) / 2 - zoom.x) / k
    const y = (height / 2 - zoom.y) / k
    const next = d3Zoom.zoomIdentity.translate(width / 2 - x * k, height / 2 - y * k).scale(k)
    svg
      .transition()
      .duration(560)
      .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
      .call(zoomBehavior.transform, next)
  }

  function focus(id: string | null) {
    applyHover()
    if (!id) return
    const target = nodes.find((n) => n.id === id)
    if (!target) return
    // Wait a tick to let the simulation settle on initial load
    const run = () => {
      // Get all connected nodes (target + neighbors)
      const neighbors = adjacency.get(id) ?? new Set()
      const connectedNodes = [
        target,
        ...(Array.from(neighbors)
          .map((nid) => nodes.find((n) => n.id === nid))
          .filter(Boolean) as SimNode[]),
      ]

      // Calculate bounding box of all connected nodes
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of connectedNodes) {
        const nx = n.x ?? width / 2
        const ny = n.y ?? height / 2
        minX = Math.min(minX, nx)
        maxX = Math.max(maxX, nx)
        minY = Math.min(minY, ny)
        maxY = Math.max(maxY, ny)
      }

      // Add padding around the bounding box
      const padding = 80
      const boxWidth = maxX - minX + padding * 2
      const boxHeight = maxY - minY + padding * 2

      // Reserve ~420px for the drawer on the right
      const drawerW = cb.inset?.() ?? 420
      const viewWidth = width - drawerW
      const viewHeight = height

      // Calculate scale to fit bounding box in viewport
      const scaleX = viewWidth / boxWidth
      const scaleY = viewHeight / boxHeight
      const targetScale = Math.min(scaleX, scaleY, 2) // Cap at 2x to avoid over-zooming

      // Center view on bounding box center
      const boxCenterX = (minX + maxX) / 2
      const boxCenterY = (minY + maxY) / 2
      const cx = (width - drawerW) / 2
      const cy = height / 2
      const next = d3Zoom.zoomIdentity
        .translate(cx - boxCenterX * targetScale, cy - boxCenterY * targetScale)
        .scale(targetScale)
      // Slower, guided reframe so the viewer can track the camera move
      // instead of being yanked across the canvas. easeInOutCubic gives a
      // soft lift-off and landing at both ends.
      svg
        .transition()
        .duration(900)
        .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
        .call(zoomBehavior.transform, next)
    }
    // If node has no position yet, defer one frame
    if (target.x == null || target.y == null) requestAnimationFrame(run)
    else run()
  }

  // Restore the saved transform if there is one so the user lands where they left off.
  // This must happen after draw() is defined since the zoom event handler calls it.
  if (saved?.zoom) svg.call(zoomBehavior.transform, zoom)

  return {
    stop: () => {
      if (raf) cancelAnimationFrame(raf)
      if (drawTimer) clearTimeout(drawTimer)
      if (minimapRaf) cancelAnimationFrame(minimapRaf)
      if (hoverAnimRaf) cancelAnimationFrame(hoverAnimRaf)
      if (tooltipHideTimer !== null) clearTimeout(tooltipHideTimer)
      simulation.stop()
      // Write a final snapshot synchronously so navigating away preserves layout.
      persist()
      cb.layout?.flush()
      tooltip.remove()
      minimap.removeEventListener("mousedown", onMinimapDown)
      window.removeEventListener("mousemove", onMinimapMove)
      window.removeEventListener("mouseup", onMinimapUp)
      minimap.remove()
      beacon.destroy()
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    },
    focus,
    fit,
    recenter,
    goToNodesIfOffscreen,
    // External hover driver (e.g. sidebar card hover). Only updates if the
    // mouse isn't already hovering a real node, so DOM hover always wins.
    setHoveredId: (id: string | null) => {
      if (id && !byId.has(id)) return
      hoveredId = id
      applyHover()
      if (id) {
        const n = byId.get(id)
        if (n) showTooltip(n)
      } else {
        hideTooltip()
      }
      startHoverAnim(id)
    },
    setPhysics: (p: Physics) => {
      activePhysics = { ...p }
      const linkForce = simulation.force("link") as d3Force.ForceLink<
        SimNode,
        d3Force.SimulationLinkDatum<SimNode>
      > | null
      if (linkForce) linkForce.distance(physDist())
      const chargeForce = simulation.force("charge") as d3Force.ForceManyBody<SimNode> | null
      if (chargeForce) chargeForce.strength(physCharge())
      const collideForce = simulation.force("collide") as d3Force.ForceCollide<SimNode> | null
      if (collideForce) collideForce.radius(physCollide())
      simulation.alphaDecay(physDecay())
      simulation.alpha(0.3).restart()
    },
  }
}

// ---------------------------------------------------------------------------
// Trellis Panel (sub-tabbed wrapper)
// ---------------------------------------------------------------------------
// Queries View
// ---------------------------------------------------------------------------

function QueriesView() {
  const trellis = useTrellis()
  const [text, setText] = createSignal("")
  const [kinds, setKinds] = createSignal<Set<string>>(new Set())
  const [branch, setBranch] = createSignal("")

  onMount(() => void trellis.fetchOps(200))

  const allKinds = createMemo(() => {
    const s = new Set<string>()
    for (const op of trellis.ops) s.add(op.kind)
    return [...s].sort()
  })

  const toggleKind = (k: string) => {
    setKinds((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  const results = createMemo(() => {
    const q = text().toLowerCase()
    const ks = kinds()
    const br = branch().toLowerCase()
    return trellis.ops
      .slice()
      .reverse()
      .filter((op) => {
        if (ks.size > 0 && !ks.has(op.kind)) return false
        if (br && !(op.branchName ?? "").toLowerCase().includes(br)) return false
        if (q) {
          const hay =
            `${op.kind} ${op.filePath ?? ""} ${op.branchName ?? ""} ${op.milestoneMessage ?? ""}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <InlineInput
            placeholder="Search ops..."
            value={text()}
            onInput={(e: InputEvent) => setText((e.target as HTMLInputElement).value)}
            class="flex-1"
          />
          <InlineInput
            placeholder="Branch..."
            value={branch()}
            onInput={(e: InputEvent) => setBranch((e.target as HTMLInputElement).value)}
            class="w-28"
          />
        </div>
        <Show when={allKinds().length > 0}>
          <div class="flex flex-wrap gap-1">
            <For each={allKinds()}>
              {(k) => (
                <button
                  class="px-2 py-0.5 rounded-full text-10-medium transition-colors border"
                  classList={{
                    "bg-surface-raised-base-active border-border-weak-base text-text-strong": kinds().has(k),
                    "border-border-weaker-base text-text-weaker hover:text-text-base hover:border-border-weak-base":
                      !kinds().has(k),
                  }}
                  onClick={() => toggleKind(k)}
                >
                  {k}
                </button>
              )}
            </For>
          </div>
        </Show>
        <div class="text-10-regular text-text-weaker">
          {results().length} result{results().length !== 1 ? "s" : ""}
        </div>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={results().length > 0}
          fallback={<div class="py-8 text-center text-12-regular text-text-weaker">No ops match</div>}
        >
          <div class="flex flex-col">
            <For each={results()}>
              {(op) => (
                <div class="flex items-start gap-3 px-3 py-2 border-b border-border-weaker-base hover:bg-surface-raised-base/50 transition-colors">
                  <TrellisOpBadge kind={op.kind} class="mt-0.5 shrink-0 min-w-0" />
                  <div class="flex-1 min-w-0">
                    <Show when={op.filePath}>
                      <div class="text-11-mono text-text-weak truncate">{op.filePath}</div>
                    </Show>
                    <Show when={op.milestoneMessage}>
                      <div class="text-12-medium text-text-strong truncate">{op.milestoneMessage}</div>
                    </Show>
                    <div class="flex items-center gap-2 text-10-regular text-text-weaker mt-0.5">
                      <span>{timeAgo(op.timestamp)}</span>
                      <Show when={op.branchName}>
                        <span class="font-mono">{op.branchName}</span>
                      </Show>
                      <span class="font-mono opacity-50">{op.hash.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type PlanTab = "board" | "milestones"

// ---------------------------------------------------------------------------
// Suggestions Panel (Phase 5)
// ---------------------------------------------------------------------------

function SuggestionsPanel() {
  const trellis = useTrellis()
  const suggestions = createMemo(() => trellis.suggestions)
  const [busy, setBusy] = createSignal<string | undefined>()

  const dismiss = async (id: string) => {
    setBusy(id)
    await trellis.dismissSuggestion(id)
    setBusy(undefined)
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Proactive Suggestions</div>
        <Button size="small" variant="ghost" onClick={() => void trellis.refresh()}>
          Refresh
        </Button>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={suggestions().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <Icon name="checklist" size="small" class="text-icon-weak" />
              <div class="text-12-regular">No suggestions right now</div>
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={suggestions()}>
              {(s) => (
                <div class="flex items-start gap-3 px-3 py-3 border-b border-border-weaker-base">
                  <div class="mt-0.5 shrink-0">
                    <Show
                      when={s.priority === "high"}
                      fallback={<Icon name="alert-triangle" size="small" class="text-icon-warning" />}
                    >
                      <Icon name="alert-triangle" size="small" class="text-icon-error" />
                    </Show>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-12-medium text-text-strong">{s.description}</div>
                    <div class="text-11-regular text-text-weak mt-0.5">
                      Rule: {s.ruleId}
                      <Show when={s.entityId}> &middot; {s.entityId}</Show>
                    </div>
                  </div>
                  <Button size="small" variant="ghost" onClick={() => dismiss(s.id)} disabled={busy() === s.id}>
                    Dismiss
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plans Tab (Phase 4)
// ---------------------------------------------------------------------------

function PlansTab() {
  const trellis = useTrellis()
  const [plans, setPlans] = createSignal<TrellisPlan[]>([])
  const [expanded, setExpanded] = createSignal<string | undefined>()

  onMount(() => {
    void trellis.fetchPlans().then(setPlans)
  })

  const pill = (status: string) => {
    const colors: Record<string, string> = {
      drafting: "bg-surface-raised-base text-text-warning",
      submitted: "bg-surface-warning/20 text-text-warning",
      approved: "bg-surface-raised-base text-text-success",
      rejected: "bg-surface-raised-base text-text-danger",
    }
    return `rounded-full px-2 py-0.5 text-10-medium ${colors[status] ?? "bg-surface-raised-base text-text-weak"}`
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Plan History</div>
        <Button size="small" variant="ghost" onClick={() => void trellis.fetchPlans().then(setPlans)}>
          Refresh
        </Button>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={plans().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <div class="text-12-regular">No plans yet</div>
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={plans()}>
              {(p) => (
                <div class="border-b border-border-weaker-base">
                  <button
                    class="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-raised-base/50 transition-colors text-left"
                    onClick={() => setExpanded(expanded() === p.id ? undefined : p.id)}
                  >
                    <span class={pill(p.status)}>{p.status}</span>
                    <div class="flex-1 min-w-0">
                      <div class="text-12-medium text-text-strong truncate">{p.title}</div>
                    </div>
                    <span class="text-11-regular text-text-weaker">{p.operations.length} ops</span>
                    <span class="text-11-regular text-text-weaker">{timeAgo(p.createdAt)}</span>
                  </button>
                  <Show when={expanded() === p.id}>
                    <div class="px-3 pb-3 flex flex-col gap-1.5">
                      <Show when={p.description}>
                        <div class="text-12-regular text-text-weak mb-1">{p.description}</div>
                      </Show>
                      <For each={p.operations}>
                        {(op) => (
                          <div class="flex items-center gap-2 px-2 py-1 rounded-md bg-background-base/50 text-12-regular">
                            <span class="text-text-info font-mono">{op.kind}</span>
                            <Show when={op.entityType}>
                              <span class="text-text-weak">{op.entityType}</span>
                            </Show>
                            <Show when={op.description}>
                              <span class="text-text-weaker truncate flex-1">{op.description}</span>
                            </Show>
                          </div>
                        )}
                      </For>
                      <Show when={p.rejectionReason}>
                        <div class="text-12-regular text-text-danger mt-1">Rejected: {p.rejectionReason}</div>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ideas Tab (Phase 6 — kernel Idea Garden)
// ---------------------------------------------------------------------------

function IdeasTab() {
  const trellis = useTrellis()
  const [ideas, setIdeas] = createSignal<TrellisRecoverableIdea[]>([])
  const [busy, setBusy] = createSignal<string | undefined>()

  onMount(() => {
    void trellis.fetchIdeas().then(setIdeas)
  })

  const resurrect = async (id: string) => {
    setBusy(id)
    await trellis.resurrectIdea(id)
    setBusy(undefined)
    void trellis.fetchIdeas().then(setIdeas)
  }

  const badge = (type: string) => {
    const colors: Record<string, string> = {
      rejected_plan: "bg-surface-raised-base text-text-danger",
      archived_conversation: "bg-surface-raised-base text-text-info",
      unexplored_alternative: "bg-surface-raised-base text-text-warning",
    }
    const labels: Record<string, string> = {
      rejected_plan: "Plan",
      archived_conversation: "Conversation",
      unexplored_alternative: "Alternative",
    }
    return { class: `rounded-full px-2 py-0.5 text-10-medium ${colors[type] ?? ""}`, label: labels[type] ?? type }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Recoverable Ideas</div>
        <Button size="small" variant="ghost" onClick={() => void trellis.fetchIdeas().then(setIdeas)}>
          Refresh
        </Button>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={ideas().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <div class="text-12-regular">No recoverable ideas found</div>
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={ideas()}>
              {(idea) => {
                const b = badge(idea.type)
                return (
                  <div class="flex items-start gap-3 px-3 py-3 border-b border-border-weaker-base">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class={b.class}>{b.label}</span>
                        <span class="text-11-regular text-text-weaker">{timeAgo(idea.createdAt)}</span>
                      </div>
                      <div class="text-12-medium text-text-strong">{idea.title}</div>
                      <Show when={idea.description}>
                        <div class="text-11-regular text-text-weak mt-0.5 line-clamp-2">{idea.description}</div>
                      </Show>
                    </div>
                    <Show when={idea.type === "rejected_plan"}>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => resurrect(idea.id)}
                        disabled={busy() === idea.id}
                      >
                        Resurrect
                      </Button>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Conversations Tab (Phase 6 — Agent Memory)
// ---------------------------------------------------------------------------

function ConversationsTab() {
  const trellis = useTrellis()
  const [convos, setConvos] = createSignal<TrellisConversation[]>([])

  onMount(() => {
    void trellis.fetchConversations().then(setConvos)
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1">Agent Conversations</div>
        <Button size="small" variant="ghost" onClick={() => void trellis.fetchConversations().then(setConvos)}>
          Refresh
        </Button>
      </div>
      <div class="flex-1 overflow-auto">
        <Show
          when={convos().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-8 text-text-weak">
              <div class="text-12-regular">No conversations yet</div>
            </div>
          }
        >
          <div class="flex flex-col">
            <For each={convos()}>
              {(c) => (
                <div class="flex items-center gap-3 px-3 py-2.5 border-b border-border-weaker-base hover:bg-surface-raised-base/50 transition-colors">
                  <Icon name="chat" size="small" class="text-icon-weak shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="text-12-medium text-text-strong truncate">{c.title}</div>
                    <div class="text-11-regular text-text-weak">{c.messageCount} messages</div>
                  </div>
                  <span class="rounded-full px-2 py-0.5 text-10-medium bg-surface-raised-base text-text-weak">
                    {c.status}
                  </span>
                  <span class="text-11-regular text-text-weaker">{timeAgo(c.createdAt)}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diff Panel (Phase 6)
// ---------------------------------------------------------------------------

function DiffPanel(props: { hash: string; onClose: () => void }) {
  const trellis = useTrellis()
  const [diff] = createResource(
    () => props.hash,
    (h) => trellis.diffFromOp(h),
    { initialValue: undefined },
  )
  const data = () => (diff.loading ? undefined : diff.latest)

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
        <div class="text-12-medium text-text-weak flex-1 truncate">Diff: {props.hash.slice(0, 16)}...</div>
        <IconButton icon="close-small" variant="ghost" onClick={props.onClose} />
      </div>
      <div class="flex-1 overflow-auto p-3">
        <Show when={diff.loading}>
          <div class="flex items-center gap-2 py-4 text-text-weak">
            <Spinner /> Loading diff...
          </div>
        </Show>
        <Show when={data()}>
          {(d) => (
            <div class="flex flex-col gap-3">
              <Show when={d().added.length > 0}>
                <div class="flex flex-col gap-1">
                  <div class="text-11-medium uppercase tracking-wide text-text-success">Added ({d().added.length})</div>
                  <For each={d().added}>
                    {(f) => (
                      <div class="text-12-mono text-text-success/80 px-2 py-0.5 rounded bg-surface-raised-base/50">
                        + {f}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={d().removed.length > 0}>
                <div class="flex flex-col gap-1">
                  <div class="text-11-medium uppercase tracking-wide text-text-danger">
                    Removed ({d().removed.length})
                  </div>
                  <For each={d().removed}>
                    {(f) => (
                      <div class="text-12-mono text-text-danger/80 px-2 py-0.5 rounded bg-surface-raised-base/50">
                        - {f}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={d().modified.length > 0}>
                <div class="flex flex-col gap-1">
                  <div class="text-11-medium uppercase tracking-wide text-text-warning">
                    Modified ({d().modified.length})
                  </div>
                  <For each={d().modified}>
                    {(f) => (
                      <div class="text-12-mono text-text-warning/80 px-2 py-0.5 rounded bg-surface-raised-base/50">
                        ~ {f}
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={!diff.loading && !data()}>
          <div class="text-12-regular text-text-weaker py-4">No diff data available for this op.</div>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared tab button style
// ---------------------------------------------------------------------------

const tabBtn = (active: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-12-medium transition-colors ${
    active
      ? "bg-surface-raised-base text-text-strong"
      : "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50"
  }`

// ---------------------------------------------------------------------------
// Chart primitives (lightweight inline SVG)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  "text-success": "#22c55e",
  "text-warning": "#eab308",
  "text-info": "#3b82f6",
  "[#bc8cff]": "#bc8cff",
  "text-weak": "#71717a",
}

function resolveColor(raw: string) {
  return STATUS_COLORS[raw] ?? raw
}

function DonutChart(props: { segments: { value: number; color: string }[]; size: number; total: number }) {
  const r = () => props.size / 2 - 4
  const cx = () => props.size / 2
  const cy = () => props.size / 2
  const circ = () => 2 * Math.PI * r()

  return (
    <svg width={props.size} height={props.size} class="shrink-0">
      <circle cx={cx()} cy={cy()} r={r()} fill="none" stroke="var(--border-base)" stroke-width="6" opacity="0.3" />
      {(() => {
        let offset = 0
        return props.segments.map((seg) => {
          const pct = seg.value / props.total
          const len = pct * circ()
          const gap = circ() - len
          const el = (
            <circle
              cx={cx()}
              cy={cy()}
              r={r()}
              fill="none"
              stroke={resolveColor(seg.color)}
              stroke-width="6"
              stroke-dasharray={`${len} ${gap}`}
              stroke-dashoffset={-offset}
              transform={`rotate(-90 ${cx()} ${cy()})`}
              stroke-linecap="round"
            />
          )
          offset += len
          return el
        })
      })()}
      <text
        x={cx()}
        y={cy()}
        text-anchor="middle"
        dominant-baseline="central"
        class="text-12-medium"
        fill="var(--text-strong)"
      >
        {props.total}
      </text>
    </svg>
  )
}

function HeroGauge(props: { value: number }) {
  const [drawn, setDrawn] = createSignal(false)
  onMount(() => requestAnimationFrame(() => setDrawn(true)))
  const size = 120
  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2
  const circ = Math.PI * r
  const len = () => (drawn() ? props.value : 0) * circ
  const gap = () => circ - len()
  const color = () => (props.value >= 0.7 ? "#22c55e" : props.value >= 0.4 ? "#eab308" : "#ef4444")
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
      <path
        d={`M 8 ${cy} A ${r} ${r} 0 0 1 ${size - 8} ${cy}`}
        fill="none"
        stroke="var(--border-base)"
        stroke-width="8"
        opacity="0.2"
        stroke-linecap="round"
      />
      <path
        d={`M 8 ${cy} A ${r} ${r} 0 0 1 ${size - 8} ${cy}`}
        fill="none"
        stroke={color()}
        stroke-width="8"
        stroke-dasharray={`${len()} ${gap()}`}
        stroke-linecap="round"
        style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      />
      <text
        x={cx}
        y={cy - 2}
        text-anchor="middle"
        dominant-baseline="central"
        class="text-24-medium"
        fill="var(--text-strong)"
      >
        {Math.round(props.value * 100)}
      </text>
    </svg>
  )
}

function ScoreFactor(props: { label: string; value: number }) {
  const dot = () => (props.value >= 0.7 ? "bg-text-success" : props.value >= 0.4 ? "bg-text-warning" : "bg-text-danger")
  return (
    <div class="flex items-center gap-2">
      <div class={`size-1.5 rounded-full shrink-0 ${dot()}`} />
      <span class="text-11-regular text-text-weak flex-1">{props.label}</span>
      <span class="text-11-medium text-text-base tabular-nums">{Math.round(props.value * 100)}%</span>
    </div>
  )
}

function PipelineBar(props: { status: string; count: number; total: number }) {
  const [pct, setPct] = createSignal(0)
  onMount(() => requestAnimationFrame(() => setPct(props.total > 0 ? (props.count / props.total) * 100 : 0)))
  const fill = () => {
    if (props.status === "closed") return "bg-text-success/70"
    if (props.status === "in_progress") return "bg-text-warning/70"
    if (props.status === "queue") return "bg-text-info/70"
    if (props.status === "paused") return "bg-[#bc8cff]/70"
    return "bg-text-weak/40"
  }
  return (
    <div class="flex items-center gap-3">
      <div class="w-20 text-11-regular text-text-weak capitalize shrink-0">{props.status.replace("_", " ")}</div>
      <div class="flex-1 h-1.5 rounded-full bg-border-base/20 overflow-hidden">
        <div
          class={`h-full rounded-full ${fill()}`}
          style={{ width: `${pct()}%`, transition: "width 0.5s ease-out" }}
        />
      </div>
      <div class="text-11-medium text-text-base tabular-nums w-4 text-right shrink-0">{props.count}</div>
    </div>
  )
}

function InnerNav(props: {
  title: string
  items: { id: string; label: string; icon?: string; badge?: number }[]
  tab: string
  setTab: (tab: string) => void
}) {
  return (
    <aside class="w-full shrink-0 border-b border-border-weaker-base bg-surface-raised-base/00 px-2 py-2 flex gap-1 overflow-x-auto no-scrollbar lg:w-56 lg:border-b-0 lg:border-r lg:py-3 lg:flex-col lg:overflow-y-auto">
      <div class="hidden px-2 pb-2 text-10-medium uppercase tracking-wide text-text-weaker lg:block">{props.title}</div>
      <For each={props.items}>
        {(item) => (
          <button
            class="h-8 shrink-0 flex items-center gap-1.5 rounded-md px-2.5 text-left text-11-medium transition-colors lg:h-auto lg:w-full lg:gap-2 lg:py-2 lg:text-12-medium"
            classList={{
              "bg-surface-raised-base text-text-strong": props.tab === item.id,
              "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": props.tab !== item.id,
            }}
            onClick={() => props.setTab(item.id)}
          >
            <Show when={item.icon}>
              <Icon name={item.icon!} size="small" class="text-icon-weak shrink-0" />
            </Show>
            <span class="truncate lg:flex-1">{item.label}</span>
            <Show when={(item.badge ?? 0) > 0}>
              <span class="rounded-full min-w-4 h-4 px-1 flex items-center justify-center bg-text-danger text-[10px] text-white font-medium">
                {item.badge}
              </span>
            </Show>
          </button>
        )}
      </For>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// InsightsView — velocity / throughput charts for Plan tab
// ---------------------------------------------------------------------------

function InsightsView() {
  const trellis = useTrellis()

  const weekly = createMemo(() => {
    const buckets = new Map<string, { created: number; closed: number }>()
    const now = Date.now()
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now - i * 7 * 86_400_000)
      const key = `W${Math.ceil(d.getDate() / 7)}`
      buckets.set(key, { created: 0, closed: 0 })
    }
    for (const issue of trellis.issues) {
      if (!issue.createdAt) continue
      const d = new Date(issue.createdAt)
      const age = Math.floor((now - d.getTime()) / (7 * 86_400_000))
      if (age > 7 || age < 0) continue
      const key = `W${Math.ceil(d.getDate() / 7)}`
      const b = buckets.get(key)
      if (b) b.created++
      if (issue.status === "closed" && b) b.closed++
    }
    return [...buckets.entries()].map(([label, v]) => ({ label, ...v }))
  })

  const max = createMemo(() => {
    let m = 1
    for (const w of weekly()) {
      if (w.created > m) m = w.created
      if (w.closed > m) m = w.closed
    }
    return m
  })

  const byPriority = createMemo(() => {
    const counts: Record<string, number> = {}
    for (const issue of trellis.issues) {
      counts[issue.priority] = (counts[issue.priority] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  })

  const byStatus = createMemo(() => {
    const counts: Record<string, number> = {}
    for (const issue of trellis.issues) {
      counts[issue.status] = (counts[issue.status] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  })

  const statusColor = (s: string) => {
    if (s === "closed") return "bg-text-success/70"
    if (s === "in_progress") return "bg-text-warning/70"
    if (s === "queue") return "bg-text-info/70"
    if (s === "paused") return "bg-[#bc8cff]/70"
    return "bg-text-weak/40"
  }

  const priorityColor = (p: string) => {
    if (p === "critical") return "bg-text-error/70"
    if (p === "high") return "bg-text-warning/70"
    if (p === "medium") return "bg-text-info/70"
    return "bg-text-weak/40"
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto px-4 py-4 gap-6">
      {/* Weekly throughput */}
      <div class="flex flex-col gap-2">
        <SectionHeader label="Weekly Throughput" size="small" />
        <div class="flex items-end gap-1 h-24">
          <For each={weekly()}>
            {(w) => (
              <div class="flex-1 flex flex-col items-center gap-0.5">
                <div class="w-full flex gap-px justify-center" style={{ height: "80px" }}>
                  <div
                    class="w-2 rounded-t bg-text-info/60 self-end transition-all"
                    style={{ height: `${(w.created / max()) * 100}%` }}
                    title={`Created: ${w.created}`}
                  />
                  <div
                    class="w-2 rounded-t bg-text-success/60 self-end transition-all"
                    style={{ height: `${(w.closed / max()) * 100}%` }}
                    title={`Closed: ${w.closed}`}
                  />
                </div>
                <div class="text-[9px] text-text-weaker">{w.label}</div>
              </div>
            )}
          </For>
        </div>
        <div class="flex items-center gap-4 text-10-regular text-text-weaker">
          <div class="flex items-center gap-1">
            <div class="w-2 h-2 rounded-sm bg-text-info/60" />
            Created
          </div>
          <div class="flex items-center gap-1">
            <div class="w-2 h-2 rounded-sm bg-text-success/60" />
            Closed
          </div>
        </div>
      </div>

      {/* Priority breakdown */}
      <div class="flex flex-col gap-2">
        <SectionHeader label="By Priority" size="small" />
        <div class="flex flex-col gap-1.5">
          <For each={byPriority()}>
            {([label, count]) => {
              const pct = () => (trellis.issues.length > 0 ? (count / trellis.issues.length) * 100 : 0)
              return (
                <div class="flex items-center gap-2">
                  <div class="w-16 text-11-regular text-text-weak capitalize">{label}</div>
                  <div class="flex-1 h-2 rounded-full bg-surface-raised-base/50 overflow-hidden">
                    <div class={`h-full rounded-full ${priorityColor(label)}`} style={{ width: `${pct()}%` }} />
                  </div>
                  <div class="w-6 text-right text-11-medium text-text-base">{count}</div>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Status breakdown */}
      <div class="flex flex-col gap-2">
        <SectionHeader label="By Status" size="small" />
        <div class="flex flex-col gap-1.5">
          <For each={byStatus()}>
            {([label, count]) => {
              const pct = () => (trellis.issues.length > 0 ? (count / trellis.issues.length) * 100 : 0)
              return (
                <div class="flex items-center gap-2">
                  <div class="w-20 text-11-regular text-text-weak capitalize">{label.replace("_", " ")}</div>
                  <div class="flex-1 h-2 rounded-full bg-surface-raised-base/50 overflow-hidden">
                    <div class={`h-full rounded-full ${statusColor(label)}`} style={{ width: `${pct()}%` }} />
                  </div>
                  <div class="w-6 text-right text-11-medium text-text-base">{count}</div>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}

function decisionStyle(): JSX.CSSProperties {
  return {
    "border-left": "3px solid var(--text-accent)",
    "background-image":
      "linear-gradient(90deg, color-mix(in srgb, var(--text-accent) 12%, transparent), transparent 55%)",
  }
}

// ---------------------------------------------------------------------------
// PlanPanel — work-focused planning with Board and Milestones
// ---------------------------------------------------------------------------

export function PlanPanel(props: { todos?: Todo[] }) {
  const trellis = useTrellis()
  const [tab, setTab] = createSignal<PlanTab>("board")
  const items = createMemo(() => [
    { id: "board", label: "Board", icon: "checklist" },
    { id: "milestones", label: "Milestones", icon: "flag" },
  ])
  const active = createMemo(() => items().find((item) => item.id === tab()))

  const [boardQuery, setBoardQuery] = createSignal("")
  const [boardOrder, setBoardOrder] = createSignal<BoardOrder>("newest")
  const [boardCtrl, setBoardCtrl] = createSignal<TrellisBoardController | undefined>()
  const isBoard = () => tab() === "board"

  return (
    <ResizableSidebarLayout id="plan" defaultWidth={224}>
      <AffordanceShell
        id="plan"
        sidebarToggle
        padded={false}
        scroll={false}
        title={active()?.label ?? "Plan"}
        meta={`${trellis.issues.length} issues · ${trellis.milestones.length} milestones`}
        query={isBoard() ? boardQuery() : undefined}
        onQueryChange={isBoard() ? setBoardQuery : undefined}
        searchPlaceholder="Search issues…"
        sortOptions={isBoard() ? ORDER_OPTIONS.map((o) => ({ id: o.id, label: o.label })) : undefined}
        sortValue={isBoard() ? boardOrder() : undefined}
        onSortChange={isBoard() ? (id) => setBoardOrder(id as BoardOrder) : undefined}
        onRefresh={isBoard() ? () => boardCtrl()?.refresh() : undefined}
        refreshTitle="Refresh board"
        addLabel={isBoard() ? "Add issue" : undefined}
        onAdd={isBoard() ? () => boardCtrl()?.startCreate("backlog") : undefined}
        sidebar={
          <ResizableRouteSidebar title="Plan" meta={trellis.issues.length} width={224}>
            <RouteNav
              items={items().map((item) => ({
                id: item.id,
                label: item.label,
                icon: <Icon name={item.icon} size="small" class="text-icon-weak" />,
              }))}
              active={tab()}
              onSelect={(id) => setTab(id as PlanTab)}
              stagger
            />
          </ResizableRouteSidebar>
        }
      >
        <Show when={tab() === "board"}>
          <TrellisBoard
            todos={props.todos}
            hideToolbar
            query={boardQuery()}
            onQueryChange={setBoardQuery}
            order={boardOrder()}
            onOrderChange={setBoardOrder}
            onReady={setBoardCtrl}
          />
        </Show>
        <Show when={tab() === "milestones"}>
          <MilestoneList />
        </Show>
      </AffordanceShell>
    </ResizableSidebarLayout>
  )
}

// ---------------------------------------------------------------------------
// ExplorePanel — deep-dive: History, Branches, Decisions, Garden, Graph, Schema, Query, etc.
// ---------------------------------------------------------------------------

export function ExplorePanel() {
  return <LogsPanel />
}

type LogsTab = "history" | "decisions" | "branches"

export function LogsPanel() {
  const trellis = useTrellis()
  const [tab, setTab] = createSignal<LogsTab>("history")
  const items = createMemo(() => [
    { id: "history", label: "Ops", icon: "history", badge: trellis.ops.length },
    { id: "decisions", label: "Decisions", icon: "brain", badge: trellis.decisions.length },
    { id: "branches", label: "Branches", icon: "branch" },
  ])
  const active = createMemo(() => items().find((item) => item.id === tab()))

  return (
    <RouteView>
      <ResizableSidebarLayout id="logs" defaultWidth={224}>
        <RoutePanel>
          <ResizableRouteSidebar title="Logs" meta={trellis.ops.length + trellis.decisions.length} width={224}>
            <RouteNav
              items={items().map((item) => ({
                id: item.id,
                label: item.label,
                icon: <Icon name={item.icon} size="small" class="text-icon-weak" />,
                badge: item.badge && item.badge > 0 ? item.badge : undefined,
              }))}
              active={tab()}
              onSelect={(id) => setTab(id as LogsTab)}
              stagger
            />
          </ResizableRouteSidebar>
          <div class="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <RouteHeader sidebarToggle title={active()?.label ?? "Logs"} meta="Ops, decisions, and branches" />
            <RouteContent scroll={false}>
              <Show when={tab() === "history"}>
                <OpTimeline />
              </Show>
              <Show when={tab() === "decisions"}>
                <DecisionList />
              </Show>
              <Show when={tab() === "branches"}>
                <BranchManager />
              </Show>
            </RouteContent>
          </div>
        </RoutePanel>
      </ResizableSidebarLayout>
    </RouteView>
  )
}

import {
  For,
  Match,
  Show,
  Switch,
  Suspense,
  createEffect,
  createMemo,
  lazy,
  onCleanup,
  onMount,
  type JSX,
  batch,
  createResource,
} from "solid-js"
import { Portal } from "solid-js/web"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import {
  Folder,
  FilePlus,
  FolderPlus,
  ChevronsDownUp,
  ChevronsUpDown,
  RefreshCw,
  Kanban,
  Code,
  Rocket,
  ScrollText,
  MonitorPlay,
  Database,
  Layers,
  PencilRuler,
  Component,
  Box,
  Type,
  Image as ImageIcon,
  Network,
  Globe,
  Plus,
  X,
  PanelLeft,
  PanelBottom,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  SlidersHorizontal,
} from "lucide-solid"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { getFilename } from "@opencode-ai/util/path"
import { Persist, persisted } from "@/utils/persist"

import FileTree from "@/components/file-tree"
import { FileTreeContextMenu, useFileTreeContextMenu } from "@/components/file-tree-context-menu"
import { BrowserPanel } from "@/pages/session/browser-panel"
import { DatabasePanel } from "@/pages/session/database-panel"
import { CmsPanel } from "@/pages/session/cms-panel"
import { ProjectionPanel } from "@/pages/session/projection-panel"
import {
  allProjections,
  configuredCustomProjections,
  configuredProjectionPins,
  defaultProjectionPins,
  getProjection,
  listProjections,
  DEFAULT_PROJECTION_PINS,
  MAX_PROJECTION_PINS,
  normalizeProjectionPins,
  projectionPinsTarget,
  projectionWorkspaceTypeFromConfig,
} from "@/lib/projections"
import { projectionIcon } from "@/lib/projections/icons"
import type { ProjectionDefinition } from "@/lib/projections/types"
import { PreviewProvider } from "@/context/preview"
import { AgentSegment } from "@/components/status-bar/segments/agent-segment"
import { TerminalCountSegment } from "@/components/status-bar/segments/terminal-count-segment"
import { SessionContextUsage } from "@/components/session-context-usage"
import { SessionContextTab, SortableTab, FileVisual } from "@/components/session"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { useLayout } from "@/context/layout"
import { createCloudSandbox } from "@/context/cloud-sandbox"
import { useServer } from "@/context/server"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { isCloudWorkspaceReady, resolveFileTreePanelState } from "@/lib/file-tree-empty-state"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import { FilesGrid } from "@/pages/session/files-grid"
import { createOpenSessionFileTab, createSessionTabs, type Sizing, type TopTab } from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"
import { useSearchParams } from "@solidjs/router"
import { useSessionLayout } from "@/pages/session/session-layout"

const AssetsPanel = lazy(() =>
  import("@/pages/session/design-panel").then((module) => ({ default: module.AssetsPanel })),
)
const DesignPanel = lazy(() =>
  import("@/pages/session/design-panel").then((module) => ({ default: module.DesignPanel })),
)

function PanelLoading(props: { label: string }) {
  return <div class="flex h-full items-center justify-center text-12-regular text-text-weaker">{props.label}</div>
}

const TrellisLogo = (props: { class?: string }) => (
  <svg
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 800 800"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M373.362 226.643C388.087 211.919 411.96 211.919 426.684 226.643L573.37 373.324C588.094 388.047 588.094 411.92 573.37 426.644L426.684 573.324C411.96 588.048 388.087 588.048 373.362 573.324L226.677 426.644C211.952 411.92 211.952 388.047 226.677 373.324L373.362 226.643Z"
      fill="currentColor"
    />
    <path
      d="M586.658 513.282C594.02 505.921 605.956 505.921 613.318 513.282L686.659 586.621C694.021 593.983 694.021 605.919 686.659 613.28L613.318 686.619C605.956 693.981 594.02 693.981 586.658 686.619L513.317 613.28C505.955 605.919 505.955 593.983 513.317 586.621L586.658 513.282Z"
      fill="currentColor"
    />
    <path
      d="M286.501 586.454C293.957 593.909 293.957 605.997 286.501 613.453L213.5 686.452C206.044 693.907 193.956 693.907 186.5 686.452L113.499 613.453C106.043 605.997 106.043 593.909 113.499 586.454L186.5 513.455C193.956 506 206.044 506 213.5 513.455L286.501 586.454Z"
      fill="currentColor"
    />
    <path
      d="M406.524 93.4982C402.934 97.088 397.113 97.088 393.523 93.4982L356.523 56.499C352.933 52.9092 352.933 47.089 356.523 43.4992L393.523 6.50002C397.113 2.91025 402.934 2.91025 406.524 6.50003L443.524 43.4992C447.114 47.089 447.114 52.9092 443.524 56.499L406.524 93.4982Z"
      fill="currentColor"
    />
    <path
      d="M186.502 113.498C193.958 106.042 206.046 106.042 213.502 113.498L286.503 186.496C293.959 193.952 293.959 206.04 286.503 213.496L213.502 286.494C206.046 293.95 193.958 293.95 186.502 286.494L113.501 213.496C106.045 206.04 106.045 193.952 113.501 186.496L186.502 113.498Z"
      fill="currentColor"
    />
    <path
      d="M686.499 186.483C693.955 193.939 693.955 206.027 686.499 213.482L613.498 286.481C606.042 293.937 593.954 293.937 586.498 286.481L513.497 213.482C506.041 206.027 506.041 193.939 513.497 186.483L586.498 113.484C593.954 106.029 606.042 106.029 613.498 113.484L686.499 186.483Z"
      fill="currentColor"
    />
    <path
      d="M356.689 756.666C353.007 752.985 353.007 747.017 356.689 743.336L393.359 706.667C397.04 702.986 403.008 702.986 406.689 706.667L443.359 743.336C447.041 747.017 447.041 752.985 443.359 756.666L406.689 793.335C403.008 797.016 397.04 797.016 393.359 793.335L356.689 756.666Z"
      fill="currentColor"
    />
  </svg>
)

// Left icon rail item definitions
export type RailItem = {
  id: string
  label: string
  icon: () => JSX.Element
  tab: string
}

export const RAIL_ITEMS: RailItem[] = [
  {
    id: "graph",
    label: "Graph",
    tab: "graph",
    icon: () => <Network class="size-[18px]" />,
  },
  {
    id: "plan",
    label: "Plan",
    tab: "plan",
    icon: () => <Kanban class="size-[18px]" />,
  },
  {
    id: "code",
    label: "Code",
    tab: "code",
    icon: () => <Code class="size-[18px]" />,
  },
  {
    id: "cms",
    label: "Database",
    tab: "cms",
    icon: () => <Database class="size-[18px]" />,
  },
  {
    id: "assets",
    label: "Assets",
    tab: "assets",
    icon: () => <Folder class="size-[18px]" />,
  },
  {
    id: "design",
    label: "Design",
    tab: "design",
    icon: () => <PencilRuler class="size-[18px]" />,
  },
  {
    id: "browser",
    label: "Browser",
    tab: "browser",
    icon: () => <Globe class="size-[18px]" />,
  },
  {
    id: "logs",
    label: "Logs",
    tab: "logs",
    icon: () => <ScrollText class="size-[18px]" />,
  },
]

// V2 rail: collapses the 9-icon rail into 5 activity-mode icons.
//   Enable:   localStorage.setItem("trellis_nav_v2", "true") then refresh.
//   Rollback: localStorage.removeItem("trellis_nav_v2") then refresh.
// Spec: /specs/navigation-ia.md
export const RAIL_ITEMS_V2: RailItem[] = [
  {
    id: "graph",
    label: "Graph",
    tab: "graph",
    icon: () => <Network class="size-[18px]" />,
  },
  {
    id: "logs",
    label: "Logs",
    tab: "logs",
    icon: () => <ScrollText class="size-[18px]" />,
  },
  {
    id: "plan",
    label: "Plan",
    tab: "plan",
    icon: () => <Kanban class="size-[18px]" />,
  },
  {
    id: "code",
    label: "Code",
    tab: "code",
    icon: () => <Code class="size-[18px]" />,
  },
  {
    id: "cms",
    label: "Database",
    tab: "cms",
    icon: () => <Database class="size-[18px]" />,
  },
  {
    id: "assets",
    label: "Assets",
    tab: "assets",
    icon: () => <Folder class="size-[18px]" />,
  },
  {
    id: "design",
    label: "Design",
    tab: "design",
    icon: () => <PencilRuler class="size-[18px]" />,
  },
]

export type RailPreset = "general" | "web" | "backend" | "game" | "library"

export const DEFAULT_ORDER = ["graph", "plan", "code", "cms", "assets", "design", "browser", "logs"]

export type RailConfig = {
  preset: "auto" | RailPreset | "custom"
  order: string[]
  hidden: string[]
}

export const RAIL_PRESETS: Record<
  RailPreset,
  {
    label: string
    visible: string[]
  }
> = {
  general: {
    label: "General / Fullstack",
    visible: ["graph", "plan", "code", "cms", "assets", "design", "browser", "logs"],
  },
  web: {
    label: "Web Frontend",
    visible: ["code", "browser", "design", "plan", "cms", "graph", "logs", "assets"],
  },
  backend: {
    label: "Backend / API",
    visible: ["code", "cms", "logs", "plan", "graph", "assets"],
  },
  game: {
    label: "Game Development",
    visible: ["design", "code", "assets", "browser", "plan", "logs"],
  },
  library: {
    label: "Library / Package",
    visible: ["code", "logs", "plan", "graph", "assets"],
  },
}

export function useCustomRailItems(sdk: any, workspaceType: () => string | undefined) {
  const [scaffoldContext] = createResource(
    () => sdk.directory,
    async (dir) => {
      try {
        const res = await sdk.fetch(`/trellis/scaffold/context?directory=${encodeURIComponent(dir)}`)
        return (await res.json()) as {
          name: string
          language: string
          framework?: string
          buildTool?: string
          testRunner?: string
          confidence: number
        }
      } catch (e) {
        return null
      }
    },
    { initialValue: null },
  )

  const [railConfig, setRailConfig] = persisted(
    Persist.workspace(sdk.directory, "rail.custom_config"),
    createStore<RailConfig>({
      preset: "auto",
      order: [...DEFAULT_ORDER],
      hidden: [],
    }),
  )

  const activePreset = createMemo<RailPreset>(() => {
    if (railConfig.preset !== "auto" && railConfig.preset !== "custom") {
      return railConfig.preset as RailPreset
    }
    const wt = workspaceType()
    if (wt === "game" || wt === "gamedev" || wt === "game-dev") return "game"
    if (["marketing", "landing", "website", "saas", "tool", "product", "app"].includes(wt ?? "")) return "web"
    if (wt === "backend") return "backend"
    if (wt === "library") return "library"

    const ctx = scaffoldContext.latest
    if (ctx) {
      const framework = ctx.framework?.toLowerCase() ?? ""
      const lang = ctx.language?.toLowerCase() ?? ""
      if (
        framework &&
        [
          "react",
          "solid",
          "vue",
          "svelte",
          "nextjs",
          "nuxt",
          "astro",
          "remix",
          "angular",
          "gatsby",
          "eleventy",
        ].includes(framework)
      ) {
        return "web"
      }
      if (lang === "typescript" || lang === "javascript") {
        if (ctx.name?.toLowerCase().includes("game") || ctx.name?.toLowerCase().includes("phaser")) {
          return "game"
        }
      }
      if (["go", "rust", "python", "c++", "cpp", "c", "java"].includes(lang)) {
        return "backend"
      }
    }
    return "general"
  })

  const currentOrder = createMemo<string[]>(() => {
    if (railConfig.preset === "custom") {
      return railConfig.order
    }
    const presetKey = activePreset()
    const presetVisible = RAIL_PRESETS[presetKey].visible
    const remaining = DEFAULT_ORDER.filter((id) => !presetVisible.includes(id))
    return [...presetVisible, ...remaining]
  })

  const currentHidden = createMemo<string[]>(() => {
    if (railConfig.preset === "custom") {
      return railConfig.hidden
    }
    const presetKey = activePreset()
    const presetVisible = RAIL_PRESETS[presetKey].visible
    return DEFAULT_ORDER.filter((id) => !presetVisible.includes(id))
  })

  return {
    railConfig,
    setRailConfig,
    activePreset,
    currentOrder,
    currentHidden,
  }
}

// Moved to @/lib/nav-flag — re-exported here so existing imports keep working.
// Spec: /specs/navigation-ia.md
import { isNavV2Enabled } from "@/lib/nav-flag"
export { isNavV2Enabled }

const PROJECTION_RAIL_BUTTON_CLASS =
  "flex h-9 w-12 items-center justify-center rounded-md transition-colors md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]"

function projectionRailButtonClass(active: boolean) {
  return {
    "bg-surface-raised-base text-text-strong": active,
    "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": !active,
  }
}

function ProjectionRailPin(props: {
  projection: ProjectionDefinition
  active: boolean
  canUnpin: boolean
  onOpen: () => void
  onUnpin: () => void
  placement?: "right" | "top"
}) {
  return (
    <div class="relative group/proj-pin">
      <Tooltip placement={props.placement ?? "right"} value={props.projection.label}>
        <button
          type="button"
          class={PROJECTION_RAIL_BUTTON_CLASS}
          classList={projectionRailButtonClass(props.active)}
          onClick={props.onOpen}
          aria-label={props.projection.label}
          aria-pressed={props.active}
        >
          {projectionIcon(props.projection.icon)()}
        </button>
      </Tooltip>
      <Tooltip
        placement="right"
        value={props.canUnpin ? `Remove ${props.projection.label} from rail` : "Keep at least one projection pinned"}
      >
        <button
          type="button"
          class="absolute -top-1 -right-1 z-[1] flex size-4 items-center justify-center rounded-full border border-border-weaker-base bg-surface-raised-stronger-non-alpha text-text-weaker shadow-sm opacity-0 pointer-events-none transition-opacity transition-colors group-hover/proj-pin:opacity-100 group-hover/proj-pin:pointer-events-auto group-focus-within/proj-pin:opacity-100 group-focus-within/proj-pin:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:bg-surface-raised-base hover:text-text-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-weak-base disabled:pointer-events-none disabled:opacity-40"
          disabled={!props.canUnpin}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            props.onUnpin()
          }}
          aria-label={`Unpin ${props.projection.label}`}
        >
          <X class="size-2.5" strokeWidth={2.5} />
        </button>
      </Tooltip>
    </div>
  )
}

function ProjectionPickerIcon(props: { projection: ProjectionDefinition; onRail: boolean; active: boolean }) {
  return (
    <span
      class="flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4 md:[&_svg]:size-[18px]"
      classList={props.onRail ? projectionRailButtonClass(props.active) : { "text-text-weak": true }}
      aria-hidden="true"
    >
      {projectionIcon(props.projection.icon)()}
    </span>
  )
}

function ProjectionPickerItem(props: {
  projection: ProjectionDefinition
  pinned: boolean
  active: boolean
  onToggle: (pinned: boolean) => void
}) {
  return (
    <DropdownMenu.CheckboxItem
      checked={props.pinned}
      onChange={props.onToggle}
      closeOnSelect={false}
      classList={{
        "bg-surface-raised-base/50": props.pinned,
      }}
    >
      <ProjectionPickerIcon projection={props.projection} onRail={props.pinned} active={props.active} />
      <DropdownMenu.ItemLabel class="flex min-w-0 flex-1 items-center gap-2">
        <span class="truncate">{props.projection.label}</span>
        <Show when={props.projection.comingSoon}>
          <span class="shrink-0 rounded-full bg-surface-raised-base px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-text-weaker">
            Soon
          </span>
        </Show>
        <Show when={props.pinned}>
          <span class="shrink-0 text-10-medium text-text-weaker">On rail</span>
        </Show>
      </DropdownMenu.ItemLabel>
      <DropdownMenu.ItemIndicator />
    </DropdownMenu.CheckboxItem>
  )
}

// Rail button component
function RailButton(props: {
  item: RailItem
  active: boolean
  onClick: () => void
  badge?: number
  badgeVariant?: "alert" | "change"
  placement?: "right" | "top"
}) {
  const bottom = () => props.placement === "top"
  return (
    <div class="relative">
      <Tooltip placement={props.placement ?? "right"} value={props.item.label}>
        <button
          class="relative flex h-9 min-w-12 items-center justify-center gap-0.5 rounded-md px-1.5 transition-colors [&_svg]:size-4 md:size-9 md:min-w-0 md:px-0 md:[&_svg]:size-[18px]"
          classList={{
            "bg-surface-raised-stronger-non-alpha text-text-strong shadow-sm ring-1 ring-inset ring-border-strong-base/70":
              props.active,
            "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": !props.active,
          }}
          onClick={props.onClick}
          aria-label={props.item.label}
          aria-pressed={props.active}
        >
          {props.item.icon()}
          <span class="text-[9px] font-medium leading-none md:hidden">{props.item.label}</span>
          {/* Change / alert badge */}
          <Show when={props.badge && props.badge > 0}>
            <span
              class="absolute -top-1 -right-1 min-w-[15px] h-[15px] flex items-center justify-center text-[9px] font-bold rounded-full px-1 tabular-nums ring-2 ring-surface-raised-base"
              classList={{
                "bg-[rgb(239,68,68)] text-white": props.badgeVariant !== "change",
                "bg-[var(--text-accent,var(--border-strong-base))] text-background-base":
                  props.badgeVariant === "change",
              }}
            >
              {props.badge! > 9 ? "9+" : props.badge}
            </span>
          </Show>
        </button>
      </Tooltip>
    </div>
  )
}

// Simple tab component (non-sortable)
function SimpleTab(props: { tab: string; onTabClose: (tab: string) => void }): JSX.Element {
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const path = createMemo(() => file.pathFromTab(props.tab))
  const dirty = createMemo(() => {
    const value = path()
    if (!value) return false
    return file.dirty(value)
  })
  const content = createMemo(() => {
    const value = path()
    if (!value) return
    return <FileVisual path={value} dirty={dirty()} />
  })
  const close = () => {
    if (dirty() && typeof window !== "undefined" && !window.confirm("Discard unsaved changes?")) return
    props.onTabClose(props.tab)
  }
  return (
    <div class="h-full flex items-center">
      <Tabs.Trigger
        value={props.tab}
        closeButton={
          <TooltipKeybind
            title={language.t("common.closeTab")}
            keybind={command.keybind("tab.close")}
            placement="bottom"
            gutter={10}
          >
            <IconButton
              icon="close-small"
              variant="ghost"
              class="h-5 w-5"
              onClick={close}
              aria-label={language.t("common.closeTab")}
            />
          </TooltipKeybind>
        }
        hideCloseButton
        onMiddleClick={close}
      >
        <Show when={content()}>{(value) => value()}</Show>
      </Tabs.Trigger>
    </div>
  )
}

export function SessionSidePanel(props: {
  reviewPanel: () => JSX.Element
  planPanel: () => JSX.Element
  logsPanel: () => JSX.Element
  shipPanel: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
}) {
  const layout = useLayout()
  const sdk = useSDK()
  const sync = useSync()
  const server = useServer()
  const cloud = createCloudSandbox()
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const fileTreeMenu = useFileTreeContextMenu({
    onFileCreated: (path) => openTab(file.tab(path)),
    onFileDeleted: (path, kind) => {
      const all = tabs().all()
      for (const tab of all) {
        const p = file.pathFromTab(tab)
        if (!p) continue
        const match = kind === "dir" ? p === path || p.startsWith(path + "/") : p === path
        if (match) tabs().close(tab)
      }
    },
  })
  const { params, sessionKey, tabs, view } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")

  // Desktop icon rail docks to the bottom by default; users can move it to the left.
  const [railStore, setRailStore] = persisted(
    Persist.global("session.rail", ["session.rail.v1"]),
    createStore<{ position: "left" | "bottom" }>({ position: "bottom" }),
  )
  const railBottom = createMemo(() => railStore.position === "bottom")
  const railTooltipPlacement = createMemo<"right" | "top">(() => (railBottom() ? "top" : "right"))

  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const fileOpen = createMemo(() => isDesktop() && layout.fileTree.opened())
  const reviewTab = createMemo(() => isDesktop())
  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const diffs = createMemo(() => (params.id ? (sync.data.session_diff[params.id] ?? []) : []))
  const reviewCount = createMemo(() => Math.max(info()?.summary?.files ?? 0, diffs().length))
  const hasReview = createMemo(() => reviewCount() > 0)
  const diffFiles = createMemo(() => diffs().map((d) => d.file))

  // Change badges: classify diffed entities into the affordance they belong to so each
  // affordance can surface a count when its entities changed this session.
  const surfaceChangeCounts = createMemo(() => {
    const counts = { code: 0, assets: 0, design: 0 }
    for (const path of diffFiles()) {
      const p = path.toLowerCase()
      if (p.endsWith(".whiteboard") || p.endsWith(".excalidraw")) counts.design++
      else if (/\.(png|jpe?g|gif|webp|avif|svg|mp4|mov|webm|mp3|wav|ogg|flac|glb|gltf|fbx|obj|ttf|otf|woff2?)$/.test(p))
        counts.assets++
      else counts.code++
    }
    const total = diffFiles().length
    return { ...counts, graph: total, review: reviewCount() }
  })
  const railBadgeFor = (id: string): { count: number; variant: "alert" | "change" } | undefined => {
    const s = surfaceChangeCounts()
    if (id === "review") return s.review > 0 ? { count: s.review, variant: "alert" } : undefined
    if (id === "graph") return s.graph > 0 ? { count: s.graph, variant: "change" } : undefined
    if (id === "code") return s.code > 0 ? { count: s.code, variant: "change" } : undefined
    if (id === "assets") return s.assets > 0 ? { count: s.assets, variant: "change" } : undefined
    if (id === "design") return s.design > 0 ? { count: s.design, variant: "change" } : undefined
    return undefined
  }
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (p: string) => p.replaceAll("\\\\", "/").replace(/\/+$/, "")

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string, detail?: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
        <Show when={detail}>
          <div class="text-11-regular text-text-weaker max-w-[220px]">{detail}</div>
        </Show>
      </div>
    </div>
  )

  const fileTreePanel = createMemo(() =>
    resolveFileTreePanelState({
      root: file.tree.state(""),
      childCount: file.tree.children("").length,
      syncLoading: sync.status === "loading",
      serverHealthy: server.healthy(),
      cloudActive: cloud.active,
      cloudStatus: cloud.active ? cloud.status() : undefined,
    }),
  )

  let workspaceReady = false
  let treeDirectory = ""
  createEffect(() => {
    const dir = sdk.directory
    const ready =
      server.healthy() === true && sync.status !== "loading" && (!cloud.active || isCloudWorkspaceReady(cloud.status()))
    const directoryChanged = treeDirectory !== dir
    if (directoryChanged) {
      treeDirectory = dir
      workspaceReady = false
    }
    if (ready && (!workspaceReady || directoryChanged)) void file.tree.refresh("")
    workspaceReady = ready
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const handleFileClick = (node: FileNode) => {
    const filePath = node.path
    const tab = file.tab(filePath)

    if (store.clickTimeout !== undefined) {
      clearTimeout(store.clickTimeout)
      setStore("clickTimeout", undefined)
      if (store.pendingFile === filePath) {
        openTab(tab)
        setStore("pendingFile", undefined)
        return
      }
    }

    setStore("pendingFile", filePath)
    setStore(
      "clickTimeout",
      window.setTimeout(() => {
        const currentActive = activeFileTab()
        if (currentActive && currentActive !== "context" && currentActive !== "empty") {
          tabs().close(currentActive)
        }
        openTab(tab)
        setStore("clickTimeout", undefined)
        setStore("pendingFile", undefined)
      }, 300),
    )
  }

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
  const activeTopTab = tabState.activeTopTab
  const activeFileTab = tabState.activeFileTab
  const activePath = createMemo(() => {
    const tab = activeFileTab()
    if (!tab) return
    return file.pathFromTab(tab)
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const routeTab = createMemo((): TopTab => {
    const v = searchParams.view
    if (v === "projection") return "projection"
    if (v === "home") return "graph"
    if (v === "graph") return "graph"
    if (v === "plan") return "plan"
    if (v === "preview") return "browser"
    if (v === "browser") return "browser"
    if (v === "code") return "code"
    if (v === "data") return "graph"
    if (v === "logs" || v === "explore") return "logs"
    if (v === "review") return "review"
    if (v === "cms") return "cms"
    if (v === "assets") return "assets"
    if (v === "design") return "design"
    return "graph"
  })

  const open = createMemo(() => {
    if (!isDesktop()) return true
    if (routeTab() === "review") return reviewOpen()
    // Graph, plan, browser, cms, code, etc. stay interactive without opening the review drawer.
    return true
  })
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    return "calc(100%)"
  })

  const projectionLens = createMemo(() => {
    if (routeTab() !== "projection") return null
    const lens = searchParams.lens
    return typeof lens === "string" && lens.trim() ? lens.trim() : "whiteboards"
  })

  const configuredPins = createMemo(() => configuredProjectionPins(sync.data.config))
  const customProjections = createMemo(() => configuredCustomProjections(sync.data.config))
  const workspaceType = createMemo(() => projectionWorkspaceTypeFromConfig(sync.data.config))
  const defaultPins = createMemo(() =>
    normalizeProjectionPins(configuredPins() ?? defaultProjectionPins(workspaceType())),
  )

  const [pinStore, setPinStore] = persisted(
    projectionPinsTarget(params.dir ?? ""),
    createStore<{ ids: string[] }>({ ids: defaultPins().length ? defaultPins() : [...DEFAULT_PROJECTION_PINS] }),
  )
  const projectionPins = createMemo(() => normalizeProjectionPins(pinStore.ids))
  const pinnedProjections = createMemo(() => listProjections(projectionPins(), customProjections()))
  const canUnpinProjection = createMemo(() => projectionPins().length > 1)
  const projectionPickerSections = createMemo(() => {
    const custom = customProjections()
    const pinnedIds = projectionPins()
    const pinnedSet = new Set(pinnedIds)
    const pinned = listProjections(pinnedIds, custom)
    const workspaceIds = new Set(custom.filter((entry) => entry.source === "workspace").map((entry) => entry.id))
    const available = allProjections(custom)
      .filter((projection) => !pinnedSet.has(projection.id) && !workspaceIds.has(projection.id))
      .sort((a, b) => a.label.localeCompare(b.label))
    const customAvailable = custom
      .filter((projection) => projection.source === "workspace" && !pinnedSet.has(projection.id))
      .sort((a, b) => a.label.localeCompare(b.label))
    return { pinned, available, custom: customAvailable }
  })

  createEffect(() => {
    const normalized = normalizeProjectionPins(pinStore.ids)
    const desired = defaultPins()
    const hasConfiguredPins = !!configuredPins()
    const stillLegacyDefault = normalized.length === 1 && (normalized[0] === "notes" || normalized[0] === "whiteboards")
    if ((hasConfiguredPins || stillLegacyDefault) && desired.join("|") !== normalized.join("|")) {
      setPinStore("ids", desired)
      return
    }
    if (normalized.join("|") !== pinStore.ids.join("|")) {
      setPinStore("ids", normalized)
    }
  })

  const openProjection = (lens: string) => {
    // Gate unfinished affordances: surface a toast instead of routing into a
    // placeholder shell so users know the lens is still being built.
    const def = getProjection(lens, customProjections())
    if (def?.comingSoon) {
      showToast({
        title: `${def.label} is under development`,
        description: def.description,
      })
      return
    }
    setSearchParams({ view: "projection", lens })
  }

  const toggleProjectionPin = (id: string, pinned: boolean) => {
    const ids = projectionPins()
    if (pinned) {
      if (ids.includes(id)) return
      // Don't let users pin an unfinished affordance to the rail — gate it.
      const def = getProjection(id, customProjections())
      if (def?.comingSoon) {
        showToast({
          title: `${def.label} is under development`,
          description: def.description,
        })
        return
      }
      if (ids.length >= MAX_PROJECTION_PINS) {
        showToast({
          title: "Pin limit reached",
          description: `You can pin at most ${MAX_PROJECTION_PINS} affordances on the rail.`,
        })
        return
      }
      setPinStore("ids", [...ids, id])
      openProjection(id)
      return
    }
    const next = ids.filter((entry) => entry !== id)
    if (next.length === 0) {
      showToast({
        title: "Keep one projection",
        description: "At least one projection must stay pinned.",
      })
      return
    }
    setPinStore("ids", next)
    if (projectionLens() === id) openProjection(next[0]!)
  }

  createEffect(() => {
    if (searchParams.view !== "home") return
    setSearchParams({ view: "graph" }, { replace: true })
  })

  const topTab = () => routeTab()
  const defaultTab = createMemo(() => (topTab() === "code" ? topTab() : "graph"))

  const treeWidth = createMemo(() => (fileOpen() && routeTab() === "code" ? `${layout.fileTree.width()}px` : "0px"))

  const fileTreeTab = () => layout.fileTree.tab()

  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  const [store, setStore] = createStore({
    clickTimeout: undefined as number | undefined,
    pendingFile: undefined as string | undefined,
  })

  // Skip global navigation/delete shortcuts when focus is in an input, textarea, select, or contenteditable.
  // Why: arrow keys and Cmd/Ctrl+Delete are legitimate edits inside text fields and menus — the file
  // explorer must not override them.
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    if (target.closest("[contenteditable='true']")) return true
    if (target.closest("input, textarea, select")) return true
    return false
  }

  // Keyboard shortcut for cmd+delete to delete files
  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return

    if ((e.metaKey || e.ctrlKey) && e.key === "Delete") {
      const path = activePath()
      if (path) {
        e.preventDefault()
        fileTreeMenu.deleteFile(path)
      }
      return
    }
  }

  onMount(() => window.addEventListener("keydown", onKeyDown))
  onCleanup(() => window.removeEventListener("keydown", onKeyDown))

  // Rail items logic
  const { railConfig, setRailConfig, activePreset, currentOrder, currentHidden } = useCustomRailItems(
    sdk,
    workspaceType,
  )

  const visibleRailItems = createMemo<RailItem[]>(() => {
    const order = currentOrder()
    const hidden = currentHidden()
    return order
      .filter((id) => !hidden.includes(id))
      .map((id) => RAIL_ITEMS.find((item) => item.id === id))
      .filter((item): item is RailItem => !!item)
  })

  const toggleVisibility = (id: string) => {
    batch(() => {
      let nextHidden = [...currentHidden()]
      if (nextHidden.includes(id)) {
        nextHidden = nextHidden.filter((x) => x !== id)
      } else {
        nextHidden.push(id)
      }
      setRailConfig({
        preset: "custom",
        order: [...currentOrder()],
        hidden: nextHidden,
      })
    })
  }

  const moveItem = (id: string, direction: "up" | "down") => {
    batch(() => {
      const order = [...currentOrder()]
      const index = order.indexOf(id)
      if (index === -1) return

      const nextIndex = direction === "up" ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= order.length) return

      const temp = order[index]
      order[index] = order[nextIndex]
      order[nextIndex] = temp

      setRailConfig({
        preset: "custom",
        order: order,
        hidden: [...currentHidden()],
      })
    })
  }

  const applyPreset = (preset: string) => {
    if (preset === "auto") {
      setRailConfig({
        preset: "auto",
        order: [...DEFAULT_ORDER],
        hidden: [],
      })
    } else {
      setRailConfig({
        preset: preset as RailPreset,
        order: [...DEFAULT_ORDER],
        hidden: [],
      })
    }
  }

  const renderRailItem = (item: RailItem) => {
    const isCode = item.id === "code"
    const onClick = () => {
      setSearchParams({ view: item.tab })
      if (isCode) {
        const first = openedTabs()[0]
        if (first) tabs().setActive(first)
        else if (contextOpen()) tabs().setActive("context")
        else tabs().setActive("empty")
      }
    }
    const badge = railBadgeFor(item.id)
    return (
      <RailButton
        item={item}
        active={routeTab() === item.tab}
        onClick={onClick}
        badge={badge?.count}
        badgeVariant={badge?.variant}
        placement={railTooltipPlacement()}
      />
    )
  }

  const railDivider = () => (
    <div
      class="hidden md:block bg-border-base/50 shrink-0 m-2"
      classList={{ "w-8 h-px": !railBottom(), "h-8 w-px": railBottom() }}
      aria-hidden="true"
    />
  )

  const projectionRailChrome = () => (
    <>
      <div
        class="hidden md:flex items-center gap-2"
        classList={{ "md:flex-col": !railBottom(), "md:flex-row": railBottom() }}
      >
        <For each={pinnedProjections()}>
          {(projection) => (
            <ProjectionRailPin
              projection={projection}
              active={projectionLens() === projection.id}
              canUnpin={canUnpinProjection()}
              onOpen={() => openProjection(projection.id)}
              onUnpin={() => toggleProjectionPin(projection.id, false)}
              placement={railTooltipPlacement()}
            />
          )}
        </For>
        <DropdownMenu gutter={8} placement={railBottom() ? "top-end" : "right-start"}>
          <Tooltip placement={railTooltipPlacement()} value="Affordances">
            <DropdownMenu.Trigger
              as="button"
              class="flex h-9 w-12 items-center justify-center rounded-md text-text-weaker transition-colors hover:text-text-base hover:bg-surface-raised-base/50 md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]"
              aria-label="Browse affordances"
            >
              <Plus class="size-[18px]" />
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="min-w-52 max-h-80 overflow-y-auto">
              <Show when={projectionPickerSections().pinned.length > 0}>
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel>On rail</DropdownMenu.GroupLabel>
                  <For each={projectionPickerSections().pinned}>
                    {(projection) => (
                      <ProjectionPickerItem
                        projection={projection}
                        pinned
                        active={projectionLens() === projection.id}
                        onToggle={(checked) => toggleProjectionPin(projection.id, checked)}
                      />
                    )}
                  </For>
                </DropdownMenu.Group>
              </Show>
              <Show when={projectionPickerSections().available.length > 0}>
                <Show when={projectionPickerSections().pinned.length > 0}>
                  <DropdownMenu.Separator />
                </Show>
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel>Add to rail</DropdownMenu.GroupLabel>
                  <For each={projectionPickerSections().available}>
                    {(projection) => (
                      <ProjectionPickerItem
                        projection={projection}
                        pinned={false}
                        active={false}
                        onToggle={(checked) => toggleProjectionPin(projection.id, checked)}
                      />
                    )}
                  </For>
                </DropdownMenu.Group>
              </Show>
              <Show when={projectionPickerSections().custom.length > 0}>
                <Show
                  when={projectionPickerSections().pinned.length > 0 || projectionPickerSections().available.length > 0}
                >
                  <DropdownMenu.Separator />
                </Show>
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel>Custom</DropdownMenu.GroupLabel>
                  <For each={projectionPickerSections().custom}>
                    {(projection) => (
                      <ProjectionPickerItem
                        projection={projection}
                        pinned={false}
                        active={false}
                        onToggle={(checked) => toggleProjectionPin(projection.id, checked)}
                      />
                    )}
                  </For>
                </DropdownMenu.Group>
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </>
  )

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  return (
    <PreviewProvider>
      <div
        class="flex h-full w-full min-w-0 flex-col overflow-hidden gap-1.5 p-1.5 rounded-[14px] border border-border-base/50 bg-panel md:gap-2 md:p-2 md:rounded-[16px]"
        data-ui-region="panel"
        classList={{ "md:flex-row": !railBottom(), "md:flex-col-reverse": railBottom() }}
      >
        {/* Affordance rail */}
        <div
          data-ui-region="chrome"
          data-ui-pattern="layout.rail"
          class="shrink-0 hidden md:flex items-center gap-0.5 no-scrollbar bg-transparent md:gap-2"
          classList={{
            "md:flex-col md:w-12 md:px-1.5 md:py-2 md:overflow-y-auto md:overflow-x-hidden": !railBottom(),
            "md:flex-row md:w-full md:px-2 md:py-1.5 md:overflow-x-auto md:overflow-y-hidden": railBottom(),
          }}
        >
          {/* Graph is always first and fixed */}
          {(() => {
            const graphItem = RAIL_ITEMS.find((it) => it.id === "graph")
            return graphItem ? renderRailItem(graphItem) : null
          })()}
          {railDivider()}

          <Show
            when={railBottom()}
            fallback={
              <>
                <For each={visibleRailItems().filter((it) => it.id !== "graph")}>{(item) => renderRailItem(item)}</For>
                {projectionRailChrome()}
                <div class="flex-1 min-h-0" aria-hidden="true" />
                <TerminalCountSegment variant="rail" tooltipPlacement={railTooltipPlacement()} />
              </>
            }
          >
            <div class="flex min-w-0 flex-1 items-center justify-start gap-0.5 md:gap-2">
              <For each={visibleRailItems().filter((it) => it.id !== "graph")}>{(item) => renderRailItem(item)}</For>
              {projectionRailChrome()}
            </div>
            <TerminalCountSegment variant="rail" tooltipPlacement={railTooltipPlacement()} />
          </Show>

          <DropdownMenu gutter={8} placement={railBottom() ? "top-end" : "right-start"}>
            <Tooltip placement={railTooltipPlacement()} value="Customize Rail">
              <DropdownMenu.Trigger
                as="button"
                class="flex h-9 w-12 items-center justify-center rounded-md text-text-weaker transition-colors hover:text-text-base hover:bg-surface-raised-base/50 md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]"
                aria-label="Customize Rail"
              >
                <SlidersHorizontal class="size-[18px]" />
              </DropdownMenu.Trigger>
            </Tooltip>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="min-w-64 max-h-[500px] overflow-y-auto p-3 flex flex-col gap-3 bg-panel border border-border-base rounded-lg shadow-lg">
                <div class="flex flex-col gap-1">
                  <span class="text-[12px] font-bold text-text-strong">Customize Rail</span>
                  <span class="text-[10px] font-medium text-text-weaker font-sans">Configure the sidebar layout</span>
                </div>

                <DropdownMenu.Separator />

                <div class="flex flex-col gap-1.5">
                  <span class="text-[10px] font-bold text-text-weaker uppercase tracking-wider font-sans">Position</span>
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setRailStore("position", "left")}
                      class="px-2 py-1.5 text-left text-[10px] font-medium rounded hover:bg-surface-raised-base transition-colors flex items-center gap-1.5 justify-between font-sans"
                      classList={{
                        "bg-surface-raised-stronger text-text-strong font-semibold": !railBottom(),
                        "bg-surface-raised-base/30 text-text-weak": railBottom(),
                      }}
                      aria-pressed={!railBottom()}
                    >
                      <span class="flex items-center gap-1.5 min-w-0">
                        <PanelLeft class="size-3.5 shrink-0" />
                        <span>Left</span>
                      </span>
                      <Show when={!railBottom()}>
                        <Check class="size-3 text-text-accent shrink-0" />
                      </Show>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRailStore("position", "bottom")}
                      class="px-2 py-1.5 text-left text-[10px] font-medium rounded hover:bg-surface-raised-base transition-colors flex items-center gap-1.5 justify-between font-sans"
                      classList={{
                        "bg-surface-raised-stronger text-text-strong font-semibold": railBottom(),
                        "bg-surface-raised-base/30 text-text-weak": !railBottom(),
                      }}
                      aria-pressed={railBottom()}
                    >
                      <span class="flex items-center gap-1.5 min-w-0">
                        <PanelBottom class="size-3.5 shrink-0" />
                        <span>Bottom</span>
                      </span>
                      <Show when={railBottom()}>
                        <Check class="size-3 text-text-accent shrink-0" />
                      </Show>
                    </button>
                  </div>
                </div>

                <DropdownMenu.Separator />

                {/* Presets */}
                <div class="flex flex-col gap-1.5">
                  <span class="text-[10px] font-bold text-text-weaker uppercase tracking-wider font-sans">Presets</span>
                  <div class="grid grid-cols-2 gap-1">
                    <For each={Object.entries(RAIL_PRESETS)}>
                      {([key, preset]) => (
                        <button
                          type="button"
                          onClick={() => applyPreset(key)}
                          class="px-2 py-1 text-left text-[10px] font-medium rounded hover:bg-surface-raised-base transition-colors flex items-center justify-between font-sans"
                          classList={{
                            "bg-surface-raised-stronger text-text-strong font-semibold":
                              railConfig.preset === key || (railConfig.preset === "auto" && activePreset() === key),
                            "bg-surface-raised-base/30 text-text-weak": !(
                              railConfig.preset === key ||
                              (railConfig.preset === "auto" && activePreset() === key)
                            ),
                          }}
                        >
                          <span class="truncate">{preset.label}</span>
                          <Show
                            when={railConfig.preset === key || (railConfig.preset === "auto" && activePreset() === key)}
                          >
                            <Check class="size-3 text-text-accent shrink-0" />
                          </Show>
                        </button>
                      )}
                    </For>
                    <button
                      type="button"
                      onClick={() => applyPreset("auto")}
                      class="col-span-2 px-2 py-1 text-left text-[10px] font-medium rounded hover:bg-surface-raised-base transition-colors flex items-center justify-between font-sans"
                      classList={{
                        "bg-surface-raised-stronger text-text-strong font-semibold": railConfig.preset === "auto",
                        "bg-surface-raised-base/30 text-text-weak": railConfig.preset !== "auto",
                      }}
                    >
                      <span>Auto-detect ({RAIL_PRESETS[activePreset()].label})</span>
                      <Show when={railConfig.preset === "auto"}>
                        <Check class="size-3 text-text-accent shrink-0" />
                      </Show>
                    </button>
                  </div>
                </div>

                <DropdownMenu.Separator />

                {/* Items List (Graph excluded - always fixed first) */}
                <div class="flex flex-col gap-1.5">
                  <span class="text-[10px] font-bold text-text-weaker uppercase tracking-wider font-sans">
                    Rail Items
                  </span>
                  <div class="flex flex-col gap-1">
                    <For each={currentOrder().filter((id) => id !== "graph")}>
                      {(id, index) => {
                        const item = RAIL_ITEMS.find((it) => id === it.id)
                        if (!item) return null
                        const isHidden = () => currentHidden().includes(id)
                        return (
                          <div class="flex items-center justify-between gap-2 px-1 py-0.5 rounded hover:bg-surface-raised-base/30">
                            {/* Visibility and label */}
                            <div class="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleVisibility(id)}
                                class="text-text-weaker hover:text-text-base transition-colors p-1"
                                aria-label={isHidden() ? "Show" : "Hide"}
                              >
                                <Show when={isHidden()} fallback={<Eye class="size-3.5" />}>
                                  <EyeOff class="size-3.5 opacity-50" />
                                </Show>
                              </button>
                              <span class="size-4 flex items-center justify-center shrink-0 [&_svg]:size-3.5">
                                {item.icon()}
                              </span>
                              <span
                                class="text-[11px] font-medium text-text-base truncate font-sans"
                                classList={{ "line-through opacity-50": isHidden() }}
                              >
                                {item.label}
                              </span>
                            </div>

                            {/* Reordering */}
                            <div class="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={index() === 0}
                                onClick={() => moveItem(id, "up")}
                                class="p-0.5 rounded text-text-weaker hover:text-text-base hover:bg-surface-raised-base disabled:opacity-30 disabled:hover:bg-transparent"
                                aria-label="Move Up"
                              >
                                <ChevronUp class="size-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index() === currentOrder().length - 1}
                                onClick={() => moveItem(id, "down")}
                                class="p-0.5 rounded text-text-weaker hover:text-text-base hover:bg-surface-raised-base disabled:opacity-30 disabled:hover:bg-transparent"
                                aria-label="Move Down"
                              >
                                <ChevronDown class="size-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>

          <AgentSegment variant="rail" tooltipPlacement={railTooltipPlacement()} />
        </div>

        <aside
          id="review-panel"
          aria-label={language.t("session.panel.reviewAndFiles")}
          aria-hidden={!open()}
          inert={!open()}
          class="relative min-w-0 min-h-0 flex-1 flex overflow-hidden bg-panel rounded-xl border border-border-weaker-base!"
          data-ui-region="panel"
          classList={{
            "pointer-events-none": !open(),
            "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
              !props.size.active() && !props.reviewSnap,
          }}
          style={{ width: panelWidth() }}
        >
          <div class="size-full min-w-0 h-full bg-well flex flex-col">
            <Show when={routeTab() === "plan"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                {props.planPanel()}
              </div>
            </Show>

            <Show when={routeTab() === "logs"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                {props.logsPanel()}
              </div>
            </Show>

            <Show when={routeTab() === "graph"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <DatabasePanel />
              </div>
            </Show>

            <Show when={routeTab() === "cms"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <CmsPanel />
              </div>
            </Show>

            <Show when={routeTab() === "assets"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <Suspense fallback={<PanelLoading label="Loading assets..." />}>
                  <AssetsPanel />
                </Suspense>
              </div>
            </Show>

            <Show when={routeTab() === "design"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <Suspense fallback={<PanelLoading label="Loading design..." />}>
                  <DesignPanel />
                </Suspense>
              </div>
            </Show>

            <Show when={routeTab() === "projection" && projectionLens()}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <ProjectionPanel lens={projectionLens()!} />
              </div>
            </Show>

            <Show when={routeTab() === "browser"}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                <BrowserPanel />
              </div>
            </Show>

            <Show when={routeTab() === "review" && reviewTab()}>
              <div class="flex-1 min-h-0 overflow-hidden contain-strict animate-in fade-in slide-in-from-right-4 duration-200">
                {props.reviewPanel()}
              </div>
            </Show>

            <div class={`flex-1 min-h-0 flex flex-row overflow-hidden ${routeTab() !== "code" ? "hidden" : ""}`}>
              <div
                id="file-tree-panel"
                aria-hidden={!fileOpen()}
                inert={!fileOpen()}
                class="relative min-w-0 h-full shrink-0 overflow-hidden"
                classList={{
                  "pointer-events-none": !fileOpen(),
                  "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
                    !props.size.active(),
                }}
                style={{ width: treeWidth() }}
              >
                <div
                  data-ui-region="sidebar"
                  data-ui-pattern="layout.split"
                  data-ui-slot="pane"
                  class="h-full flex flex-col overflow-hidden group/filetree border-r border-border-base/30 bg-sidebar"
                >
                  <div class="shrink-0 flex items-center justify-between gap-0.5 px-2 sm:px-3 h-10 sm:h-12 border-b border-border-weaker-base">
                    <span class="text-xs sm:text-sm font-medium text-text-weak pl-1 sm:pl-1.5 opacity-80 truncate">
                      Explorer
                    </span>
                    <div class="flex gap-0.5 sm:gap-1 flex-shrink-0">
                      <Tooltip value={language.t("session.fileTree.newFile")} placement="bottom" gutter={6}>
                        <button
                          class="flex items-center justify-center size-5 sm:size-6 rounded-md text-icon-weaker hover:text-icon-weak hover:bg-surface-raised-base/30 transition-colors"
                          onClick={() => {
                            void import("@/components/dialog-new-file-entry").then((x) => {
                              dialog.show(() => (
                                <x.DialogNewFileEntry
                                  kind="file"
                                  baseDir=""
                                  onCreated={(path) => openTab(file.tab(path))}
                                />
                              ))
                            })
                          }}
                          aria-label={language.t("session.fileTree.newFile")}
                        >
                          <FilePlus class="size-3 sm:size-3.5 opacity-70" />
                        </button>
                      </Tooltip>
                      <Tooltip value={language.t("session.fileTree.newFolder")} placement="bottom" gutter={6}>
                        <button
                          class="flex items-center justify-center size-5 sm:size-6 rounded-md text-icon-weaker hover:text-icon-weak hover:bg-surface-raised-base/30 transition-colors"
                          onClick={() => {
                            void import("@/components/dialog-new-file-entry").then((x) => {
                              dialog.show(() => <x.DialogNewFileEntry kind="folder" baseDir="" />)
                            })
                          }}
                          aria-label={language.t("session.fileTree.newFolder")}
                        >
                          <FolderPlus class="size-3 sm:size-3.5 opacity-70" />
                        </button>
                      </Tooltip>
                      <Tooltip value={language.t("session.fileTree.expandAll")} placement="bottom" gutter={6}>
                        <button
                          class="flex items-center justify-center size-5 sm:size-6 rounded-md text-icon-weaker hover:text-icon-weak hover:bg-surface-raised-base/30 transition-colors"
                          onClick={() => {
                            const walk = (dir: string) => {
                              for (const node of file.tree.children(dir)) {
                                if (node.type !== "directory") continue
                                file.tree.expand(node.path)
                                walk(node.path)
                              }
                            }
                            walk("")
                          }}
                          aria-label={language.t("session.fileTree.expandAll")}
                        >
                          <ChevronsUpDown class="size-3 sm:size-3.5 opacity-70" />
                        </button>
                      </Tooltip>
                      <Tooltip value={language.t("session.fileTree.collapseAll")} placement="bottom" gutter={6}>
                        <button
                          class="flex items-center justify-center size-5 sm:size-6 rounded-md text-icon-weaker hover:text-icon-weak hover:bg-surface-raised-base/30 transition-colors"
                          onClick={() => {
                            const walk = (dir: string) => {
                              for (const node of file.tree.children(dir)) {
                                if (node.type !== "directory") continue
                                walk(node.path)
                                file.tree.collapse(node.path)
                              }
                            }
                            walk("")
                          }}
                          aria-label={language.t("session.fileTree.collapseAll")}
                        >
                          <ChevronsDownUp class="size-3 sm:size-3.5 opacity-70" />
                        </button>
                      </Tooltip>
                      <Tooltip value={language.t("session.fileTree.refresh")} placement="bottom" gutter={6}>
                        <button
                          class="flex items-center justify-center size-5 sm:size-6 rounded-md text-icon-weaker hover:text-icon-weak hover:bg-surface-raised-base/30 transition-colors"
                          onClick={() => file.tree.refresh("")}
                          aria-label={language.t("session.fileTree.refresh")}
                        >
                          <RefreshCw class="size-3 sm:size-3.5 opacity-70" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <div
                    class="flex-1 overflow-auto px-3 py-0"
                    data-scope="filetree"
                    onContextMenu={(event) => {
                      event.preventDefault()
                      fileTreeMenu.showRoot(event)
                    }}
                  >
                    <Switch>
                      <Match when={fileTreePanel() === "loading"}>
                        <div class="h-full flex flex-col">
                          <div class="h-6 shrink-0" aria-hidden />
                          <div class="flex-1 pb-64 flex flex-col items-center justify-center gap-2 text-center">
                            <Spinner class="size-4 text-text-weaker" />
                            <div class="text-12-regular text-text-weak">
                              {cloud.active && !cloud.status().studioReachable
                                ? language.t("session.files.waitingForSandbox")
                                : language.t("session.files.loading")}
                            </div>
                          </div>
                        </div>
                      </Match>
                      <Match when={fileTreePanel() === "error"}>
                        {empty(
                          language.t("session.files.loadFailed"),
                          file.tree.state("")?.error ?? language.t("session.files.loadFailed.description"),
                        )}
                      </Match>
                      <Match when={fileTreePanel() === "empty"}>{empty(language.t("session.files.empty"))}</Match>
                      <Match when={true}>
                        <FileTree
                          path=""
                          class="pt-3"
                          active={activePath()}
                          modified={diffFiles()}
                          kinds={kinds()}
                          onFileClick={handleFileClick}
                          onNodeContextMenu={(node, event) => fileTreeMenu.showNode(node, event)}
                        />
                      </Match>
                    </Switch>
                  </div>
                  <FileTreeContextMenu ctrl={fileTreeMenu} />
                </div>
                <Show when={fileOpen()}>
                  <div onPointerDown={() => props.size.start()}>
                    <ResizeHandle
                      direction="horizontal"
                      size={layout.fileTree.width()}
                      min={200}
                      max={480}
                      onResize={(width) => {
                        props.size.touch()
                        layout.fileTree.resize(width)
                      }}
                    />
                  </div>
                </Show>
              </div>

              <div class="relative min-w-0 h-full min-h-0 flex-1 overflow-hidden">
                <Tabs value={activeTab()} onChange={openTab} class="h-full flex flex-col">
                  <div class="shrink-0 flex items-center border-b border-border-weaker-base">
                    <div
                      id="file-explorer-toggle"
                      class="flex items-center px-0 h-fit shrink-0 rotate-180 ml-3 mr-3"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TooltipKeybind
                        title={language.t("command.fileTree.toggle")}
                        keybind={command.keybind("fileTree.toggle")}
                      >
                        <IconButton
                          icon={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                          variant="ghost"
                          class="!rounded-md size-6 rotate-180"
                          classList={{
                            "text-icon-strong": layout.fileTree.opened(),
                            "text-icon-weak": !layout.fileTree.opened(),
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            layout.fileTree.toggle()
                          }}
                          aria-label={language.t("command.fileTree.toggle")}
                          aria-expanded={layout.fileTree.opened()}
                          aria-controls="file-tree-panel"
                        />
                      </TooltipKeybind>
                    </div>
                    <Tabs.List
                      class="px-0! gap-4 w-full"
                      ref={(el: HTMLDivElement) => {
                        const stop = createFileTabListSync({ el, contextOpen })
                        onCleanup(stop)
                      }}
                    >
                      <Show when={contextOpen()}>
                        <div class="flex items-center gap-2.5 px-2">
                          <Tabs.Trigger
                            value="context"
                            closeButton={
                              <TooltipKeybind
                                title={language.t("common.closeTab")}
                                keybind={command.keybind("tab.close")}
                                placement="bottom"
                                gutter={10}
                              >
                                <IconButton
                                  icon="close-small"
                                  variant="ghost"
                                  class="h-5 w-5"
                                  onClick={() => tabs().close("context")}
                                  aria-label={language.t("common.closeTab")}
                                />
                              </TooltipKeybind>
                            }
                            hideCloseButton
                            onMiddleClick={() => tabs().close("context")}
                          >
                            <div class="flex items-center gap-2">
                              <SessionContextUsage variant="indicator" />
                              <div>{language.t("session.tab.context")}</div>
                            </div>
                          </Tabs.Trigger>
                        </div>
                      </Show>
                      <For each={openedTabs()}>{(tab) => <SimpleTab tab={tab} onTabClose={tabs().close} />}</For>
                      <div class="flex-1" aria-hidden />
                      <div class="bg-elevated h-full shrink-0 sticky right-0 z-10 flex items-center justify-center pr-3">
                        <TooltipKeybind
                          title={language.t("command.file.open")}
                          keybind={command.keybind("file.open")}
                          class="flex items-center"
                        >
                          <IconButton
                            icon="plus-small"
                            variant="ghost"
                            iconSize="large"
                            class="!rounded-md"
                            onClick={() => {
                              void import("@/components/dialog-select-file").then((x) => {
                                dialog.show(() => <x.DialogSelectFile mode="files" onOpenFile={showAllFiles} />)
                              })
                            }}
                            aria-label={language.t("command.file.open")}
                          />
                        </TooltipKeybind>
                      </div>
                    </Tabs.List>
                  </div>

                  <Tabs.Content value="empty" class="flex flex-col flex-1 min-h-0 overflow-hidden contain-strict">
                    <Show when={activeTab() === "empty"}>
                      <div class="relative flex-1 min-h-0 overflow-hidden">
                        <div class="h-full flex flex-col items-center justify-center text-center gap-6">
                          <TrellisLogo class="w-14 -translate-y-1 opacity-10" />
                          <div class="text-14-regular text-text-weak max-w-56">
                            {language.t("session.files.selectToOpen")}
                          </div>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => {
                              command.trigger("file.new")
                            }}
                          >
                            <FilePlus class="size-4 mr-2" />
                            {language.t("command.file.new")}
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </Tabs.Content>

                  <Show when={contextOpen()}>
                    <Tabs.Content value="context" class="flex flex-col flex-1 min-h-0 overflow-hidden contain-strict">
                      <Show when={activeTab() === "context"}>
                        <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                          <SessionContextTab />
                        </div>
                      </Show>
                    </Tabs.Content>
                  </Show>

                  <Show when={activeFileTab()} keyed>
                    {(tab) => <FileTabContent tab={tab} />}
                  </Show>
                </Tabs>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </PreviewProvider>
  )
}

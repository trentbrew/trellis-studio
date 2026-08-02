import { createContext, createEffect, createSignal, useContext, type JSX } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"

const STORAGE_PREFIX = "trellis:route-sidebar:"

type SidebarState = { width: number; collapsed: boolean }

type SidebarContextValue = {
  layout: ResizableSidebarLayout
  resizing: () => boolean
  setResizing: (value: boolean) => void
  disabled: () => boolean
}

export const ResizableSidebarContext = createContext<SidebarContextValue>()

function loadState(key: string, defaults: SidebarState): SidebarState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<SidebarState>
    return {
      width: typeof parsed.width === "number" ? parsed.width : defaults.width,
      collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : defaults.collapsed,
    }
  } catch {
    return defaults
  }
}

export type ResizableSidebarLayout = {
  width: () => number
  setWidth: (width: number) => void
  resetWidth: () => void
  defaultWidth: number
  collapsed: () => boolean
  expand: () => void
  collapse: () => void
  toggle: () => void
  slotWidth: () => number
  min: number
  max: number
}

export function useResizableSidebarContext() {
  return useContext(ResizableSidebarContext)
}

export function useResizableSidebar(
  id: string,
  options: { defaultWidth?: number; min?: number; max?: number } = {},
): ResizableSidebarLayout {
  const defaultWidth = options.defaultWidth ?? 224
  const min = options.min ?? 160
  const max = options.max ?? 420
  const initial = loadState(id, { width: defaultWidth, collapsed: false })
  const [width, setWidth] = createSignal(initial.width)
  const [collapsed, setCollapsed] = createSignal(initial.collapsed)

  createEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + id,
        JSON.stringify({ width: width(), collapsed: collapsed() }),
      )
    } catch {}
  })

  const slotWidth = () => (collapsed() ? 0 : width())

  return {
    width,
    setWidth,
    resetWidth: () => setWidth(defaultWidth),
    defaultWidth,
    collapsed,
    expand: () => setCollapsed(false),
    collapse: () => setCollapsed(true),
    toggle: () => setCollapsed((value) => !value),
    slotWidth,
    min,
    max,
  }
}

export function ResizableSidebarToggle() {
  const ctx = useResizableSidebarContext()
  if (!ctx || ctx.disabled()) return null

  const collapsed = () => ctx.layout.collapsed()

  return (
    <Tooltip value={collapsed() ? "Show sidebar" : "Hide sidebar"} placement="bottom" gutter={6}>
      <IconButton
        icon={collapsed() ? "panel-left-open" : "panel-left-close"}
        variant="ghost"
        size="small"
        class="!size-6 shrink-0"
        onClick={() => ctx.layout.toggle()}
        aria-label={collapsed() ? "Show sidebar" : "Hide sidebar"}
        aria-expanded={!collapsed()}
      />
    </Tooltip>
  )
}

export type { SidebarContextValue as ResizableSidebarContextValue }

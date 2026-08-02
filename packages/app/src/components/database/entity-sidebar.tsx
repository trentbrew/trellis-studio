import { createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { RouteSidebar } from "@/components/route"
import { EntityTypeMenu } from "@/components/database/entity-type-menu"
import { SidebarTree } from "@/components/database/sidebar-tree"
import { EntityIcon, entityColor, entityTypeLabel, type EntityTheme } from "@/lib/entity-theme"

export type EntityCounts = Record<string, number>

export type GraphOptions = {
  hidden: boolean
  imports: boolean
  links: boolean
  ops: boolean
}

type Section = "system" | "custom"

const SECTIONS_KEY = "trellis:database-sidebar-sections"
export const HIDE_EMPTY_KEY = "trellis:database-sidebar-hide-empty"
const DEFAULTS: Record<Section, boolean> = { system: true, custom: true }

function loadSections(): Record<Section, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Record<Section, boolean>>) }
  } catch {
    return DEFAULTS
  }
}

function saveSections(s: Record<Section, boolean>) {
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(s))
  } catch {}
}

export function loadHideEmpty() {
  try {
    if (localStorage.getItem(HIDE_EMPTY_KEY) === "false") return false
    return true
  } catch {
    return true
  }
}

export function saveHideEmpty(value: boolean) {
  try {
    localStorage.setItem(HIDE_EMPTY_KEY, String(value))
  } catch {}
}

export function EntitySidebar(props: {
  width: number
  types: string[]
  counts: EntityCounts
  selectedType: string | null
  onSelectType: (t: string | null) => void
  systemTypes: readonly string[]
  theme?: (type: string) => EntityTheme
  total?: number
  hideEmpty?: boolean
  mobile?: boolean
  onConfigure?: (type: string) => void
  onRename?: (type: string) => void
  onDelete?: (type: string) => void
}) {
  const SYSTEM = new Set<string>(props.systemTypes)
  const hide = () => props.hideEmpty ?? true
  const visible = (type: string) => !hide() || (props.counts[type] ?? 0) > 0 || props.selectedType === type
  const systemTypes = () => props.types.filter((t) => SYSTEM.has(t) && visible(t))
  const customTypes = () => props.types.filter((t) => !SYSTEM.has(t) && visible(t))
  const theme = (type: string) =>
    props.theme?.(type) ?? { label: entityTypeLabel(type), color: entityColor(type), icon: type }

  const [open, setOpen] = createSignal(loadSections())
  const toggleSection = (k: Section) => {
    setOpen((prev) => {
      const next = { ...prev, [k]: !prev[k] }
      saveSections(next)
      return next
    })
  }

  const select = (t: string) => {
    if (props.selectedType === t) props.onSelectType(null)
    else props.onSelectType(t)
  }
  const types = createMemo(() => props.types.filter(visible))

  if (props.mobile) {
    return (
      <aside class="shrink-0 border-b border-border-weaker-base bg-sidebar">
        <div class="flex gap-1 overflow-x-auto no-scrollbar px-1.5 py-1.5">
          <button
            class="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-left text-11-medium transition-colors"
            classList={{
              "text-text-strong bg-surface-raised-base": props.selectedType === null,
              "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": props.selectedType !== null,
            }}
            onClick={() => props.onSelectType(null)}
            aria-pressed={props.selectedType === null}
          >
            <Icon name="git-branch" size="small" class="text-icon-weak" />
            <span>All</span>
            <span class="rounded-full bg-surface-raised-base px-1.5 py-[1px] text-10-regular tabular-nums text-text-weaker">
              {props.total ?? 0}
            </span>
          </button>
          <For each={types()}>
            {(type) => (
              <EntityPill
                type={type}
                count={props.counts[type] ?? 0}
                active={props.selectedType === type}
                theme={theme(type)}
                onClick={() => select(type)}
              />
            )}
          </For>
        </div>
      </aside>
    )
  }

  return (
    <RouteSidebar
      width={props.width}
      title="Entities"
      meta={props.total != null ? String(props.total) : undefined}
    >
      <button
        class="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-12-medium transition-colors mb-1"
        classList={{
          "text-text-strong bg-surface-raised-base": props.selectedType === null,
          "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": props.selectedType !== null,
        }}
        onClick={() => props.onSelectType(null)}
        aria-pressed={props.selectedType === null}
      >
        <Icon name="git-branch" size="small" class="text-icon-weak" />
        <span class="truncate flex-1">All</span>
        <span class="px-1.5 py-[1px] rounded-full text-10-regular tabular-nums bg-surface-raised-base text-text-weaker opacity-45">
          {props.total ?? 0}
        </span>
      </button>

      <SectionHeader
        label="Custom entities"
        spaced
        right={customTypes().length > 0 ? `${customTypes().length}` : "none"}
        open={open().custom}
        onToggle={() => toggleSection("custom")}
      />
      <Show when={open().custom}>
        <SidebarTree>
          <Show
            when={customTypes().length > 0}
            fallback={<div class="pl-4 pr-2.5 py-2 text-11-regular text-text-weaker italic">No custom entities</div>}
          >
            <For each={customTypes()}>
              {(type) => (
                <EntityRow
                  type={type}
                  count={props.counts[type] ?? 0}
                  active={props.selectedType === type}
                  theme={theme(type)}
                  onClick={() => select(type)}
                  menu={
                    props.onConfigure
                      ? {
                          configure: () => props.onConfigure!(type),
                          rename: props.onRename ? () => props.onRename!(type) : undefined,
                          delete: props.onDelete ? () => props.onDelete!(type) : undefined,
                        }
                      : undefined
                  }
                />
              )}
            </For>
          </Show>
        </SidebarTree>
      </Show>

      <SectionHeader
        label="System entities"
        right={props.types.length > 0 ? `${systemTypes().length}` : undefined}
        open={open().system}
        onToggle={() => toggleSection("system")}
        spaced
      />
      <Show when={open().system}>
        <SidebarTree>
          <For each={systemTypes()}>
            {(type) => (
              <EntityRow
                type={type}
                count={props.counts[type] ?? 0}
                active={props.selectedType === type}
                theme={theme(type)}
                onClick={() => select(type)}
              />
            )}
          </For>
        </SidebarTree>
      </Show>
    </RouteSidebar>
  )
}

function SectionHeader(props: {
  label: string
  right?: string
  open: boolean
  onToggle: () => void
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
      <Show when={props.right}>
        <span class="text-10-regular tabular-nums text-text-weaker">{props.right}</span>
      </Show>
    </div>
  )
}

function EntityRow(props: {
  type: string
  count: number
  active: boolean
  theme: EntityTheme
  onClick: () => void
  menu?: {
    configure: () => void
    rename?: () => void
    delete?: () => void
  }
}) {
  const color = () => props.theme.color
  return (
    <div
      class="group/row flex w-full min-w-0 items-center gap-0 pr-1 rounded-md"
      classList={{
        "bg-surface-raised-base": props.active,
      }}
    >
      <button
        class="flex min-w-0 flex-1 items-center gap-2 pl-4 pr-1 py-2 text-left text-12-medium transition-colors rounded-l-md"
        classList={{
          "text-text-strong": props.active,
          "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": !props.active,
        }}
        onClick={props.onClick}
        aria-pressed={props.active}
      >
        <EntityIcon
          type={props.type}
          size={14}
          color={props.active ? color() : "var(--text-weaker)"}
          icon={props.theme.icon}
        />
        <span class="truncate flex-1">{props.theme.label}</span>
      </button>
      <div class="flex shrink-0 items-center gap-0.5 py-2 pr-1">
        <span
          class="px-1.5 py-[1px] rounded-full text-10-regular tabular-nums opacity-45"
          style={
            props.active
              ? {
                  "background-color": `color-mix(in oklab, ${color()} 18%, transparent)`,
                  color: `color-mix(in oklab, ${color()} 90%, var(--text-base))`,
                }
              : {
                  "background-color": "var(--surface-raised-base)",
                  color: "var(--text-weaker)",
                }
          }
        >
          {props.count}
        </span>
        <Show when={props.menu}>
          {(menu) => (
            <div class="grid w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 group-hover/row:w-7 group-hover/row:opacity-100 group-focus-within/row:w-7 group-focus-within/row:opacity-100">
              <EntityTypeMenu
                label={props.theme.label}
                class="flex size-7 items-center justify-center rounded-md text-icon-weak hover:bg-surface-raised-base/30 hover:text-text-base"
                onConfigure={menu().configure}
                onRename={() => menu().rename?.()}
                onDelete={() => menu().delete?.()}
              />
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

function EntityPill(props: { type: string; count: number; active: boolean; theme: EntityTheme; onClick: () => void }) {
  const color = () => props.theme.color
  return (
    <button
      class="flex h-8 max-w-36 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-left text-11-medium transition-colors"
      classList={{
        "text-text-strong bg-surface-raised-base": props.active,
        "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": !props.active,
      }}
      onClick={props.onClick}
      aria-pressed={props.active}
    >
      <EntityIcon
        type={props.type}
        size={14}
        color={props.active ? color() : "var(--text-weaker)"}
        icon={props.theme.icon}
      />
      <span class="min-w-0 truncate">{props.theme.label}</span>
      <span
        class="shrink-0 rounded-full px-1.5 py-[1px] text-10-regular tabular-nums"
        style={
          props.active
            ? {
                "background-color": `color-mix(in oklab, ${color()} 18%, transparent)`,
                color: `color-mix(in oklab, ${color()} 90%, var(--text-base))`,
              }
            : {
                "background-color": "var(--surface-raised-base)",
                color: "var(--text-weaker)",
              }
        }
      >
        {props.count}
      </span>
    </button>
  )
}

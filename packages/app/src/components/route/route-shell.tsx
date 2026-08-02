import type { JSX } from "solid-js"
import { For, Show } from "solid-js"
import { ResizableSidebarToggle } from "./resizable-sidebar-context"
import "./route-motion.css"

type Side = "left" | "right" | "bottom"
type Tone = "default" | "raised" | "quiet"

type Item = {
  id: string
  label: string
  icon?: JSX.Element
  badge?: JSX.Element
  disabled?: boolean
}

function cx(...vals: Array<string | false | undefined>) {
  return vals.filter(Boolean).join(" ")
}

export function RouteView(props: { children: JSX.Element; class?: string }) {
  return <div class={cx("route-view", props.class)}>{props.children}</div>
}

export function RoutePanel(props: { children: JSX.Element; class?: string; compact?: boolean; affordance?: string }) {
  return (
    <section
      data-ui-pattern="layout.route"
      data-ui-region="panel"
      data-ui-affordance={props.affordance}
      class={cx("route-panel", props.compact && "route-panel--compact", props.class)}
    >
      {props.children}
    </section>
  )
}

export type RouteSidebarProps = {
  title?: JSX.Element
  meta?: JSX.Element
  actions?: JSX.Element
  children?: JSX.Element
  footer?: JSX.Element
  class?: string
  width?: number
  compact?: boolean
}

export function RouteSidebar(props: RouteSidebarProps) {
  return (
    <aside
      data-ui-pattern="layout.route"
      data-ui-region="sidebar"
      class={cx("route-sidebar", props.compact && "route-sidebar--compact", props.class)}
      style={{ "--route-sidebar-width": `${props.width ?? 208}px` }}
    >
      <Show when={props.title || props.meta || props.actions}>
        <div class="route-sidebar-head">
          <div class="route-sidebar-title">{props.title}</div>
          <Show when={props.meta || props.actions}>
            <div class="route-sidebar-head-right">
              <Show when={props.meta}>
                <div class="route-sidebar-meta">{props.meta}</div>
              </Show>
              <Show when={props.actions}>
                <div class="route-sidebar-actions">{props.actions}</div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <div class="route-sidebar-body">{props.children}</div>
      <Show when={props.footer}>
        <div class="route-sidebar-foot">{props.footer}</div>
      </Show>
    </aside>
  )
}

export function RouteNav(props: {
  items: Item[]
  active?: string | null
  onSelect: (id: string) => void
  stagger?: boolean
  variant?: "sidebar" | "tabs"
}) {
  return (
    <nav class={cx("route-nav", props.variant === "tabs" && "route-nav--tabs")}>
      <For each={props.items}>
        {(item, idx) => (
          <button
            class={cx(
              "route-nav-item",
              props.variant === "tabs" && "route-nav-item--tab",
              props.active === item.id && "route-nav-item--active",
            )}
            style={{ "animation-delay": props.stagger ? `${idx() * 45}ms` : undefined }}
            classList={{ "route-motion-item": props.stagger }}
            disabled={item.disabled}
            onClick={() => props.onSelect(item.id)}
            aria-pressed={props.active === item.id}
          >
            <Show when={item.icon}>
              <span class="route-nav-icon">{item.icon}</span>
            </Show>
            <span class="route-nav-label">{item.label}</span>
            <Show when={item.badge}>
              <span class="route-nav-badge">{item.badge}</span>
            </Show>
          </button>
        )}
      </For>
    </nav>
  )
}

export function RouteHeader(props: {
  title: JSX.Element
  meta?: JSX.Element
  leading?: JSX.Element
  sidebarToggle?: boolean
  /** Search field. Rendered on the left of the standardized toolbar row beneath the header. */
  search?: JSX.Element
  /** Filters, view switches, tabs, and other presentational controls. Rendered on the right of the toolbar row. */
  filters?: JSX.Element
  /** Primary actions. Rendered on the right of the top (header) row. */
  actions?: JSX.Element
  class?: string
}) {
  const leading = () => props.leading ?? (props.sidebarToggle ? <ResizableSidebarToggle /> : undefined)
  const toolbar = () => props.search || props.filters

  return (
    <>
      <header class={cx("route-header", props.class)} data-ui-pattern="layout.route" data-ui-slot="header">
        <div class="route-header-main">
          <Show when={leading()}>
            <div class="route-header-leading">{leading()}</div>
          </Show>
          <h2 class="route-header-title">{props.title}</h2>
          <Show when={props.meta}>
            <div class="route-header-meta">{props.meta}</div>
          </Show>
        </div>
        <Show when={props.actions}>
          <div class="route-header-actions">{props.actions}</div>
        </Show>
      </header>
      <Show when={toolbar()}>
        <div class="route-toolbar" data-ui-pattern="layout.route" data-ui-slot="toolbar">
          <Show when={props.search}>
            <div class="route-toolbar-search">{props.search}</div>
          </Show>
          <Show when={props.filters}>
            <div class="route-toolbar-tools">{props.filters}</div>
          </Show>
        </div>
      </Show>
    </>
  )
}

export function RouteContent(props: {
  children: JSX.Element
  class?: string
  padded?: boolean
  narrow?: boolean
  scroll?: boolean
}) {
  return (
    <div
      data-ui-pattern="layout.route"
      data-ui-slot="content"
      class={cx(
        "route-content route-motion-section",
        props.padded && "route-content--padded",
        props.narrow && "route-content--narrow",
        props.scroll === false && "route-content--clip",
        props.class,
      )}
    >
      {props.children}
    </div>
  )
}

export function RouteEmptyState(props: {
  icon?: JSX.Element
  title: JSX.Element
  description?: JSX.Element
  action?: JSX.Element
  class?: string
}) {
  return (
    <div class={cx("route-empty route-motion-pop", props.class)}>
      <Show when={props.icon}>
        <div class="route-empty-icon">{props.icon}</div>
      </Show>
      <div class="route-empty-copy">
        <div class="route-empty-title">{props.title}</div>
        <Show when={props.description}>
          <div class="route-empty-desc">{props.description}</div>
        </Show>
      </div>
      <Show when={props.action}>
        <div class="route-empty-action">{props.action}</div>
      </Show>
    </div>
  )
}

export function RouteCard(props: {
  children: JSX.Element
  class?: string
  selected?: boolean
  fresh?: boolean
  disabled?: boolean
  tone?: Tone
  delay?: number
  onClick?: JSX.EventHandler<HTMLDivElement, MouseEvent>
}) {
  return (
    <div
      class={cx(
        "route-card route-motion-item",
        props.tone === "raised" && "route-card--raised",
        props.tone === "quiet" && "route-card--quiet",
        props.selected && "route-card--selected",
        props.fresh && "route-card--fresh",
        props.disabled && "route-card--disabled",
        props.onClick && "route-card--interactive",
        props.class,
      )}
      style={{ "animation-delay": props.delay === undefined ? undefined : `${props.delay}ms` }}
      onClick={props.disabled ? undefined : props.onClick}
    >
      {props.children}
    </div>
  )
}

export function RouteDetailDrawer(props: {
  children: JSX.Element
  title?: JSX.Element
  actions?: JSX.Element
  side?: Side
  class?: string
  width?: number | string
  flush?: boolean
}) {
  const width = () => (typeof props.width === "number" ? `${props.width}px` : props.width)

  return (
    <aside
      data-ui-pattern="layout.drawer"
      data-ui-slot="detail"
      class={cx(
        "route-detail",
        props.side === "left" && "route-detail--left",
        props.side === "bottom" && "route-detail--bottom",
        props.flush && "route-detail--flush",
        props.class,
      )}
      style={{ "--route-detail-width": width() }}
    >
      <Show when={props.title || props.actions}>
        <div class="route-detail-head">
          <div class="route-detail-title">{props.title}</div>
          <Show when={props.actions}>
            <div class="route-detail-actions">{props.actions}</div>
          </Show>
        </div>
      </Show>
      <div class="route-detail-body">{props.children}</div>
    </aside>
  )
}

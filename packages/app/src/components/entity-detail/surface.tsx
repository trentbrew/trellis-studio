import { createMemo, Show, type JSX } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { EntityIcon } from "@/lib/entity-theme"
import { EntityDetailPanel } from "./panel"
import { EntityPreview } from "./preview"
import { short } from "./helpers"
import { V2_TABS, type DetailTab, type DetailTabItem } from "./tabs"
import { defaultTab, entityAdapter, inspectorSections, tabItems } from "./adapters"

export const ENTITY_SURFACE_SIDE_TABS: DetailTabItem[] = tabItems(inspectorSections(undefined, "split"))

export type EntitySurfaceLayout = "panel" | "split"

export function EntitySurface(props: {
  id: string
  type: string | undefined
  title?: string
  subtitle?: string
  meta?: string
  status?: string | null
  priority?: string | null
  layout?: EntitySurfaceLayout
  initialTab?: DetailTab
  items?: DetailTabItem[]
  navV2?: boolean
  header?: boolean
  preview?: JSX.Element
  onBack?: () => void
  onForward?: () => void
  canBack?: boolean
  canForward?: boolean
  onClose?: () => void
  class?: string
}) {
  const layout = () => props.layout ?? "panel"
  const items = createMemo(() => {
    if (props.items) return props.items
    if (props.navV2 && layout() === "panel") return V2_TABS
    return tabItems(inspectorSections(props.type, layout()))
  })
  const tab = createMemo<DetailTab>(() => {
    if (props.initialTab) return props.initialTab
    if (props.navV2 && layout() === "panel") return "overview"
    return defaultTab(props.type, layout())
  })

  return (
    <div
      data-ui-component="app.entity.surface"
      data-ui-pattern="layout.inspector"
      data-entity-layout={layout()}
      class={`flex h-full min-h-0 flex-col bg-panel ${props.class ?? ""}`}
    >
      <Show when={props.header !== false}>
        <EntitySurfaceHeader
          id={props.id}
          type={props.type}
          title={props.title}
          subtitle={props.subtitle}
          meta={props.meta}
          onBack={props.onBack}
          onForward={props.onForward}
          canBack={props.canBack}
          canForward={props.canForward}
          onClose={props.onClose}
        />
      </Show>

      <Show
        when={layout() === "split"}
        fallback={
          <EntityDetailPanel
            id={props.id}
            type={props.type}
            status={props.status}
            priority={props.priority}
            initialTab={tab()}
            items={items()}
          />
        }
      >
        <div data-ui-slot="body" class="flex min-h-0 flex-1">
          <section
            data-ui-component="app.entity.surface-preview"
            data-ui-slot="preview"
            class="min-w-0 flex-1 overflow-hidden bg-well"
          >
            {props.preview ?? entityAdapter(props.type).preview?.({ id: props.id, type: props.type }) ?? (
              <EntityPreview id={props.id} type={props.type} />
            )}
          </section>
          <EntitySurfaceSidebar
            id={props.id}
            type={props.type}
            status={props.status}
            priority={props.priority}
            initialTab={tab()}
            items={items()}
          />
        </div>
      </Show>
    </div>
  )
}

export function EntitySurfaceSidebar(props: {
  id: string
  type: string | undefined
  status?: string | null
  priority?: string | null
  initialTab?: DetailTab
  items?: DetailTabItem[]
  class?: string
}) {
  const items = () => props.items ?? tabItems(inspectorSections(props.type, "split"))
  return (
    <aside
      data-ui-component="app.entity.surface-sidebar"
      data-ui-slot="detail"
      class={`w-72 shrink-0 border-l border-border-weaker-base bg-sidebar flex flex-col min-h-0 ${props.class ?? ""}`}
    >
      <EntityDetailPanel
        id={props.id}
        type={props.type}
        status={props.status}
        priority={props.priority}
        initialTab={props.initialTab ?? defaultTab(props.type, "split")}
        items={items()}
      />
    </aside>
  )
}

function EntitySurfaceHeader(props: {
  id: string
  type: string | undefined
  title?: string
  subtitle?: string
  meta?: string
  onBack?: () => void
  onForward?: () => void
  canBack?: boolean
  canForward?: boolean
  onClose?: () => void
}) {
  const title = () => props.title?.trim() || short(props.id)
  const note = () => props.subtitle?.trim() || props.meta
  return (
    <div
      data-ui-slot="summary"
      class="shrink-0 flex flex-col gap-0.5 border-b border-border-weaker-base bg-sidebar px-3 py-2.5"
    >
      <div class="flex items-center gap-1">
        <Show when={props.onBack || props.onForward}>
          <div class="flex shrink-0 items-center gap-0">
            <IconButton
              icon="arrow-left"
              variant="ghost"
              onClick={() => props.onBack?.()}
              disabled={!props.onBack || props.canBack === false}
              title="Back"
            />
            <IconButton
              icon="arrow-right"
              variant="ghost"
              onClick={() => props.onForward?.()}
              disabled={!props.onForward || props.canForward === false}
              title="Forward"
            />
          </div>
        </Show>
        <EntityIcon type={props.type ?? "entity"} size={14} class="shrink-0" />
        <span class="min-w-0 flex-1 truncate text-12-medium text-text-strong" title={title()}>
          {title()}
        </span>
        <Show when={props.onClose}>
          <IconButton icon="close-small" variant="ghost" onClick={() => props.onClose?.()} />
        </Show>
      </div>
      <Show when={note()}>
        <span class="truncate font-mono text-9-regular text-text-weaker/75" title={note()}>
          {note()}
        </span>
      </Show>
    </div>
  )
}

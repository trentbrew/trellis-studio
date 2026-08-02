import { createEffect, createMemo, createSignal, on, Show } from "solid-js"
import { EntityActivity } from "./activity"
import { EntityDetails } from "./details"
import { EntityPreview } from "./preview"
import { EntityRelationships } from "./relationships"
import { EntityDetailTabs, type DetailTab, type DetailTabItem } from "./tabs"
import { defaultTab } from "./adapters"

export function EntityDetailPanel(props: {
  id: string
  type: string | undefined
  status?: string | null
  priority?: string | null
  initialTab?: DetailTab
  items?: DetailTabItem[]
  class?: string
}) {
  const isFile = createMemo(() => props.type === "file" || props.type === "directory")
  // Adapter default, constrained to the tabs this panel actually renders so a
  // split sidebar (no preview tab) never resets to a missing section.
  const fallback = () => {
    const ids = props.items?.map((item) => item.id)
    const preferred = defaultTab(props.type, "panel")
    if (!ids || ids.includes(preferred)) return preferred
    return ids[0] ?? "details"
  }
  const [tab, setTab] = createSignal<DetailTab>(props.initialTab ?? fallback())

  // Reset tab when entity changes
  createEffect(
    on(
      () => props.id,
      () => setTab(props.initialTab ?? fallback()),
      { defer: true },
    ),
  )

  return (
    <div class={`flex flex-col min-h-0 flex-1 ${props.class ?? ""}`}>
      <EntityDetailTabs tab={tab()} setTab={setTab} items={props.items} />
      <Show when={tab() === "preview"}>
        <EntityPreview id={props.id} type={props.type} />
      </Show>
      <Show when={tab() === "details"}>
        <EntityDetails id={props.id} type={props.type} status={props.status} priority={props.priority} />
      </Show>
      <Show when={tab() === "activity"}>
        <EntityActivity id={props.id} type={props.type} />
      </Show>
      {/* V2 per-entity tabs (trellis_nav_v2). Spec: /specs/navigation-ia.md */}
      <Show when={tab() === "overview"}>
        <Show
          when={isFile()}
          fallback={<EntityDetails id={props.id} type={props.type} status={props.status} priority={props.priority} />}
        >
          <EntityPreview id={props.id} type={props.type} />
        </Show>
      </Show>
      <Show when={tab() === "history"}>
        <EntityActivity id={props.id} type={props.type} kind="op" />
      </Show>
      <Show when={tab() === "decisions"}>
        <EntityActivity id={props.id} type={props.type} kind="decision" />
      </Show>
      <Show when={tab() === "relationships"}>
        <EntityRelationships id={props.id} type={props.type} />
      </Show>
    </div>
  )
}

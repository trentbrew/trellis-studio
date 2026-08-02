import { For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

export type DetailTab =
  | "details"
  | "preview"
  | "activity"
  // V2 (behind trellis_nav_v2 flag) — see /specs/navigation-ia.md
  | "overview"
  | "history"
  | "decisions"
  | "relationships"

export type DetailTabItem = {
  id: DetailTab
  label: string
  icon: string
}

export const DEFAULT_TABS: DetailTabItem[] = [
  { id: "preview", label: "Preview", icon: "eye" },
  { id: "details", label: "Details", icon: "info" },
  { id: "activity", label: "Activity", icon: "history" },
]

// V2 per-entity tab strip — Overview / History / Decisions / Relationships.
// Active when the trellis_nav_v2 flag is set. Overview internally chooses
// EntityPreview (for files/directories) or EntityDetails (everything else).
export const V2_TABS: DetailTabItem[] = [
  { id: "overview", label: "Overview", icon: "info" },
  { id: "history", label: "History", icon: "history" },
  { id: "decisions", label: "Decisions", icon: "brain" },
  { id: "relationships", label: "Relationships", icon: "git-branch" },
]

export function EntityDetailTabs(props: {
  tab: DetailTab
  setTab: (tab: DetailTab) => void
  items?: DetailTabItem[]
  class?: string
}) {
  const items = () => props.items ?? DEFAULT_TABS
  return (
    <div class={`shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border-weaker-base ${props.class ?? ""}`}>
      <For each={items()}>
        {(item) => {
          const active = () => props.tab === item.id
          return (
            <button
              class="relative flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-11-medium transition-colors"
              classList={{
                "text-text-strong": active(),
                "text-text-weak hover:text-text-base": !active(),
              }}
              aria-pressed={active()}
              onClick={() => props.setTab(item.id)}
            >
              <Show when={item.icon}>
                <Icon name={item.icon as any} size="small" class="shrink-0" />
              </Show>
              <span>{item.label}</span>
              <Show when={active()}>
                <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-white rounded-full" />
              </Show>
            </button>
          )
        }}
      </For>
    </div>
  )
}

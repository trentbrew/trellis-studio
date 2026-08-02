import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Plus, X } from "lucide-solid"
import { useTrellisStore } from "@/context/trellis-store"
import { EntityIcon } from "@/lib/entity-theme"
import type { Collection } from "@/components/cms/collections-sidebar"
import { createCmsCache, type CmsCache } from "@/components/cms/cache"

import { DISPLAY_KEYS, entryLabel } from "@/components/cms/display"
const ROW = 58
const OVER = 8

type StatusFilter = "all" | "draft" | "published"

export function EntriesList(props: {
  width: number
  compact?: boolean
  cache?: CmsCache
  collection: Collection
  selected: string | null
  onSelect: (id: string | null) => void
  onCreate: () => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}) {
  const store = useTrellisStore()
  const data = props.cache ?? createCmsCache(store)
  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal<StatusFilter>("all")
  const [view, setView] = createSignal({ top: 0, height: 0 })
  let scroller: HTMLDivElement | undefined

  const statusOf = (id: string): "draft" | "published" => {
    const f = (data.facts().get(id) ?? []).find((fact) => fact.a === "cms_status")
    return f?.v === "published" ? "published" : "draft"
  }

  const base = createMemo(() => data.entities(props.collection.key))

  const entries = createMemo(() => {
    let list = base()
    const f = filter()
    if (f !== "all") list = list.filter((e) => statusOf(e.id) === f)
    const q = query().trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        (data.facts().get(e.id) ?? []).some((fact) => String(fact.v).toLowerCase().includes(q)),
    )
  })
  const range = createMemo(() => {
    const total = entries().length
    const state = view()
    const height = state.height || 600
    const start = Math.max(0, Math.floor(state.top / ROW) - OVER)
    const end = Math.min(total, Math.ceil((state.top + height) / ROW) + OVER)
    return { start, end }
  })
  const visible = createMemo(() => entries().slice(range().start, range().end))

  const counts = createMemo(() => {
    let drafts = 0
    let published = 0
    for (const e of base()) {
      if (statusOf(e.id) === "published") published++
      else drafts++
    }
    return { all: base().length, draft: drafts, published }
  })

  const display = (id: string): { label: string; untitled: boolean } => {
    const label = entryLabel(data.facts().get(id) ?? [], id.replace(`${props.collection.key}:`, ""))
    const untitled = !(data.facts().get(id) ?? []).some(
      (fact) => DISPLAY_KEYS.includes(fact.a as (typeof DISPLAY_KEYS)[number]) && typeof fact.v === "string" && fact.v.trim(),
    )
    return { label, untitled }
  }
  const measure = (el: HTMLDivElement) => setView({ top: el.scrollTop, height: el.clientHeight })

  createEffect(() => {
    query()
    filter()
    props.collection.key
    requestAnimationFrame(() => {
      if (!scroller) return
      scroller.scrollTop = 0
      measure(scroller)
    })
  })

  return (
    <div
      class="shrink-0 border-r border-border-weaker-base flex flex-col overflow-hidden"
      classList={{
        "w-full max-h-56 border-r-0 border-b": props.compact,
      }}
      style={{ width: props.compact ? "100%" : `${props.width}px` }}
    >
      <div class="shrink-0 px-3 h-10 border-b border-border-weaker-base flex items-center gap-2">
        <EntityIcon
          type={props.collection.key}
          size={14}
          color={props.collection.theme.color}
          icon={props.collection.theme.icon}
        />
        <span class="text-12-medium text-text-strong capitalize truncate">{props.collection.label}</span>
        <span class="ml-auto text-10-regular tabular-nums text-text-weaker">{props.collection.count}</span>
      </div>

      <div class="shrink-0 px-2 py-2 border-b border-border-weaker-base flex flex-col gap-2">
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-raised-base/40">
          <Icon name="search" size="small" class="text-icon-weak shrink-0" />
          <input
            type="text"
            class="flex-1 min-w-0 bg-transparent border-0 outline-0 text-12-regular text-text-base placeholder:text-text-weaker"
            placeholder="Filter entries…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <Show when={query()}>
            <button class="text-text-weaker hover:text-text-base" onClick={() => setQuery("")} title="Clear">
              <Icon name="x" size="small" />
            </button>
          </Show>
        </div>
        <div class="flex items-center gap-0.5 p-0.5 rounded-md bg-surface-raised-base/40">
          <For
            each={
              [
                { id: "all", label: "All", count: counts().all },
                { id: "draft", label: "Drafts", count: counts().draft },
                { id: "published", label: "Live", count: counts().published },
              ] as const
            }
          >
            {(opt) => (
              <button
                class="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-11-medium transition-colors"
                classList={{
                  "bg-surface-raised-base text-text-strong": filter() === opt.id,
                  "text-text-weak hover:text-text-base": filter() !== opt.id,
                }}
                onClick={() => setFilter(opt.id)}
                aria-pressed={filter() === opt.id}
              >
                <span>{opt.label}</span>
                <span class="text-10-regular tabular-nums text-text-weaker">{opt.count}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div
        class="flex-1 min-h-0 overflow-y-auto px-2 py-2"
        ref={(el) => {
          scroller = el
          requestAnimationFrame(() => measure(el))
        }}
        onScroll={(e) => measure(e.currentTarget)}
      >
        <Show
          when={entries().length > 0}
          fallback={
            <div class="px-2.5 py-3 text-11-regular text-text-weaker italic text-center">
              <Show when={query()} fallback="No entries yet">
                No matches
              </Show>
            </div>
          }
        >
          <div class="relative" style={{ height: `${entries().length * ROW}px` }}>
            <For each={visible()}>
              {(entry, i) => {
                const displayData = createMemo(() => display(entry.id))
                const shortId = () => entry.id.replace(`${props.collection.key}:`, "")
                const isDraft = () => statusOf(entry.id) === "draft"
                const isFresh = () => store.fresh.includes(entry.id)
                return (
                  <div
                    class="group absolute left-0 right-0"
                    style={{
                      top: `${(range().start + i()) * ROW}px`,
                      height: `${ROW}px`,
                    }}
                  >
                    <button
                      class="w-full text-left px-2.5 py-1.5 rounded-md transition-all duration-700 flex flex-col gap-0.5"
                      classList={{
                        "bg-surface-raised-base": props.selected === entry.id,
                        "hover:bg-surface-raised-base/30": props.selected !== entry.id && !isFresh(),
                        "ring-1 ring-emerald-500/40 bg-emerald-500/5": isFresh(),
                      }}
                      onClick={() => props.onSelect(props.selected === entry.id ? null : entry.id)}
                      aria-pressed={props.selected === entry.id}
                    >
                      <div class="flex items-center gap-1.5 pr-6">
                        <span
                          class="text-12-medium truncate flex-1"
                          classList={{
                            "text-text-strong": props.selected === entry.id && !displayData().untitled,
                            "text-text-base": props.selected !== entry.id && !displayData().untitled,
                            "text-text-weaker italic": displayData().untitled,
                          }}
                        >
                          <Show when={!displayData().untitled} fallback="Untitled">
                            {displayData().label}
                          </Show>
                        </span>
                        <Show when={isDraft()}>
                          <span class="shrink-0 px-1.5 py-[1px] rounded text-9-regular uppercase tracking-wide bg-amber-500/15 text-amber-400">
                            Draft
                          </span>
                        </Show>
                      </div>
                      <span class="text-10-regular text-text-weaker font-mono truncate">{shortId()}</span>
                    </button>
                    <button
                      class="pointer-events-none absolute right-2 top-2 text-text-weaker hover:text-red-400 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        void props.onDelete(entry.id)
                      }}
                      title="Delete entry"
                    >
                      <X class="size-3.5" />
                    </button>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base p-2">
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 transition-colors"
          onClick={() => void props.onCreate()}
        >
          <Plus class="size-3.5 text-icon-weak" />
          <span>New entry</span>
        </button>
      </div>
    </div>
  )
}

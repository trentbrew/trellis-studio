import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Icon } from "@opencode-ai/ui/icon"
import { useEntityDialog } from "@/components/entity-dialog"
import { useTrellisStore } from "@/context/trellis-store"
import { entityColor, type EntityTheme } from "@/lib/entity-theme"
import { LinksERD } from "./links-erd"
import { entityTypeKey, matchesType } from "@/pages/session/database-panel-utils"
import { JsonView } from "./json-view"

type ViewMode = "list" | "erd" | "json"

const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "erd", label: "ERD", icon: "network" },
  { id: "list", label: "List", icon: "list" },
  { id: "json", label: "JSON-LD", icon: "braces" },
]
const ROW = 48
const OVER = 10

export function LinksTab(props: { type?: string; theme?: (type: string) => EntityTheme }) {
  const store = useTrellisStore()
  const dialog = useEntityDialog()
  const mobile = createMediaQuery("(max-width: 639px)")
  const [mode, setMode] = createSignal<ViewMode>("erd")
  const [query, setQuery] = createSignal("")
  const [view, setView] = createSignal({ top: 0, height: 0 })
  let scroller: HTMLDivElement | undefined
  const row = createMemo(() => (mobile() ? 88 : ROW))

  const types = createMemo(() => new Map(store.entities.map((e) => [e.id, e.type])))
  const typeOf = (id: string) => entityTypeKey(types().get(id) ?? "unknown")
  const links = createMemo(() =>
    props.type
      ? store.links.filter(
          (l) =>
            matchesType(types().get(l.e1) ?? "unknown", props.type!) ||
            matchesType(types().get(l.e2) ?? "unknown", props.type!),
        )
      : store.links,
  )
  const theme = (type: string) => props.theme?.(type) ?? { label: type, color: entityColor(type), icon: type }

  const filteredLinks = createMemo(() => {
    const list = links()
    const q = query().trim().toLowerCase()
    if (!q) return list
    if (q.startsWith("source:")) {
      const v = q.slice(7).trim()
      return list.filter((l) => l.e1.toLowerCase().includes(v))
    }
    if (q.startsWith("target:")) {
      const v = q.slice(7).trim()
      return list.filter((l) => l.e2.toLowerCase().includes(v))
    }
    if (q.startsWith("relation:")) {
      const v = q.slice(9).trim()
      return list.filter((l) => l.a.toLowerCase().includes(v))
    }
    return list.filter(
      (l) => l.a.toLowerCase().includes(q) || l.e1.toLowerCase().includes(q) || l.e2.toLowerCase().includes(q),
    )
  })
  const range = createMemo(() => {
    const total = filteredLinks().length
    const state = view()
    const height = state.height || 600
    const start = Math.max(0, Math.floor(state.top / row()) - OVER)
    const end = Math.min(total, Math.ceil((state.top + height) / row()) + OVER)
    return { start, end }
  })
  const visible = createMemo(() => filteredLinks().slice(range().start, range().end))
  const json = createMemo(() =>
    JSON.stringify(
      {
        "@context": { "@vocab": "https://trellis.local/store#" },
        "@graph": filteredLinks().map((link) => ({
          "@id": `${link.e1}#${link.a}#${link.e2}`,
          "@type": "Relationship",
          source: link.e1,
          sourceType: typeOf(link.e1),
          relation: link.a,
          target: link.e2,
          targetType: typeOf(link.e2),
        })),
      },
      null,
      2,
    ),
  )
  const measure = (el: HTMLDivElement) => setView({ top: el.scrollTop, height: el.clientHeight })

  createEffect(() => {
    query()
    props.type
    requestAnimationFrame(() => {
      if (!scroller) return
      scroller.scrollTop = 0
      measure(scroller)
    })
  })

  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="shrink-0 flex flex-col gap-1.5 border-b border-border-weaker-base px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-2">
        <div class="flex w-full items-center gap-1.5 rounded-md bg-surface-raised-base/40 px-2 py-0.5 sm:flex-1 sm:min-w-0 sm:py-1">
          <Icon name="search" size="small" class="text-icon-weak shrink-0" />
          <input
            type="text"
            class="flex-1 min-w-0 bg-transparent border-0 outline-0 text-11-regular text-text-base placeholder:text-text-weaker sm:text-12-regular"
            placeholder="Filter…   source: target: relation:"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <Show when={query()}>
            <button class="text-text-weaker hover:text-text-base" onClick={() => setQuery("")} title="Clear">
              <Icon name="x" size="small" />
            </button>
          </Show>
        </div>
        <div class="shrink-0 flex items-center gap-0.5 self-start rounded-md bg-surface-raised-base/40 p-0.5">
          <For each={VIEW_MODES}>
            {(m) => (
              <button
                class="flex items-center gap-1 rounded px-1.5 py-0.5 text-10-medium transition-colors sm:px-2 sm:py-1 sm:text-11-medium"
                classList={{
                  "bg-surface-raised-base text-text-strong": mode() === m.id,
                  "text-text-weak hover:text-text-base": mode() !== m.id,
                }}
                onClick={() => setMode(m.id)}
                aria-pressed={mode() === m.id}
              >
                <Icon name={m.icon as any} size="small" />
                {m.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        <Switch>
          <Match when={mode() === "list"}>
            <Show
              when={filteredLinks().length > 0}
              fallback={
                <div class="h-full flex items-center justify-center text-12-regular text-text-weaker">
                  No relationships{props.type ? ` involve ${props.type}` : ""}
                </div>
              }
            >
              <div
                class="h-full overflow-y-auto"
                ref={(el) => {
                  scroller = el
                  requestAnimationFrame(() => measure(el))
                }}
                onScroll={(e) => measure(e.currentTarget)}
              >
                <div class="sticky top-0 z-10 hidden grid-cols-[minmax(12rem,1.25fr)_minmax(10rem,0.75fr)_minmax(12rem,1.25fr)] bg-background-base text-text-weaker text-10-medium uppercase tracking-wide sm:grid">
                  <div class="px-4 py-3 font-medium">Source</div>
                  <div class="px-4 py-3 font-medium">Relation</div>
                  <div class="px-4 py-3 font-medium">Target</div>
                </div>
                <div class="relative text-12-regular" style={{ height: `${filteredLinks().length * row()}px` }}>
                  <For each={visible()}>
                    {(l, i) => (
                      <div
                        class="absolute left-2 right-2 flex flex-col justify-center gap-1 rounded-lg border border-border-weaker-base/50 px-3 py-2 hover:bg-surface-raised-base/30 sm:left-0 sm:right-0 sm:grid sm:grid-cols-[minmax(12rem,1.25fr)_minmax(10rem,0.75fr)_minmax(12rem,1.25fr)] sm:rounded-none sm:border-x-0 sm:border-b-0 sm:px-0 sm:py-0"
                        style={{
                          top: `${(range().start + i()) * row()}px`,
                          height: `${row()}px`,
                        }}
                      >
                        <div class="font-mono min-w-0 sm:px-4 sm:py-2.5">
                          <button
                            class="text-text-base hover:underline truncate block max-w-full"
                            style={{ color: theme(typeOf(l.e1)).color }}
                            onClick={() => dialog.push(l.e1, typeOf(l.e1))}
                          >
                            {l.e1}
                          </button>
                        </div>
                        <div class="text-text-weak truncate sm:px-4 sm:py-2.5">{l.a}</div>
                        <div class="font-mono min-w-0 sm:px-4 sm:py-2.5">
                          <button
                            class="text-text-base hover:underline truncate block max-w-full"
                            style={{ color: theme(typeOf(l.e2)).color }}
                            onClick={() => dialog.push(l.e2, typeOf(l.e2))}
                          >
                            {l.e2}
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Match>
          <Match when={mode() === "json"}>
            <JsonView code={json()} />
          </Match>
          <Match when={mode() === "erd"}>
            <LinksERD type={props.type ?? "all"} links={filteredLinks()} typeOf={typeOf} theme={theme} />
          </Match>
        </Switch>
      </div>
    </div>
  )
}

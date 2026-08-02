import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useEntityDialog } from "@/components/entity-dialog"
import { useTrellisStore } from "@/context/trellis-store"
import { EntityIcon, entityColor, type EntityTheme } from "@/lib/entity-theme"
import { entityTypeKey, matchesType } from "@/pages/session/database-panel-utils"
import { JsonView } from "./json-view"

function parseQuery(input: string): { attribute?: string; value?: string } {
  const trimmed = input.trim()
  if (!trimmed) return {}
  const match = trimmed.match(/^([a-zA-Z_][\w-]*)\s*[:=]\s*(.+)$/)
  if (match) return { attribute: match[1], value: match[2].trim() }
  return { value: trimmed }
}

type ViewMode = "list" | "json"

const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "list", label: "List", icon: "list" },
  { id: "json", label: "JSON-LD", icon: "braces" },
]

type Value = string | number | boolean
type JsonRecord = Record<string, Value | Value[] | string>
const ROW = 40
const OVER = 8

export function RecordsTab(props: { type?: string; theme?: (type: string) => EntityTheme }) {
  const store = useTrellisStore()
  const dialog = useEntityDialog()
  const [mode, setMode] = createSignal<ViewMode>("list")
  const [query, setQuery] = createSignal("")
  const [view, setView] = createSignal({ top: 0, height: 0 })
  let scroller: HTMLDivElement | undefined

  const records = createMemo(() =>
    props.type ? store.entities.filter((e) => matchesType(e.type, props.type!)) : store.entities,
  )
  const facts = createMemo(() => {
    const map = new Map<string, (typeof store.facts)[number][]>()
    for (const fact of store.facts) {
      const list = map.get(fact.e)
      if (list) list.push(fact)
      else map.set(fact.e, [fact])
    }
    return map
  })

  const filtered = createMemo(() => {
    const q = parseQuery(query())
    const list = records()
    if (!q.value && !q.attribute) return list
    const v = q.value?.toLowerCase()
    if (!q.attribute && v) {
      return list.filter(
        (e) =>
          e.id.toLowerCase().includes(v) ||
          entityTypeKey(e.type).includes(v) ||
          (facts().get(e.id) ?? []).some((f) => f.a.toLowerCase().includes(v) || String(f.v).toLowerCase().includes(v)),
      )
    }
    const a = q.attribute?.toLowerCase()
    return list.filter((e) =>
      (facts().get(e.id) ?? []).some(
        (f) => (!a || f.a.toLowerCase().includes(a)) && (!v || String(f.v).toLowerCase().includes(v)),
      ),
    )
  })
  const range = createMemo(() => {
    const total = filtered().length
    const state = view()
    const height = state.height || 600
    const start = Math.max(0, Math.floor(state.top / ROW) - OVER)
    const end = Math.min(total, Math.ceil((state.top + height) / ROW) + OVER)
    return { start, end }
  })
  const visible = createMemo(() => filtered().slice(range().start, range().end))
  const theme = (type: string) => props.theme?.(type) ?? { label: type, color: entityColor(type), icon: type }
  const json = createMemo(() =>
    JSON.stringify(
      {
        "@context": { "@vocab": "https://trellis.local/store#" },
        "@graph": filtered().map((rec) => {
          const out: JsonRecord = { "@id": rec.id, "@type": rec.type }
          for (const fact of facts().get(rec.id) ?? []) {
            const prev = out[fact.a]
            if (prev === undefined) out[fact.a] = fact.v
            else out[fact.a] = Array.isArray(prev) ? [...prev, fact.v] : [prev as Value, fact.v]
          }
          return out
        }),
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
            placeholder="Filter…   key:value"
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
          <Match when={mode() === "json"}>
            <JsonView code={json()} />
          </Match>
          <Match when={mode() === "list"}>
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="h-full flex items-center justify-center text-12-regular text-text-weaker">
                  No records{props.type ? ` of type ${props.type}` : ""}
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
                <div class="relative" style={{ height: `${filtered().length * ROW}px` }}>
                  <For each={visible()}>
                    {(record, i) => {
                      const t = theme(record.type)
                      return (
                        <button
                          class="absolute left-3 right-3 flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-12-regular text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 transition-colors"
                          style={{
                            top: `${(range().start + i()) * ROW + 4}px`,
                            height: `${ROW - 8}px`,
                          }}
                          onClick={() => {
                            void store.select(record.id)
                            dialog.push(record.id, record.type)
                          }}
                        >
                          <EntityIcon type={record.type} size={14} class="shrink-0" color={t.color} icon={t.icon} />
                          <span class="font-mono text-text-base truncate flex-1">{record.id}</span>
                          <span
                            class="px-1.5 py-[1px] rounded-full text-10-regular tabular-nums shrink-0"
                            style={{
                              "background-color": "var(--surface-raised-base)",
                              color: t.color,
                            }}
                          >
                            {t.label}
                          </span>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

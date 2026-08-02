import { createMemo, For, Show } from "solid-js"
import { CornerDownLeft, Globe, Link2, Plus } from "lucide-solid"
import type { StoreEntity, StoreFact } from "@/context/trellis-store"
import { RouteEmptyState } from "@/components/route"
import type { Collection } from "@/components/cms/collections-sidebar"
import { labelOf, parseRefs } from "@/components/cms/reference"
import type { PropDef } from "@/pages/session/database-panel-utils"
import { EntityIcon } from "@/lib/entity-theme"

type Status = "draft" | "published" | "archived"

type SchemaField = {
  key: string
  label?: string
  type?: string
}

type TitleMeta = { value: string; empty: boolean; key: string }

type Backlink = { id: string; via: string }

const STATUS: Record<Status, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-500/15 text-zinc-300" },
  published: { label: "Published", cls: "bg-emerald-500/15 text-emerald-400" },
  archived: { label: "Archived", cls: "bg-zinc-500/10 text-zinc-400" },
}

const REF = {
  bg: "rgba(167, 139, 250, 0.24)",
  color: "rgb(167, 139, 250)",
  ring: "rgba(167, 139, 250, 0.34)",
}

const IN = {
  bg: "rgba(34, 211, 238, 0.24)",
  color: "rgb(34, 211, 238)",
  ring: "rgba(34, 211, 238, 0.34)",
}

const TEXT_KEYS = new Set(["body", "notes", "description", "summary", "excerpt", "content"])
const TEXT_TYPES = new Set(["rich_text", "longtext", "markdown", "text"])
const URL_TYPES = new Set(["url"])
const URL_KEYS = new Set(["url", "link", "href"])
const IMAGE_KEYS = new Set(["image", "cover", "photo"])

function isImageUrl(value: string) {
  if (value.startsWith("data:image/")) return true
  if (value.startsWith("blob:")) return true
  try {
    const path = new URL(value).pathname
    return /\.(avif|gif|jpe?g|png|svg|webp)(\?|$)/i.test(path)
  } catch {
    return false
  }
}

function short(id: string, collection: string) {
  return id.replace(`${collection}:`, "")
}

function stripMd(value: string) {
  return value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function preview(
  facts: StoreFact[],
  schema: SchemaField[],
  titleKeys: Set<string>,
) {
  const map = new Map(facts.map((f) => [f.a, f.v]))

  for (const field of schema) {
    const image = field.type === "image" || IMAGE_KEYS.has(field.key)
    if (!image) continue
    const v = map.get(field.key)
    if (typeof v === "string" && v.trim() && isImageUrl(v.trim())) {
      return { kind: "image" as const, value: v.trim() }
    }
  }

  for (const field of schema) {
    if (titleKeys.has(field.key)) continue
    const hit = URL_TYPES.has(field.type ?? "") || URL_KEYS.has(field.key)
    if (!hit) continue
    const v = map.get(field.key)
    if (typeof v === "string" && v.trim()) return { kind: "url" as const, value: v.trim() }
  }

  for (const field of schema) {
    if (titleKeys.has(field.key)) continue
    const hit = TEXT_TYPES.has(field.type ?? "") || TEXT_KEYS.has(field.key)
    if (!hit) continue
    const v = map.get(field.key)
    if (typeof v === "string" && v.trim()) {
      const text = stripMd(v)
      if (text) return { kind: "text" as const, value: text.slice(0, 160), label: field.label ?? field.key }
    }
  }

  for (const key of TEXT_KEYS) {
    if (titleKeys.has(key)) continue
    const v = map.get(key)
    if (typeof v === "string" && v.trim()) {
      const text = stripMd(v)
      if (text) return { kind: "text" as const, value: text.slice(0, 160), label: key }
    }
  }

  for (const key of URL_KEYS) {
    if (titleKeys.has(key)) continue
    const v = map.get(key)
    if (typeof v === "string" && v.trim()) return { kind: "url" as const, value: v.trim() }
  }

  return undefined
}

function outbound(
  id: string,
  refs: Map<string, PropDef>,
  raw: (id: string, key: string) => StoreFact["v"] | undefined,
  allFacts: Map<string, StoreFact[]>,
  limit: number,
) {
  const out: { id: string; label: string }[] = []
  for (const key of refs.keys()) {
    for (const refId of parseRefs(raw(id, key))) {
      if (out.some((item) => item.id === refId)) continue
      out.push({ id: refId, label: labelOf(refId, allFacts) })
      if (out.length >= limit) return out
    }
  }
  return out
}

export function EntriesGrid(props: {
  collection: Collection
  entries: StoreEntity[]
  selected: string | null
  fresh: string[]
  facts: (id: string) => StoreFact[]
  allFacts: Map<string, StoreFact[]>
  title: (id: string) => TitleMeta
  status: (id: string) => Status
  schemaFields: SchemaField[]
  titleKeys: Set<string>
  refs: Map<string, PropDef>
  backlinks: Map<string, Backlink[]>
  raw: (id: string, key: string) => StoreFact["v"] | undefined
  onSelect: (id: string | null) => void
  onCreate: () => void | Promise<void>
}) {
  const titleKeys = createMemo(() => props.titleKeys)

  return (
    <div class="min-h-0 flex-1 overflow-auto px-3 py-3">
      <Show
        when={props.entries.length > 0}
        fallback={
          <RouteEmptyState
            title={`No ${props.collection.label.toLowerCase()} yet`}
            description="Create your first entry to see it here."
            action={
              <button
                class="rounded-md bg-surface-raised-base px-3 py-1.5 text-12-medium text-text-base hover:bg-surface-raised-base/80"
                onClick={() => void props.onCreate()}
              >
                New entry
              </button>
            }
          />
        }
      >
        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          <For each={props.entries}>
            {(entry) => {
              const meta = () => props.title(entry.id)
              const stat = () => STATUS[props.status(entry.id)]
              const body = () => preview(props.facts(entry.id), props.schemaFields, titleKeys())
              const refs = () => outbound(entry.id, props.refs, props.raw, props.allFacts, 2)
              const inbound = () => props.backlinks.get(entry.id) ?? []
              const fresh = () => props.fresh.includes(entry.id)
              const selected = () => props.selected === entry.id
              const quiet = () => !selected() && !fresh()
              return (
                <button
                  type="button"
                  class="group flex min-h-[148px] flex-col overflow-hidden rounded-lg border border-border-weaker-base bg-transparent text-left transition-colors duration-150"
                  classList={{
                    "border-border-base bg-surface-raised-base/50 ring-1 ring-border-base/40": selected(),
                    "animate-fresh-highlight bg-surface-success-weak": fresh(),
                    "hover:bg-surface-raised-base/40 hover:border-border-base/80": quiet(),
                  }}
                  onClick={() => props.onSelect(selected() ? null : entry.id)}
                >
                  <Show when={(() => {
                    const b = body()
                    return b?.kind === "image" ? b : undefined
                  })()}>
                    {(img) => (
                      <div class="relative h-28 w-full shrink-0 overflow-hidden border-b border-border-weaker-base/70 bg-surface-raised-base/20">
                        <img
                          src={img().value}
                          alt=""
                          class="size-full object-cover"
                          loading="lazy"
                          referrerpolicy="no-referrer"
                          onError={(event) => {
                            const el = event.currentTarget
                            if (el?.parentElement) el.parentElement.style.display = "none"
                          }}
                        />
                      </div>
                    )}
                  </Show>
                  <div class="flex min-h-0 flex-1 flex-col gap-2 p-3">
                    <div class="flex min-w-0 items-start gap-2">
                      <EntityIcon
                        type={props.collection.key}
                        size={14}
                        color={props.collection.theme.color}
                        icon={props.collection.theme.icon}
                        class="mt-0.5 shrink-0 opacity-70"
                      />
                      <div class="min-w-0 flex-1">
                        <div
                          class="truncate text-13-medium text-text-base"
                          classList={{ "text-text-weaker italic": meta().empty }}
                          title={meta().value}
                        >
                          {meta().value}
                        </div>
                        <div class="mt-0.5 truncate font-mono text-9-regular text-text-weaker">
                          {short(entry.id, props.collection.key)}
                        </div>
                      </div>
                      <span class={`shrink-0 rounded px-1.5 py-0.5 text-9-medium uppercase tracking-wide ${stat().cls}`}>
                        {stat().label}
                      </span>
                    </div>
                    <Show
                      when={(() => {
                        const b = body()
                        return b?.kind === "text" ? b : undefined
                      })()}
                    >
                      {(text) => (
                        <p class="line-clamp-3 text-11-regular leading-relaxed text-text-weak" title={text().value}>
                          {text().value}
                        </p>
                      )}
                    </Show>
                    <Show
                      when={(() => {
                        const b = body()
                        return b?.kind === "url" ? b : undefined
                      })()}
                    >
                      {(url) => (
                        <div class="flex min-w-0 items-center gap-1 text-11-regular text-text-weak" title={url().value}>
                          <Globe class="size-3 shrink-0 text-icon-weak" />
                          <span class="truncate">{url().value}</span>
                        </div>
                      )}
                    </Show>
                    <Show when={refs().length > 0 || inbound().length > 0}>
                      <div class="mt-auto flex min-w-0 flex-wrap items-center gap-1">
                        <For each={refs()}>
                          {(item) => (
                            <span
                              class="inline-flex max-w-full min-w-0 items-center gap-1 rounded px-1.5 py-[1px] text-9-regular tracking-wide"
                              style={{
                                "background-color": REF.bg,
                                color: REF.color,
                                "box-shadow": `inset 0 0 0 1px ${REF.ring}`,
                              }}
                              title={item.id}
                            >
                              <Link2 class="size-3 shrink-0 opacity-80" />
                              <span class="truncate">{item.label}</span>
                            </span>
                          )}
                        </For>
                        <Show when={inbound().length > 0}>
                          <span
                            class="inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-9-regular tracking-wide"
                            style={{
                              "background-color": IN.bg,
                              color: IN.color,
                              "box-shadow": `inset 0 0 0 1px ${IN.ring}`,
                            }}
                            title={inbound()
                              .map((item) => `${labelOf(item.id, props.allFacts)} via ${item.via}`)
                              .join(", ")}
                          >
                            <CornerDownLeft class="size-3 shrink-0 opacity-80" />
                            <span>{inbound().length} linked</span>
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </button>
              )
            }}
          </For>
          <button
            type="button"
            class="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-weaker-base bg-transparent text-11-medium text-text-weaker transition-colors hover:border-border-base hover:bg-surface-raised-base/30 hover:text-text-base"
            onClick={() => void props.onCreate()}
          >
            <Plus class="size-4" />
            <span>New entry</span>
          </button>
        </div>
      </Show>
    </div>
  )
}

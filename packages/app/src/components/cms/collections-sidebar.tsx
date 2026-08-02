import { createMemo, createSignal, For, Show, type Accessor } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { normalizeCollectionKey, validateCollectionKey } from "@opencode-ai/util/collection-key"
import { Copy, Globe, Link2, X } from "lucide-solid"
import { useSDK } from "@/context/sdk"
import { trellisUrl } from "@/context/trellis"
import { useTrellisStore } from "@/context/trellis-store"
import { entityTypeKey, RESERVED_COLLECTION_KEYS, typeKey } from "@/pages/session/database-panel-utils"
import { EntityIcon, defaultEntityColor, defaultEntityIcon, type EntityTheme } from "@/lib/entity-theme"
import { createCmsCache, type CmsCache } from "@/components/cms/cache"

export type Collection = {
  key: string
  schemaId: string
  label: string
  canonicalType: string
  theme: EntityTheme
  count: number
  inferred: boolean
}

const HIDDEN_TYPES = RESERVED_COLLECTION_KEYS

function InlineSpinner(props: { label: string }) {
  return (
    <div class="flex flex-col items-center justify-center gap-4 py-8">
      <div class="relative">
        <div class="size-8 rounded-full border-2 border-surface-raised-base/20 border-t-border-base border-t-solid animate-spin" />
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="size-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse" />
        </div>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-12-medium text-text-base">{props.label}</span>
        <div class="flex gap-1">
          <div class="w-1 h-1 rounded-full bg-text-weaker/40 animate-pulse" style={{ "animation-delay": "0ms" }} />
          <div class="w-1 h-1 rounded-full bg-text-weaker/40 animate-pulse" style={{ "animation-delay": "150ms" }} />
          <div class="w-1 h-1 rounded-full bg-text-weaker/40 animate-pulse" style={{ "animation-delay": "300ms" }} />
        </div>
      </div>
    </div>
  )
}

function CollectionSkeleton() {
  return (
    <div class="flex flex-col gap-0.5 px-2 py-2">
      <For each={Array.from({ length: 5 })}>
        {() => (
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-md">
            <div class="size-3.5 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="flex-1 h-3 rounded bg-surface-raised-base/30 animate-pulse" />
            <div class="w-6 h-4 rounded bg-surface-raised-base/40 animate-pulse" />
          </div>
        )}
      </For>
    </div>
  )
}

function humanizeType(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

export function CollectionEndpointBar(props: { collection: Collection }) {
  const sdk = useSDK()
  const endpoint = createMemo(() => {
    const base = trellisUrl(sdk.url, sdk.directory, "/store/entities")
    const u = new URL(base)
    u.searchParams.set("type", props.collection.canonicalType)
    return u.toString()
  })

  const copy = () => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(endpoint()).then(() =>
      showToast({ variant: "success", title: "Copied endpoint" }),
    )
  }

  return (
    <div class="shrink-0 border-t border-border-weaker-base px-3 py-2 hidden">
      <div
        class="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 hover:text-text-base"
        onClick={copy}
        title="Click to copy endpoint"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          copy()
        }}
      >
        <Link2 class="size-3 shrink-0 text-icon-weak" />
        <code class="min-w-0 flex-1 truncate font-mono text-10-regular text-text-weaker" title={endpoint()}>
          {endpoint()}
        </code>
        <Copy class="size-3 shrink-0 text-text-weaker" />
        <a
          class="shrink-0 text-text-weaker hover:text-text-base"
          href={endpoint()}
          target="_blank"
          rel="noopener noreferrer"
          title="Open endpoint"
          onClick={(e) => e.stopPropagation()}
        >
          <Globe class="size-3" />
        </a>
      </div>
    </div>
  )
}

export function useCollections(cache?: CmsCache) {
  const store = useTrellisStore()
  const data = cache ?? createCmsCache(store)
  return createMemo<Collection[]>(() => {
    const counts: Record<string, number> = {}
    const canonical: Record<string, string> = {}
    for (const e of store.entities) {
      const k = entityTypeKey(e.type)
      counts[k] = (counts[k] ?? 0) + 1
      if (!canonical[k]) canonical[k] = e.type
    }
    const fact = (e: string, a: string) =>
      data
        .facts()
        .get(e)
        ?.find((f) => f.a === a)?.v
    const result = new Map<string, Collection>()

    for (const schema of store.entities) {
      if (schema.type !== "TypeSchema") continue
      const id = schema.id
      if (fact(id, "cms") !== true) continue
      const name = id.replace(/^schema:/, "")
      const key = typeKey(name)
      if (HIDDEN_TYPES.has(key)) continue
      const labelRaw = fact(id, "label")
      const label = typeof labelRaw === "string" && labelRaw ? labelRaw : humanizeType(name)
      const colorRaw = fact(id, "color")
      const iconRaw = fact(id, "icon")
      const descRaw = fact(id, "description")
      const theme: EntityTheme = {
        label,
        color: typeof colorRaw === "string" ? colorRaw : defaultEntityColor(key),
        icon: typeof iconRaw === "string" ? iconRaw : defaultEntityIcon(key),
        description: typeof descRaw === "string" ? descRaw : undefined,
      }
      result.set(key, {
        key,
        schemaId: id,
        label,
        canonicalType: canonical[key] ?? name,
        theme,
        count: counts[key] ?? 0,
        inferred: false,
      })
    }

    return Array.from(result.values()).sort((a, b) => a.label.localeCompare(b.label))
  })
}

export function CollectionsSidebar(props: {
  width: number
  compact?: boolean
  cache?: CmsCache
  collections?: () => Collection[]
  selected: string | null
  /** Live display name while collection settings are being edited. */
  draftLabel?: Accessor<{ key: string; label: string } | null | undefined>
  onSelect: (key: string | null) => void
  onCreate: (name: string) => Promise<void> | void
  onDelete: (key: string) => Promise<void> | void
}) {
  const collections = props.collections ?? useCollections(props.cache)
  const store = useTrellisStore()
  const [query, setQuery] = createSignal("")

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return collections()
    return collections().filter((c) => c.key.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
  })

  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal("")

  const nameError = createMemo(() => {
    const raw = name().trim()
    if (!raw) return ""
    const key = normalizeCollectionKey(raw)
    const reserved = validateCollectionKey(key)
    if (reserved) return reserved
    if (collections().some((c) => c.key === key)) return `Collection "${key}" already exists`
    return ""
  })

  const submit = async () => {
    const n = name().trim()
    if (!n || nameError()) return
    await props.onCreate(n)
    setName("")
    setCreating(false)
  }

  const cancel = () => {
    setName("")
    setCreating(false)
  }

  return (
    <aside
      class="flex flex-col border-r border-border-weaker-base bg-sidebar"
      data-ui-region="sidebar"
      data-ui-pattern="layout.route"
      data-ui-slot="sidebar"
      classList={{
        "w-full max-h-48 border-r-0 border-b": props.compact,
      }}
      style={{ width: props.compact ? "100%" : `${props.width}px` }}
    >
      <Show
        when={store.ready}
        fallback={
          <div class="flex-1 flex flex-col">
            <div class="shrink-0 px-3 h-10 border-b border-border-weaker-base flex items-center">
              <span class="text-12-medium text-text-strong">Database</span>
              <span class="ml-auto size-3 rounded-full bg-blue-500/60 animate-pulse" />
            </div>
            <div class="flex-1 min-h-0 flex flex-col">
              <InlineSpinner label="Loading store…" />
            </div>
          </div>
        }
      >
        <div class="shrink-0 px-3 h-10 border-b border-border-weaker-base flex items-center">
          <span class="text-12-medium text-text-strong">Database</span>
          <span class="ml-auto text-10-regular tabular-nums text-text-weaker">{filtered().length}</span>
        </div>

        <div class="shrink-0 px-2 py-2 border-b border-border-weaker-base">
          <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-raised-base/0">
            <Icon name="search" size="small" class="text-icon-weak shrink-0" />
            <input
              type="text"
              class="flex-1 min-w-0 bg-transparent border-0 outline-0 text-12-regular text-text-base placeholder:text-text-weaker"
              placeholder="Filter collections…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <Show when={query()}>
              <button class="text-text-weaker hover:text-text-base" onClick={() => setQuery("")} title="Clear">
                <Icon name="x" size="small" />
              </button>
            </Show>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="px-2.5 py-3 text-11-regular text-text-weaker italic text-center">
                <Show when={query()} fallback="No collections yet">
                  No matches
                </Show>
              </div>
            }
          >
            <For each={filtered()}>
              {(c) => (
                <CollectionRow
                  collection={c}
                  active={props.selected === c.key}
                  fresh={store.fresh.includes(c.schemaId)}
                  onClick={() => props.onSelect(props.selected === c.key ? null : c.key)}
                  onDelete={() => void props.onDelete(c.key)}
                />
              )}
            </For>
          </Show>
        </div>

        <div class="shrink-0 border-t border-border-weaker-base p-2">
          <Show
            when={creating()}
            fallback={
              <button
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 transition-colors"
                onClick={() => setCreating(true)}
              >
                <Icon name="plus" size="small" class="text-icon-weak" />
                <span>New collection</span>
              </button>
            }
          >
            <div class="flex flex-col gap-1">
              <input
                type="text"
                autofocus
                class="w-full bg-surface-raised-base/40 border border-border-weaker-base rounded px-2 py-1 text-12-regular text-text-base outline-0 focus:border-border-base"
                classList={{ "border-red-500/60": !!nameError() }}
                placeholder="collection_name"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit()
                  if (e.key === "Escape") cancel()
                }}
                onBlur={() => {
                  if (!name().trim()) cancel()
                }}
              />
              <Show when={nameError()}>
                <span class="px-1 text-10-regular text-red-400">{nameError()}</span>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </aside>
  )
}

function CollectionRow(props: {
  collection: Collection
  active: boolean
  fresh: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const color = () => props.collection.theme.color
  return (
    <div class="group relative">
      <button
        class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-12-medium transition-all duration-700"
        classList={{
          "text-text-strong bg-surface-raised-base": props.active,
          "text-text-weak hover:text-text-base hover:bg-surface-raised-base/30": !props.active && !props.fresh,
          "ring-1 ring-emerald-500/40 bg-emerald-500/5": props.fresh,
        }}
        onClick={props.onClick}
        aria-pressed={props.active}
      >
        <EntityIcon
          type={props.collection.key}
          size={14}
          color={props.active ? color() : "var(--text-weaker)"}
          icon={props.collection.theme.icon}
        />
        <span class="truncate capitalize flex-1">{props.collection.label}</span>
        <span
          class="px-1.5 py-[1px] rounded-full text-10-regular tabular-nums transition-opacity group-hover:opacity-0"
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
          {props.collection.count}
        </span>
      </button>
      <button
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-weaker hover:text-red-400 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          props.onDelete()
        }}
        title="Delete collection"
      >
        <X class="size-3.5" />
      </button>
    </div>
  )
}

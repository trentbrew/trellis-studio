import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show, For } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { createMediaQuery } from "@solid-primitives/media"
import { Layers, Plus, Settings, X } from "lucide-solid"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { normalizeCollectionKey, validateCollectionKey } from "@opencode-ai/util/collection-key"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import { patchSearchParams, searchParamOne } from "@/lib/focus/rail-params"
import { publishFocusRailHints } from "@/lib/focus/rail-labels"
import { EntityIcon, defaultEntityColor, defaultEntityIcon, type EntityTheme } from "@/lib/entity-theme"
import { matchesType } from "@/pages/session/database-panel-utils"
import {
  CollectionEndpointBar,
  CollectionsSidebar,
  useCollections,
  type Collection,
} from "@/components/cms/collections-sidebar"
import { EntriesTable, EntriesViewToggle, type EntriesViewMode } from "@/components/cms/entries-table"
import { CsvImportButton, type CsvImportResult } from "@/components/cms/import-button"
import { EntryEditor } from "@/components/cms/entry-editor"
import { createCmsCache } from "@/components/cms/cache"
import { entryLabel, entityIdSuffix } from "@/components/cms/display"
import { defaultFacts, schemaProps } from "@/components/cms/schema"
import { CollectionSettingsEditor } from "@/components/cms/collection-settings-editor"
import { takeCmsNav, type CmsNavTarget } from "@/lib/cms-navigate"
import {
  RouteContent,
  RouteDetailDrawer,
  RouteEmptyState,
  RouteHeader,
  RoutePanel,
  ResizableSidebarLayout,
  ResizableSidebarPanel,
  RouteView,
} from "@/components/route"

function InlineSpinner(props: { label: string }) {
  return (
    <div class="flex flex-col items-center justify-center gap-4 py-12">
      <div class="relative">
        <div class="size-12 rounded-full border-2 border-surface-raised-base/20 border-t-border-base border-t-solid animate-spin" />
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="size-4 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 animate-pulse" />
        </div>
      </div>
      <div class="flex flex-col items-center gap-2">
        <span class="text-13-medium text-text-base">{props.label}</span>
        <div class="flex gap-1.5">
          <div class="w-1.5 h-1.5 rounded-full bg-text-weaker/40 animate-pulse" style={{ "animation-delay": "0ms" }} />
          <div
            class="w-1.5 h-1.5 rounded-full bg-text-weaker/40 animate-pulse"
            style={{ "animation-delay": "150ms" }}
          />
          <div
            class="w-1.5 h-1.5 rounded-full bg-text-weaker/40 animate-pulse"
            style={{ "animation-delay": "300ms" }}
          />
        </div>
      </div>
    </div>
  )
}

function TableSkeleton(props: { label?: string }) {
  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <Show when={props.label}>
        <div class="shrink-0 flex items-center gap-2 border-b border-border-weaker-base px-4 py-2.5">
          <div class="size-2.5 rounded-full bg-blue-500/60 animate-pulse" />
          <span class="text-12-regular text-text-weaker">{props.label}</span>
        </div>
      </Show>
      <div class="shrink-0 border-b border-border-weaker-base px-3 py-2">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-surface-raised-base/40 px-2 py-1.5">
            <div class="size-3.5 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="flex-1 h-3 rounded bg-surface-raised-base/30 animate-pulse" />
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <div class="w-16 h-6 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="w-16 h-6 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="w-16 h-6 rounded bg-surface-raised-base/40 animate-pulse" />
          </div>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <div class="min-w-[720px]">
          <div
            class="sticky top-0 z-10 grid h-9 items-center border-b border-border-weaker-base px-3"
            style={{
              "grid-template-columns":
                "36px minmax(220px, 1.8fr) 92px minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) 92px",
            }}
          >
            <div class="flex items-center justify-center">
              <div class="size-3.5 rounded bg-surface-raised-base/40 animate-pulse" />
            </div>
            <div class="h-3 w-12 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="h-3 w-12 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="h-3 w-16 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="h-3 w-20 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="h-3 w-16 rounded bg-surface-raised-base/40 animate-pulse" />
            <div class="h-3 w-8 rounded bg-surface-raised-base/40 animate-pulse" />
          </div>
          <div class="relative" style={{ height: "340px" }}>
            <For each={Array.from({ length: 8 })}>
              {(_: unknown, i: () => number) => (
                <div
                  class="absolute left-0 right-0 px-2 border-b border-border-weaker-base/20"
                  style={{ top: `${i() * 42}px`, height: "42px" }}
                >
                  <div
                    class="grid h-full w-full items-center px-2"
                    style={{
                      "grid-template-columns":
                        "36px minmax(220px, 1.8fr) 92px minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) 92px",
                    }}
                  >
                    <div class="flex items-center justify-center">
                      <div class="size-3.5 rounded bg-surface-raised-base/30 animate-pulse" />
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="size-3.5 rounded bg-surface-raised-base/30 animate-pulse" />
                      <div class="flex-1 h-3 rounded bg-surface-raised-base/20 animate-pulse" />
                    </div>
                    <div class="w-12 h-4 rounded bg-surface-raised-base/30 animate-pulse" />
                    <div class="h-3 w-20 rounded bg-surface-raised-base/20 animate-pulse" />
                    <div class="h-3 w-16 rounded bg-surface-raised-base/20 animate-pulse" />
                    <div class="h-3 w-24 rounded bg-surface-raised-base/20 animate-pulse" />
                    <div class="h-3 w-12 rounded bg-surface-raised-base/20 animate-pulse" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}

function shortId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function Inner() {
  const store = useTrellisStore()
  const cache = createCmsCache(store)
  const collections = useCollections(cache)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedKey, setSelectedKey] = createSignal<string | null>(null)
  const [contentKey, setContentKey] = createSignal<string | null>(null)
  const [selectedEntry, setSelectedEntry] = createSignal<string | null>(null)
  const [editorEntry, setEditorEntry] = createSignal<string | null>(null)
  const [entriesView, setEntriesView] = createSignal<EntriesViewMode>("table")
  const [configOpen, setConfigOpen] = createSignal(false)
  const [draftMeta, setDraftMeta] = createSignal<Partial<EntityTheme> | null>(null)
  const compact = createMediaQuery("(max-width: 1023px)")

  createEffect(() => {
    if (!store.ready || store.hydrated || store.loading) return
    void store.hydrate({ catalog: true })
  })

  const queueNav = (detail: CmsNavTarget) => {
    const entry = detail.entry
    const collection =
      detail.collection ?? (entry?.includes(":") ? entry.slice(0, entry.indexOf(":")) : undefined)
    if (collection) setSelectedKey(collection)
    if (entry) setSelectedEntry(entry)
  }

  createEffect(() => {
    const key = selectedKey()
    setEditorEntry(null)
    setContentKey(null)
    if (!key) {
      setSelectedEntry(null)
      return
    }
    const raf = requestAnimationFrame(() => {
      if (selectedKey() !== key) return
      setContentKey(key)
    })
    onCleanup(() => cancelAnimationFrame(raf))
  })

  createEffect(
    on(contentKey, (key, prev) => {
      if (key && key !== prev) {
        setEntriesView("table")
        setConfigOpen(false)
        setDraftMeta(null)
      }
    }),
  )

  createEffect(() => {
    const collection = searchParamOne(searchParams.cmsCollection)
    if (collection && collection !== selectedKey()) setSelectedKey(collection)
  })

  createEffect(() => {
    const entry = searchParamOne(searchParams.cmsEntry)
    if (!entry) return
    if (entry === selectedEntry()) return
    queueNav({ entry })
  })

  createEffect(
    on(
      () => [selectedKey(), selectedEntry()] as const,
      ([collection, entry]) => {
        const next = patchSearchParams(searchParams, {
          cmsCollection: collection ?? null,
          cmsEntry: entry ?? null,
        })
        if (next) setSearchParams(next, { replace: true })
      },
    ),
  )

  createEffect(() => {
    const key = selectedKey() ?? searchParamOne(searchParams.cmsCollection)
    const entry = selectedEntry() ?? searchParamOne(searchParams.cmsEntry)
    const collection = selectedCollection()
    void store.facts

    if (!key && !entry) {
      publishFocusRailHints(null)
      return
    }

    const routeSlug = key ?? (entry?.includes(":") ? entry.slice(0, entry.indexOf(":")) : "cms")
    const entryFacts = entry ? store.facts.filter((f) => f.e === entry) : []

    publishFocusRailHints({
      surface: "cms",
      routeSlug,
      itemSlug: entry ?? undefined,
      routeLabel: collection?.label,
      itemLabel: entry ? entryLabel(entryFacts, entityIdSuffix(entry)) : undefined,
    })
  })

  onCleanup(() => publishFocusRailHints(null))

  createEffect(() => {
    const id = selectedEntry()
    setEditorEntry(null)
    if (!id) return
    const raf = requestAnimationFrame(() => {
      if (selectedEntry() === id) setEditorEntry(id)
    })
    onCleanup(() => cancelAnimationFrame(raf))
  })

  createEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CmsNavTarget>).detail
      if (!detail) return
      takeCmsNav()
      queueNav(detail)
    }
    window.addEventListener("cms-navigate", handler)
    onCleanup(() => window.removeEventListener("cms-navigate", handler))
  })

  onMount(() => {
    const pending = takeCmsNav()
    if (pending) queueNav(pending)
  })

  const collectionEqual = (a: Collection | null, b: Collection | null) => {
    if (a === b) return true
    if (!a || !b) return false
    return a.key === b.key && a.label === b.label && a.count === b.count
  }

  const selectedCollection = createMemo<Collection | null>(
    () => {
      const key = selectedKey()
      if (!key) return null
      return collections().find((c) => c.key === key) ?? null
    },
    null,
    { equals: collectionEqual },
  )

  const contentCollection = createMemo<Collection | null>(
    () => {
      const key = contentKey()
      if (!key) return null
      return collections().find((c) => c.key === key) ?? null
    },
    null,
    { equals: collectionEqual },
  )

  const onCreateCollection = async (name: string) => {
    const key = normalizeCollectionKey(name)
    if (!key) return
    const error = validateCollectionKey(key, {
      exists: collections().some((c) => c.key === key),
    })
    if (error) {
      showToast({ variant: "error", title: error })
      return
    }
    const id = `schema:${key}`
    const label = name.trim() || key
    const result = await store.assert([
      { e: id, a: "type", v: "TypeSchema" },
      { e: id, a: "label", v: label },
      { e: id, a: "props", v: "[]" },
      { e: id, a: "color", v: defaultEntityColor(key) },
      { e: id, a: "icon", v: defaultEntityIcon(key) },
      { e: id, a: "cms", v: true },
    ])
    if (!result) {
      showToast({ variant: "error", title: `Failed to create collection "${key}"` })
      return
    }
    setSelectedKey(key)
  }

  const onCreateEntry = async () => {
    const c = selectedCollection()
    if (!c) return
    const id = `${c.key}:${shortId()}`
    const now = new Date().toISOString()
    const defs = schemaProps(store.facts, c.schemaId)
    const result = await store.assert([
      { e: id, a: "type", v: c.canonicalType },
      { e: id, a: "cms_status", v: "draft" },
      { e: id, a: "createdAt", v: now },
      { e: id, a: "createdBy", v: "user" },
      { e: id, a: "lastEdited", v: now },
      ...defaultFacts(id, defs),
    ])
    if (!result) {
      showToast({ variant: "error", title: "Failed to create entry" })
      return
    }
    setSelectedEntry(id)
    setConfigOpen(false)
  }

  const onDeleteCollection = async (key: string) => {
    const entries = store.entities.filter((e) => matchesType(e.type, key))
    const msg =
      entries.length > 0
        ? `Delete collection "${key}" and ${entries.length} ${entries.length === 1 ? "entry" : "entries"}?`
        : `Delete collection "${key}"?`
    if (!window.confirm(msg)) return
    const schemaId = `schema:${key}`
    const fieldPrefix = `field:${key}.`
    const cascade = store.facts.filter(
      (f) => f.e === schemaId || f.e.startsWith(fieldPrefix) || entries.some((e) => f.e === e.id),
    )
    if (cascade.length > 0) {
      const r = await store.retract(cascade)
      if (!r) {
        showToast({ variant: "error", title: `Failed to delete collection "${key}"` })
        return
      }
    }
    if (selectedKey() === key) setSelectedKey(null)
  }

  const onDeleteEntry = async (id: string) => {
    const facts = store.facts.filter((f) => f.e === id)
    if (facts.length > 0) {
      const r = await store.retract(facts)
      if (!r) {
        showToast({ variant: "error", title: "Failed to delete entry" })
        return
      }
    }
    if (selectedEntry() === id) setSelectedEntry(null)
  }

  const onDuplicateEntry = async (id: string) => {
    const c = selectedCollection()
    if (!c) return
    const next = `${c.key}:${shortId()}`
    const now = new Date().toISOString()
    const source = store.facts.filter((f) => f.e === id && f.a !== "lastEdited")
    if (source.length === 0) return
    const facts = source.map((f) => {
      if ((f.a === "name" || f.a === "title") && typeof f.v === "string") {
        return { e: next, a: f.a, v: `${f.v} (Copy)` }
      }
      return { e: next, a: f.a, v: f.v }
    })
    facts.push({ e: next, a: "lastEdited", v: now })
    const r = await store.assert(facts)
    if (!r) {
      showToast({ variant: "error", title: "Failed to duplicate entry" })
      return
    }
    setSelectedEntry(next)
  }

  const onImport = async (result: CsvImportResult) => {
    setSelectedKey(result.collection)
    setConfigOpen(false)
    if (result.ids[0]) setSelectedEntry(result.ids[0])
    await store.hydrate({ catalog: true })
  }

  return (
    <RouteView>
      <ResizableSidebarLayout id="cms" defaultWidth={224} disabled={compact()}>
        <RoutePanel compact={compact()}>
          <ResizableSidebarPanel>
            {(layout) => (
              <CollectionsSidebar
                width={layout.width()}
                compact={compact()}
                cache={cache}
                collections={collections}
                selected={selectedKey()}
                onSelect={(key) => {
                  setSelectedEntry(null)
                  setConfigOpen(false)
                  setSelectedKey(key)
                }}
                onCreate={onCreateCollection}
                onDelete={onDeleteCollection}
              />
            )}
          </ResizableSidebarPanel>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show when={store.ready && !store.loading} fallback={<TableSkeleton label="Loading store…" />}>
            <Show
              when={selectedCollection()}
              keyed
              fallback={
                <RouteEmptyState
                  icon={<Layers class="size-8" />}
                  title="Select a collection"
                  description="Pick a collection from the sidebar, or create a new one to get started."
                />
              }
            >
              {(c) => (
                <Show
                  when={contentCollection()}
                  keyed
                  fallback={
                    <div class="flex flex-1 items-center justify-center">
                      <InlineSpinner label={`Loading ${c.label}…`} />
                    </div>
                  }
                >
                  {(loaded) => {
                    const theme = (): EntityTheme => ({
                      label: loaded.label,
                      color: loaded.theme.color,
                      icon: loaded.theme.icon,
                      description: loaded.theme.description,
                      ...draftMeta(),
                    })
                    return (
                      <div class="flex min-h-0 flex-1 flex-col">
                        <RouteHeader
                          sidebarToggle={!compact()}
                          title={
                            <span class="flex min-w-0 items-center gap-2">
                              <EntityIcon type={loaded.key} size={14} color={theme().color} icon={theme().icon} />
                              <span class="truncate">{theme().label}</span>
                              <button
                                class="shrink-0 rounded p-0.5 text-text-weaker hover:bg-surface-raised-base hover:text-text-base"
                                classList={{ "bg-surface-raised-base text-text-base": configOpen() }}
                                onClick={() => {
                                  if (configOpen()) {
                                    setConfigOpen(false)
                                    return
                                  }
                                  setSelectedEntry(null)
                                  setConfigOpen(true)
                                }}
                                aria-label="Collection settings"
                                title="Collection settings"
                              >
                                <Settings class="size-3.5" />
                              </button>
                            </span>
                          }
                          meta={
                            <Show when={theme().description}>
                              <span class="max-w-md truncate text-11-regular text-text-weaker">
                                {theme().description}
                              </span>
                            </Show>
                          }
                          actions={
                            <>
                              <Show when={store.loading}>
                                <div class="flex items-center gap-0.5 opacity-50">
                                  <div class="size-1 rounded-full bg-text-weaker animate-pulse" />
                                  <div
                                    class="size-1 rounded-full bg-text-weaker animate-pulse"
                                    style={{ "animation-delay": "150ms" }}
                                  />
                                  <div
                                    class="size-1 rounded-full bg-text-weaker animate-pulse"
                                    style={{ "animation-delay": "300ms" }}
                                  />
                                </div>
                              </Show>
                              <EntriesViewToggle view={entriesView()} onViewChange={setEntriesView} />
                              <CsvImportButton collection={loaded} onImported={onImport} />
                              <button
                                class="flex items-center gap-1.5 rounded-md bg-surface-raised-base/0 px-2.5 py-1.5 text-12-medium text-text-base hover:bg-surface-raised-base/80"
                                onClick={() => void onCreateEntry()}
                              >
                                <Plus class="size-3.5" />
                                <span>New entry</span>
                              </button>
                            </>
                          }
                        />
                        <RouteContent scroll={false} class="min-h-0 flex-1">
                          <EntriesTable
                            compact={compact()}
                            cache={cache}
                            collection={loaded}
                            selected={selectedEntry()}
                            view={entriesView()}
                            onViewChange={setEntriesView}
                            onSelect={(id) => {
                              setConfigOpen(false)
                              setSelectedEntry(id)
                            }}
                            onCreate={onCreateEntry}
                            onDelete={onDeleteEntry}
                            onDuplicate={onDuplicateEntry}
                          />
                        </RouteContent>
                        <CollectionEndpointBar collection={loaded} />
                      </div>
                    )
                  }}
                </Show>
              )}
            </Show>
          </Show>
        </div>
        <Show when={contentCollection()} keyed>
          {(c) => (
            <>
              <Show when={configOpen()}>
                <RouteDetailDrawer
                  side={compact() ? "bottom" : "right"}
                  width={440}
                  flush
                  actions={
                    <button
                      class="text-text-weaker hover:text-text-base"
                      onClick={() => setConfigOpen(false)}
                      title="Close"
                    >
                      <X class="size-3.5" />
                    </button>
                  }
                >
                  <CollectionSettingsEditor
                    collection={c}
                    cache={cache}
                    onDraft={(nextMeta) => setDraftMeta(nextMeta)}
                    onDelete={async () => {
                      await onDeleteCollection(c.key)
                      setConfigOpen(false)
                    }}
                  />
                </RouteDetailDrawer>
              </Show>
              <Show when={selectedEntry() && !configOpen()}>
                <RouteDetailDrawer
                  side={compact() ? "bottom" : "right"}
                  width={440}
                  flush
                  actions={
                    <button
                      class="text-text-weaker hover:text-text-base"
                      onClick={() => setSelectedEntry(null)}
                      title="Close"
                    >
                      <X class="size-3.5" />
                    </button>
                  }
                >
                  <Show
                    when={editorEntry()}
                    keyed
                    fallback={
                      <div class="flex h-full items-center justify-center text-12-regular text-text-weaker">
                        Loading entry…
                      </div>
                    }
                  >
                    {(id) => (
                      <EntryEditor
                        entryId={id}
                        collection={c}
                        cache={cache}
                        collections={collections}
                        onDelete={() => setSelectedEntry(null)}
                        onDuplicate={onDuplicateEntry}
                      />
                    )}
                  </Show>
                </RouteDetailDrawer>
              </Show>
            </>
          )}
        </Show>
      </RoutePanel>
      </ResizableSidebarLayout>
    </RouteView>
  )
}

export function CmsPanel() {
  return (
    <TrellisStoreScope>
      <Inner />
    </TrellisStoreScope>
  )
}

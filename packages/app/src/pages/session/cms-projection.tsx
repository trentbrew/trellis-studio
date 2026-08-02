import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Layers, Plus, X } from "lucide-solid"
import { showToast } from "@opencode-ai/ui/toast"
import { normalizeCollectionKey } from "@opencode-ai/util/collection-key"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import { EntityIcon, defaultEntityColor, defaultEntityIcon, type EntityTheme } from "@/lib/entity-theme"
import { CollectionEndpointBar, CollectionsSidebar, useCollections, type Collection } from "@/components/cms/collections-sidebar"
import { EntriesTable, EntriesViewToggle, type EntriesViewMode } from "@/components/cms/entries-table"
import { CsvImportButton, type CsvImportResult } from "@/components/cms/import-button"
import { EntryEditor } from "@/components/cms/entry-editor"
import { createCmsCache } from "@/components/cms/cache"
import { defaultFacts, schemaProps } from "@/components/cms/schema"
import { takeCmsNav, type CmsNavTarget } from "@/lib/cms-navigate"
import { AffordanceShell } from "@/components/affordance"
import {
  RouteContent,
  RouteDetailDrawer,
  RouteEmptyState,
  RouteHeader,
  ResizableSidebarLayout,
  ResizableSidebarPanel,
} from "@/components/route"
import type { ProjectionDefinition } from "@/lib/projections/types"

function shortId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function layoutToView(layout: ProjectionDefinition["layout"]): EntriesViewMode {
  return layout === "cards" ? "grid" : "table"
}

function projectionScope(projection: ProjectionDefinition): { keys: Set<string>; match: "exact" | "prefix" } {
  const q = projection.query
  if (q.kind !== "cms") return { keys: new Set(), match: "exact" }
  const keys = new Set<string>()
  for (const raw of q.collections ?? []) {
    const key = normalizeCollectionKey(raw)
    if (key) keys.add(key)
  }
  return { keys, match: q.match ?? "exact" }
}

function inScope(key: string, scope: { keys: Set<string>; match: "exact" | "prefix" }): boolean {
  if (scope.keys.size === 0) return false
  if (scope.match === "exact") return scope.keys.has(key)
  for (const wanted of scope.keys) {
    if (key === wanted || key.startsWith(`${wanted}-`) || key.startsWith(`${wanted}_`)) return true
  }
  return false
}

function Inner(props: { projection: ProjectionDefinition }) {
  const store = useTrellisStore()
  const cache = createCmsCache(store)
  const allCollections = useCollections(cache)
  const compact = createMediaQuery("(max-width: 1023px)")

  const scope = createMemo(() => projectionScope(props.projection))
  const collections = createMemo(() =>
    allCollections().filter((c) => inScope(c.key, scope())),
  )

  const [selectedKey, setSelectedKey] = createSignal<string | null>(null)
  const [contentKey, setContentKey] = createSignal<string | null>(null)
  const [selectedEntry, setSelectedEntry] = createSignal<string | null>(null)
  const [editorEntry, setEditorEntry] = createSignal<string | null>(null)
  const [entriesView, setEntriesView] = createSignal<EntriesViewMode>(layoutToView(props.projection.layout))

  createEffect(() => {
    if (!store.ready || store.hydrated || store.loading) return
    void store.hydrate({ catalog: true })
  })

  createEffect(
    on(
      () => props.projection.id,
      () => {
        setSelectedKey(null)
        setSelectedEntry(null)
        setEditorEntry(null)
        setContentKey(null)
        setEntriesView(layoutToView(props.projection.layout))
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const list = collections()
    const current = selectedKey()
    if (list.length === 0) {
      if (current) setSelectedKey(null)
      return
    }
    if (!current || !list.find((c) => c.key === current)) {
      setSelectedKey(list[0].key)
    }
  })

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

  createEffect(() => {
    const id = selectedEntry()
    setEditorEntry(null)
    if (!id) return
    const raf = requestAnimationFrame(() => {
      if (selectedEntry() === id) setEditorEntry(id)
    })
    onCleanup(() => cancelAnimationFrame(raf))
  })

  const queueNav = (detail: CmsNavTarget) => {
    const entry = detail.entry
    const collection =
      detail.collection ?? (entry?.includes(":") ? entry.slice(0, entry.indexOf(":")) : undefined)
    if (collection && inScope(collection, scope())) {
      setSelectedKey(collection)
      if (entry) setSelectedEntry(entry)
    }
  }

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

  const onCreateScopedCollection = async () => {
    const s = scope()
    const fallback = props.projection.create?.collection ?? [...s.keys][0]
    if (!fallback) return
    const key = normalizeCollectionKey(fallback)
    if (!key) return
    if (allCollections().some((c) => c.key === key)) {
      setSelectedKey(key)
      return
    }
    const id = `schema:${key}`
    const label = props.projection.label
    const result = await store.assert([
      { e: id, a: "type", v: "TypeSchema" },
      { e: id, a: "label", v: label },
      { e: id, a: "props", v: "[]" },
      { e: id, a: "color", v: defaultEntityColor(key) },
      { e: id, a: "icon", v: defaultEntityIcon(key) },
      { e: id, a: "cms", v: true },
    ])
    if (!result) {
      showToast({ variant: "error", title: `Failed to create "${key}"` })
      return
    }
    setSelectedKey(key)
  }

  const onCreateEntry = async () => {
    const c = selectedCollection()
    if (!c) {
      await onCreateScopedCollection()
      return
    }
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
    if (result.ids[0]) setSelectedEntry(result.ids[0])
    await store.hydrate({ catalog: true })
  }

  const hasMultipleCollections = createMemo(() => collections().length > 1)
  const importTarget = createMemo(() => {
    const q = props.projection.query
    if (q.kind !== "cms") return null
    const raw = props.projection.create?.collection ?? q.collections?.[0]
    const key = raw ? normalizeCollectionKey(raw) : ""
    if (!key) return null
    return { key, label: props.projection.label }
  })

  const emptyTitle = () => {
    const list = props.projection.query.kind === "cms" ? (props.projection.query.collections ?? []) : []
    if (list.length === 0) return `${props.projection.label} not configured`
    return `No ${props.projection.label.toLowerCase()} yet`
  }

  const emptyDescription = () => {
    const q = props.projection.query
    if (q.kind !== "cms") return props.projection.description
    const wanted = q.collections ?? []
    if (wanted.length === 0) return props.projection.description
    if (wanted.length === 1) {
      return `Create a "${wanted[0]}" collection to start using this projection.`
    }
    return `Looking for any of: ${wanted.join(", ")}. Create one to start.`
  }

  return (
    <ResizableSidebarLayout
      id={`cms-projection-${props.projection.id}`}
      defaultWidth={224}
      disabled={compact() || !hasMultipleCollections()}
    >
      <AffordanceShell
        id={props.projection.id}
        compact={compact()}
        padded={false}
        scroll={false}
        sidebarToggle={hasMultipleCollections() && !compact()}
        sidebar={
          hasMultipleCollections() ? (
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
                    setSelectedKey(key)
                  }}
                  onCreate={() => onCreateScopedCollection()}
                  onDelete={async () => {
                    showToast({ title: "Manage collections from the Database tab." })
                  }}
                />
              )}
            </ResizableSidebarPanel>
          ) : undefined
        }
      detail={
        contentCollection() && selectedEntry() ? (
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
                  collection={contentCollection()!}
                  cache={cache}
                  collections={collections}
                  onDelete={() => setSelectedEntry(null)}
                  onDuplicate={onDuplicateEntry}
                />
              )}
            </Show>
          </RouteDetailDrawer>
        ) : undefined
      }
    >
      <Show
        when={selectedCollection()}
        keyed
        fallback={
          <RouteEmptyState
            icon={<Layers class="size-8" />}
            title={emptyTitle()}
            description={emptyDescription()}
            action={
              <Show when={(props.projection.query.kind === "cms" ? props.projection.query.collections?.length ?? 0 : 0) > 0}>
                <div class="flex items-center justify-center gap-2">
                  <Show when={importTarget()} keyed>
                    {(target) => <CsvImportButton collection={target} onImported={onImport} />}
                  </Show>
                  <button
                    class="inline-flex items-center gap-1.5 rounded-md bg-surface-raised-base/60 px-3 py-1.5 text-12-medium text-text-base hover:bg-surface-raised-base"
                    onClick={() => void onCreateScopedCollection()}
                  >
                    <Plus class="size-3.5" />
                    <span>{props.projection.create?.label ?? `Create ${props.projection.label}`}</span>
                  </button>
                </div>
              </Show>
            }
          />
        }
      >
        {(c) => (
          <Show
            when={contentCollection()}
            keyed
            fallback={
              <div class="flex flex-1 items-center justify-center text-12-regular text-text-weaker">
                Loading {c.label}…
              </div>
            }
          >
            {(loaded) => {
              const theme = (): EntityTheme => ({
                label: loaded.label,
                color: loaded.theme.color,
                icon: loaded.theme.icon,
                description: loaded.theme.description,
              })
              return (
                <div class="flex min-h-0 flex-1 flex-col">
                  <RouteHeader
                    title={
                      <span class="flex min-w-0 items-center gap-2">
                        <EntityIcon type={loaded.key} size={14} color={theme().color} icon={theme().icon} />
                        <span class="truncate">{theme().label}</span>
                      </span>
                    }
                    meta={
                      <Show when={theme().description ?? props.projection.description}>
                        <span class="max-w-md truncate text-11-regular text-text-weaker">
                          {theme().description ?? props.projection.description}
                        </span>
                      </Show>
                    }
                    actions={
                      <>
                        <EntriesViewToggle view={entriesView()} onViewChange={setEntriesView} />
                        <CsvImportButton collection={loaded} onImported={onImport} />
                        <button
                          class="flex items-center gap-1.5 rounded-md bg-surface-raised-base/0 px-2.5 py-1.5 text-12-medium text-text-base hover:bg-surface-raised-base/80"
                          onClick={() => void onCreateEntry()}
                        >
                          <Plus class="size-3.5" />
                          <span>{props.projection.create?.label ?? "New entry"}</span>
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
                      onSelect={(id) => setSelectedEntry(id)}
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
    </AffordanceShell>
    </ResizableSidebarLayout>
  )
}

export function CmsProjection(props: { projection: ProjectionDefinition }) {
  return (
    <TrellisStoreScope>
      <Inner projection={props.projection} />
    </TrellisStoreScope>
  )
}

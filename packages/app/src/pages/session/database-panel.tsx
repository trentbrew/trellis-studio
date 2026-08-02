import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createStore, reconcile } from "solid-js/store"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import type { StoreFact } from "@/context/trellis-store"
import {
  customProps,
  customSchema,
  entityTypeKey,
  graphTypeKey,
  mergeOntologies,
  type PropDef,
  type PropType,
  typeKey,
  visibleEntity,
} from "./database-panel-utils"
import {
  EntityIcon,
  defaultEntityColor,
  defaultEntityIcon,
  entityTypeLabel,
  type EntityTheme,
} from "@/lib/entity-theme"
import { FILTER_TYPES, GraphView } from "@/pages/trellis"
import { EntitySidebar, loadHideEmpty, saveHideEmpty, type GraphOptions } from "@/components/database/entity-sidebar"
import { RecordsTab } from "@/components/database/records-tab"
import { LinksTab } from "@/components/database/links-tab"
import { FactsTab } from "@/components/database/facts-tab"
import { EntityTypeMenu } from "@/components/database/entity-type-menu"
import { PropSchemaEditor } from "@/components/database/prop-schema-editor"
import { deleteSchemaOntology, parseSchemaProps, saveSchemaOntology } from "@/components/database/schema-ontology"
import { TypeDeleteDialog, typeDeleteImpact } from "@/components/database/type-delete-dialog"
import { TypeRenameDialog } from "@/components/database/type-rename-dialog"
import {
  RouteContent,
  RouteDetailDrawer,
  RouteHeader,
  RouteNav,
  RoutePanel,
  ResizableSidebarLayout,
  ResizableSidebarPanel,
  RouteView,
} from "@/components/route"
import { showToast } from "@opencode-ai/ui/toast"

function parseProps(raw: string | number | boolean | undefined) {
  return parseSchemaProps(raw)
}

function label(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function propType(fact: StoreFact): PropType {
  if (typeof fact.v === "boolean") return "boolean"
  if (typeof fact.v === "number") return "number"
  if (/email/i.test(fact.a) && typeof fact.v === "string" && fact.v.includes("@")) return "email"
  if (/url|uri|link/i.test(fact.a) && typeof fact.v === "string" && /^https?:\/\//.test(fact.v)) return "url"
  if (/(date|at)$/i.test(fact.a) && typeof fact.v === "string" && !Number.isNaN(new Date(fact.v).getTime()))
    return "date"
  return "text"
}

type InnerTab = "graph" | "records" | "facts" | "relationships"
type SchemaEntry = readonly [string, PropDef[], Partial<EntityTheme>]

function text(raw: string | number | boolean | undefined) {
  return typeof raw === "string" ? raw : undefined
}

function defval(defs: PropDef[], key: string) {
  return defs.find((prop) => prop.key === key)?.default
}

function resolveTheme(type: string, defs: PropDef[], meta?: Partial<EntityTheme>): EntityTheme {
  return {
    label: entityTypeLabel(type, meta?.label),
    color: meta?.color || defval(defs, "color") || defaultEntityColor(type),
    icon: meta?.icon || defval(defs, "icon") || defaultEntityIcon(type),
    description: meta?.description,
  }
}

function Inner() {
  const store = useTrellisStore()
  const mobile = createMediaQuery("(max-width: 767px)")

  const [selectedType, setSelectedType] = createSignal<string | null>(null)
  const [configType, setConfigType] = createSignal<string | null>(null)
  const [deleteType, setDeleteType] = createSignal<string | null>(null)
  const [deleteBusy, setDeleteBusy] = createSignal(false)
  const [renameType, setRenameType] = createSignal<string | null>(null)
  const [renameBusy, setRenameBusy] = createSignal(false)
  const [innerTab, setInnerTab] = createSignal<InnerTab>("graph")

  const [hideEmpty, setHideEmpty] = createSignal(loadHideEmpty())
  const [graphOptions, setGraphOptions] = createSignal<GraphOptions>({
    hidden: true,
    imports: true,
    links: true,
    ops: true,
  })
  let largeGraphDefaultsApplied = false
  createEffect(() => {
    if (!store.large || largeGraphDefaultsApplied) return
    largeGraphDefaultsApplied = true
    setGraphOptions({ hidden: false, imports: false, links: false, ops: false })
  })
  const tabs = createMemo(() => [
    { id: "graph", label: "Graph", icon: "git-branch" },
    { id: "records", label: "Records", icon: "table" },
    { id: "facts", label: "Facts", icon: "list" },
    { id: "relationships", label: "Relationships", icon: "network" },
  ])
  const fetchOptions = createMemo(() => ({
    includeHidden: graphOptions().hidden,
    includeImports: graphOptions().imports,
    includeLinks: graphOptions().links,
    includeOps: graphOptions().ops,
  }))
  const selectType = (type: string | null) => {
    setSelectedType(type)
    setInnerTab("graph")
  }

  createEffect(() => {
    if (innerTab() === "graph") return
    if (!store.ready || store.hydrated || store.loading) return
    void store.hydrate({ catalog: true })
  })

  const [schemas, setSchemas] = createStore<Record<string, PropDef[]>>({})
  const [metas, setMetas] = createStore<Record<string, Partial<EntityTheme>>>({})
  const [persistedMetas, setPersistedMetas] = createStore<Record<string, Partial<EntityTheme>>>({})

  const loadOntologies = () => {
    const byEntity = new Map<string, StoreFact[]>()
    for (const f of store.facts) {
      const arr = byEntity.get(f.e)
      if (arr) arr.push(f)
      else byEntity.set(f.e, [f])
    }
    const entries: SchemaEntry[] = store.entities
      .filter((e) => e.type === "TypeSchema")
      .map((schema) => {
        const facts = byEntity.get(schema.id) ?? []
        const prop = facts.find((f) => f.a === "props")
        const defs = parseProps(prop?.v)
        const key = typeKey(schema.id.replace(/^schema:/, ""))
        const meta: Partial<EntityTheme> = {
          label: text(facts.find((f) => f.a === "label")?.v) || key,
          description: text(facts.find((f) => f.a === "description")?.v),
          color: text(facts.find((f) => f.a === "color")?.v),
          icon: text(facts.find((f) => f.a === "icon")?.v),
        }
        return [key, defs, meta] as const
      })
    setSchemas(reconcile(Object.fromEntries(entries.map((e) => [e[0], e[1]]))))
    const nextMetas = Object.fromEntries(entries.map((e) => [e[0], e[2]]))
    setMetas(reconcile(nextMetas))
    setPersistedMetas(reconcile(nextMetas))
  }

  const ontologies = createMemo<Record<string, PropDef[]>>(() => mergeOntologies(store.entities, schemas))

  createEffect(() => {
    void store.revision
    if (store.ready) loadOntologies()
  })

  const counts = createMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const e of store.entities) {
      const t = entityTypeKey(e.type, e.id)
      map[t] = (map[t] ?? 0) + 1
    }
    return map
  })

  const allTypes = createMemo(() => {
    const set = new Set<string>(FILTER_TYPES)
    for (const t of Object.keys(ontologies())) set.add(t)
    for (const e of store.entities) if (visibleEntity(e)) set.add(entityTypeKey(e.type, e.id))
    return Array.from(set).sort()
  })

  const definedSchemas = createMemo(() => {
    const set = new Set<string>()
    for (const e of store.entities) {
      if (e.type !== "TypeSchema") continue
      set.add(typeKey(e.id.replace(/^schema:/, "")))
    }
    return set
  })

  const inferred = createMemo<Record<string, PropDef[]>>(() => {
    const records = new Map<string, string>()
    for (const e of store.entities) records.set(e.id, entityTypeKey(e.type, e.id))
    const seen = new Set<string>()
    const map: Record<string, PropDef[]> = {}
    for (const fact of store.facts) {
      const type = records.get(fact.e)
      if (!type) continue
      const key = `${type}:${fact.a}`
      if (seen.has(key)) continue
      seen.add(key)
      map[type] = [
        ...(map[type] ?? []),
        {
          key: fact.a,
          label: label(fact.a),
          type: propType(fact),
          required: fact.a === "type",
        },
      ]
    }
    return map
  })

  const themes = createMemo<Record<string, EntityTheme>>(() => {
    const next: Record<string, EntityTheme> = {}
    for (const type of allTypes()) {
      const defs = customProps(
        type,
        schemas[type] ?? customSchema(type) ?? inferred()[type] ?? ontologies()[type] ?? [],
      )
      next[type] = resolveTheme(type, defs, metas[type])
    }
    return next
  })
  const theme = (type: string) => themes()[entityTypeKey(type)] ?? resolveTheme(entityTypeKey(type), [])
  const SYSTEM = new Set<string>(FILTER_TYPES)
  const customType = (type: string) => !SYSTEM.has(type)

  const defsFor = (type: string) =>
    customProps(
      type,
      schemas[type] ?? customSchema(type) ?? inferred()[type] ?? ontologies()[type] ?? [],
    )

  const saveTypeConfig = async (type: string, defs: PropDef[], meta: EntityTheme) => {
    const key = typeKey(type)
    const ok = await saveSchemaOntology(store, key, defs, meta, {
      hasSchema: definedSchemas().has(key),
      defs: schemas[key] ?? defsFor(type),
      meta: persistedMetas[key] ?? metas[key] ?? {},
    })
    if (!ok) {
      showToast({ variant: "error", title: "Failed to save type schema" })
      return
    }
    loadOntologies()
    setConfigType(null)
  }

  const deleteTypeConfig = async (type: string) => {
    const key = typeKey(type)
    await deleteSchemaOntology(store, key, {
      defs: schemas[key] ?? defsFor(type),
      meta: persistedMetas[key] ?? metas[key] ?? {},
    })
    loadOntologies()
    if (selectedType() === type) setSelectedType(null)
    setConfigType(null)
    setDeleteType(null)
  }

  const saveRename = async (type: string, label: string) => {
    setRenameBusy(true)
    try {
      await saveTypeConfig(type, defsFor(type), { ...theme(type), label })
      setRenameType(null)
    } finally {
      setRenameBusy(false)
    }
  }

  const deleteImpact = createMemo(() => {
    const type = deleteType()
    if (!type) return null
    return typeDeleteImpact(type, theme(type), definedSchemas().has(typeKey(type)), store)
  })

  const typeMenu = (type: string) =>
    customType(type)
      ? {
          configure: () => setConfigType(type),
          rename: () => setRenameType(type),
          delete: () => setDeleteType(type),
        }
      : undefined

  return (
    <RouteView>
      <ResizableSidebarLayout id="database" defaultWidth={224} disabled={mobile()}>
        <RoutePanel compact={mobile()}>
          <Show when={!(mobile() && innerTab() === "graph")}>
            <ResizableSidebarPanel>
              {(layout) => (
                <EntitySidebar
                  width={layout.width()}
                  mobile={mobile()}
                  types={allTypes()}
                  counts={counts()}
                  systemTypes={FILTER_TYPES}
                  selectedType={selectedType()}
                  onSelectType={selectType}
                  theme={theme}
                  hideEmpty={hideEmpty()}
                  total={store.entities.length}
                  onConfigure={(type) => setConfigType(type)}
                  onRename={(type) => setRenameType(type)}
                  onDelete={(type) => setDeleteType(type)}
                />
              )}
            </ResizableSidebarPanel>
          </Show>
          <div class="flex-1 min-w-0 min-h-0 flex flex-col">
            <RouteHeader
              sidebarToggle={!(mobile() && innerTab() === "graph")}
              title={
              <Show when={selectedType()} fallback="All">
                {(t) => (
                  <span class="flex items-center gap-2 min-w-0">
                    <EntityIcon type={t()} size={14} color={theme(t()).color} icon={theme(t()).icon} />
                    <span class="truncate">{theme(t()).label}</span>
                    <span class="text-text-weaker tabular-nums shrink-0">{counts()[t()] ?? 0}</span>
                    <Show when={typeMenu(t())}>
                      {(menu) => (
                        <EntityTypeMenu
                          label={theme(t()).label}
                          onConfigure={menu().configure}
                          onRename={menu().rename}
                          onDelete={menu().delete}
                        />
                      )}
                    </Show>
                  </span>
                )}
              </Show>
            }
            actions={
              <div class="flex items-center gap-2 min-w-0">
                <Show when={store.stats}>
                  {(s) => (
                    <span class="route-header-meta ml-auto hidden sm:inline whitespace-nowrap">
                      {store.entities.length} entities · {s().totalFacts} facts · {s().totalLinks} links
                    </span>
                  )}
                </Show>
              <Show when={mobile() && innerTab() === "graph"}>
                <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                  <DropdownMenu.Trigger
                    class="flex h-7 items-center gap-1 rounded-md border border-border-base/50 bg-surface-raised-base/50 px-2 text-10-medium text-text-base"
                    aria-label="Graph filters"
                  >
                    <Icon name="sliders" size="small" />
                    Graph
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="max-h-[70vh] min-w-[220px] overflow-y-auto">
                      <DropdownMenu.Item onSelect={() => selectType(null)}>
                        <DropdownMenu.ItemLabel>
                          <span class="flex items-center justify-between gap-3">
                            <span>All entities</span>
                            <span class="text-10-regular text-text-weaker tabular-nums">{store.entities.length}</span>
                          </span>
                        </DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <For each={allTypes()}>
                        {(type) => (
                          <DropdownMenu.Item onSelect={() => selectType(type)}>
                            <DropdownMenu.ItemLabel>
                              <span class="flex items-center justify-between gap-3">
                                <span class="flex min-w-0 items-center gap-2">
                                  <EntityIcon type={type} size={14} color={theme(type).color} icon={theme(type).icon} />
                                  <span class="truncate capitalize">{theme(type).label}</span>
                                </span>
                                <span class="text-10-regular text-text-weaker tabular-nums">{counts()[type] ?? 0}</span>
                              </span>
                            </DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </Show>
              </div>
            }
          />

          <Show when={!store.ready}>
            <div class="flex-1 flex items-center justify-center text-12-regular text-text-weaker">Loading store…</div>
          </Show>
          <Show when={store.ready}>
            <div class="flex-1 min-h-0 flex flex-col">
              <RouteNav
                variant="tabs"
                items={tabs().map((tab) => ({
                  id: tab.id,
                  label: tab.label,
                  icon: <Icon name={tab.icon} size="small" />,
                }))}
                active={innerTab()}
                onSelect={(id) => setInnerTab(id as InnerTab)}
              />
              <RouteContent scroll={false}>
                <Switch>
                  <Match when={innerTab() === "records"}>
                    <RecordsTab type={selectedType() ?? undefined} theme={theme} />
                  </Match>
                  <Match when={innerTab() === "graph"}>
                    <Show
                      when={selectedType()}
                      fallback={
                        <GraphView
                          hideSidebar
                          hideEmpty={hideEmpty()}
                          onHideEmptyChange={(next) => {
                            saveHideEmpty(next)
                            setHideEmpty(next)
                          }}
                          options={fetchOptions()}
                          themes={themes()}
                          revision={store.revision}
                          highlightIds={store.fresh}
                          onOptionsChange={(next) =>
                            setGraphOptions({
                              hidden: next.includeHidden,
                              imports: next.includeImports,
                              links: next.includeLinks,
                              ops: next.includeOps,
                            })
                          }
                        />
                      }
                    >
                      {(type) => (
                        <GraphView
                          hideSidebar
                          themes={themes()}
                          revision={store.revision}
                          highlightIds={store.fresh}
                          scopedTypes={[
                            ...new Set(
                              store.entities
                                .filter((e) => entityTypeKey(e.type, e.id) === type())
                                .map((e) => graphTypeKey(e.type)),
                            ),
                          ]}
                        />
                      )}
                    </Show>
                  </Match>
                  <Match when={innerTab() === "facts"}>
                    <FactsTab type={selectedType() ?? undefined} theme={theme} />
                  </Match>
                  <Match when={innerTab() === "relationships"}>
                    <LinksTab type={selectedType() ?? undefined} theme={theme} />
                  </Match>
                </Switch>
              </RouteContent>
            </div>
          </Show>
        </div>
        <Show when={configType()} keyed>
          {(type) => (
            <RouteDetailDrawer
              side={mobile() ? "bottom" : "right"}
              width={440}
              flush
              title={
                <span class="flex items-center gap-2 normal-case tracking-normal">
                  <EntityIcon type={type} size={14} color={theme(type).color} icon={theme(type).icon} />
                  <span>{theme(type).label}</span>
                </span>
              }
              actions={
                <button
                  class="text-text-weaker hover:text-text-base"
                  onClick={() => setConfigType(null)}
                  title="Close"
                  aria-label="Close"
                >
                  <Icon name="close" size="small" />
                </button>
              }
            >
              <PropSchemaEditor
                name={type}
                defs={defsFor(type)}
                meta={theme(type)}
                defined={definedSchemas().has(typeKey(type))}
                hideHeader
                tabbed
                onDraft={(meta) => setMetas(typeKey(type), meta)}
                onSave={(defs, meta) => saveTypeConfig(type, defs, meta)}
                onDelete={() => setDeleteType(type)}
              />
            </RouteDetailDrawer>
          )}
        </Show>
      </RoutePanel>
      </ResizableSidebarLayout>
      <TypeRenameDialog
        open={renameType() !== null}
        type={renameType()}
        label={renameType() ? theme(renameType()!).label : ""}
        busy={renameBusy()}
        onClose={() => setRenameType(null)}
        onSave={(label) => {
          const type = renameType()
          if (!type) return
          void saveRename(type, label)
        }}
      />
      <TypeDeleteDialog
        open={deleteType() !== null}
        impact={deleteImpact()}
        busy={deleteBusy()}
        onClose={() => setDeleteType(null)}
        onConfirm={() => {
          const type = deleteType()
          if (!type) return
          setDeleteBusy(true)
          void deleteTypeConfig(type).finally(() => setDeleteBusy(false))
        }}
      />
    </RouteView>
  )
}

export function DatabasePanel() {
  return (
    <TrellisStoreScope>
      <Inner />
    </TrellisStoreScope>
  )
}

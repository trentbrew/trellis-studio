import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { MoreHorizontal, Plus, Settings2, Trash2, X } from "lucide-solid"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { showToast } from "@opencode-ai/ui/toast"
import { lastTrellisStoreError, useTrellisStore, type StoreFact } from "@/context/trellis-store"
import type { PropDef } from "@/pages/session/database-panel-utils"
import { EntityIcon, defaultEntityColor, defaultEntityIcon, type EntityTheme } from "@/lib/entity-theme"
import { sanitizeStoreFacts } from "@/components/cms/store-facts"
import { FieldRow, INPUT_CLASS } from "@/components/cms/fields"
import { createCmsCache, type CmsCache } from "@/components/cms/cache"
import { schemaProps } from "@/components/cms/schema"
import { resolveSchemaId, schemaFactsFor } from "@/components/cms/schema-id"
import { customProps } from "@/pages/session/database-panel-utils"
import { IconPickerDialog } from "@/components/database/prop-schema-editor"
import type { Collection } from "@/components/cms/collections-sidebar"

const FIELD_TYPES: PropDef["type"][] = [
  "text",
  "rich_text",
  "number",
  "boolean",
  "date",
  "email",
  "url",
  "color",
  "select",
  "file",
  "reference",
  "image",
  "video",
  "audio",
  "formula",
]

const SCHEMA_META_ATTRS = ["type", "label", "props", "color", "icon", "description", "cms"] as const

const BLANK = { key: "", type: "text" as PropDef["type"], required: false, default: "" }

function storeErrorToast(fallback: string) {
  showToast({ variant: "error", title: lastTrellisStoreError() ?? fallback })
}

function humanize(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function propsForStore(defs: PropDef[]): PropDef[] {
  return defs.map((def) => {
    if (def.key !== "icon" || def.type !== "select" || !def.options) return def
    const { options: _options, ...rest } = def
    return rest
  })
}

function factsForField(fid: string, schemaId: string, def: PropDef, order: number): StoreFact[] {
  const out: StoreFact[] = [
    { e: fid, a: "type", v: "Field" },
    { e: fid, a: "collection", v: schemaId },
    { e: fid, a: "key", v: def.key },
    { e: fid, a: "label", v: def.label?.trim() || humanize(def.key) },
    { e: fid, a: "kind", v: def.type },
    { e: fid, a: "order", v: order },
  ]
  if (def.required) out.push({ e: fid, a: "required", v: true })
  if (def.default) out.push({ e: fid, a: "default", v: def.default })
  if (def.options) out.push({ e: fid, a: "options", v: JSON.stringify(def.options) })
  if (def.formula) out.push({ e: fid, a: "formula", v: def.formula })
  if (def.target) out.push({ e: fid, a: "target", v: def.target })
  if (def.min != null && Number.isFinite(def.min)) out.push({ e: fid, a: "min", v: def.min })
  if (def.max != null && Number.isFinite(def.max)) out.push({ e: fid, a: "max", v: def.max })
  if (def.step != null && Number.isFinite(def.step)) out.push({ e: fid, a: "step", v: def.step })
  if (def.repeat && def.repeat !== "none") out.push({ e: fid, a: "repeat", v: def.repeat })
  return out
}

export function CollectionSettingsEditor(props: {
  collection: Collection
  cache?: CmsCache
  onDraft?: (meta: Partial<EntityTheme> | null) => void
  onDelete: () => Promise<void>
}) {
  const store = useTrellisStore()
  const data = props.cache ?? createCmsCache(store)
  const [meta, setMeta] = createStore<EntityTheme>({
    label: props.collection.label,
    color: props.collection.theme.color,
    icon: props.collection.theme.icon,
    description: props.collection.theme.description,
  })
  const [rows, setRows] = createStore<PropDef[]>([])
  const [adding, setAdding] = createSignal(false)
  const [draft, setDraft] = createStore({ ...BLANK })
  const [picker, setPicker] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [dirty, setDirty] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { defs: PropDef[]; theme: EntityTheme; metaOnly: boolean } | undefined

  const schemaId = () => resolveSchemaId(props.collection.key, store.entities, store.facts)

  const schemaFacts = () => schemaFactsFor(schemaId(), data.facts())

  const explicitSchema = createMemo<PropDef[]>(() => {
    const fact = schemaFacts().find((f) => f.a === "props")
    if (!fact || typeof fact.v !== "string") return []
    try {
      return JSON.parse(fact.v) as PropDef[]
    } catch {
      return []
    }
  })

  createEffect(() => {
    props.collection.key
    props.collection.label
    props.collection.theme.color
    props.collection.theme.icon
    props.collection.theme.description
    if (dirty()) return
    setMeta(
      reconcile({
        label: props.collection.label,
        color: props.collection.theme.color,
        icon: props.collection.theme.icon,
        description: props.collection.theme.description,
      }),
    )
    setRows(reconcile(customProps(props.collection.key, schemaProps(store.facts, schemaId()))))
  })

  const themeForStore = (theme: EntityTheme): EntityTheme => ({
    label: theme.label?.trim() || props.collection.key,
    color: theme.color || defaultEntityColor(props.collection.key),
    icon: theme.icon || defaultEntityIcon(props.collection.key),
    description: theme.description?.trim() || undefined,
  })

  const updateSchemaMeta = async (theme: EntityTheme) => {
    const id = schemaId()
    const collectionKey = props.collection.key
    const stored = themeForStore(theme)
    const current = store.facts.filter((f) => f.e === id)
    const hasSchema = current.some((f) => f.a === "type" && f.v === "TypeSchema")
    const hasProps = current.some((f) => f.a === "props")
    if (!hasSchema || !hasProps) return updateSchema([...rows], stored)

    const retracts = sanitizeStoreFacts(
      current.filter((f) => ["label", "color", "icon", "description", "cms"].includes(f.a)),
    )
    const asserts: StoreFact[] = [
      { e: id, a: "type", v: "TypeSchema" },
      { e: id, a: "label", v: stored.label },
      { e: id, a: "color", v: stored.color },
      { e: id, a: "icon", v: stored.icon },
      { e: id, a: "cms", v: true },
    ]
    if (stored.description) asserts.push({ e: id, a: "description", v: stored.description })

    if (retracts.length > 0) {
      const r = await store.retract(retracts)
      if (!r) {
        storeErrorToast("Failed to update collection")
        return false
      }
    }
    const r = await store.assert(sanitizeStoreFacts(asserts))
    if (!r) {
      storeErrorToast("Failed to update collection")
      return false
    }
    props.onDraft?.(null)
    setDirty(false)
    return true
  }

  const updateSchema = async (defs: PropDef[], theme: EntityTheme) => {
    const id = schemaId()
    const collectionKey = props.collection.key
    const stored = themeForStore(theme)
    const storedDefs = propsForStore(defs)
    const oldDefs = explicitSchema()
    const newKeys = new Set(storedDefs.map((d) => d.key))
    const retracts: StoreFact[] = sanitizeStoreFacts(
      store.facts.filter((f) => f.e === id && SCHEMA_META_ATTRS.includes(f.a as (typeof SCHEMA_META_ATTRS)[number])),
    )

    const asserts: StoreFact[] = [
      { e: id, a: "type", v: "TypeSchema" },
      { e: id, a: "label", v: stored.label },
      { e: id, a: "props", v: JSON.stringify(storedDefs) },
      { e: id, a: "color", v: stored.color },
      { e: id, a: "icon", v: stored.icon },
      { e: id, a: "cms", v: true },
    ]
    if (stored.description) asserts.push({ e: id, a: "description", v: stored.description })

    for (const old of oldDefs) {
      if (newKeys.has(old.key)) continue
      const fid = `field:${collectionKey}.${old.key}`
      retracts.push(...sanitizeStoreFacts(data.facts().get(fid) ?? []))
    }

    for (const [i, def] of storedDefs.entries()) {
      const fid = `field:${collectionKey}.${def.key}`
      retracts.push(...sanitizeStoreFacts(data.facts().get(fid) ?? []))
      asserts.push(...factsForField(fid, id, def, i))
    }

    const payload = sanitizeStoreFacts(retracts)
    if (payload.length > 0) {
      const r = await store.retract(payload)
      if (!r) {
        storeErrorToast("Failed to update collection")
        return false
      }
    }
    const r = await store.assert(sanitizeStoreFacts(asserts))
    if (!r) {
      storeErrorToast("Failed to update collection")
      return false
    }
    props.onDraft?.(null)
    setDirty(false)
    return true
  }

  let saving = false

  const runPending = async (job: { defs: PropDef[]; theme: EntityTheme; metaOnly: boolean }) => {
    if (saving) return false
    saving = true
    setBusy(true)
    try {
      return job.metaOnly ? await updateSchemaMeta(job.theme) : await updateSchema(job.defs, job.theme)
    } finally {
      saving = false
      setBusy(false)
    }
  }

  const flushPending = async () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    const job = pending
    pending = undefined
    if (!job) return
    await runPending(job)
  }

  const persist = async (defs: PropDef[], theme: EntityTheme, metaOnly = false) => {
    pending = { defs, theme, metaOnly }
    return runPending(pending)
  }

  const schedule = (defs: PropDef[], theme: EntityTheme, metaOnly = false) => {
    props.onDraft?.(theme)
    pending = { defs, theme, metaOnly }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      const job = pending
      pending = undefined
      if (job) void runPending(job)
    }, 400)
  }

  onCleanup(() => {
    void flushPending()
  })

  const patchMeta = (next: Partial<EntityTheme>) => {
    const value: EntityTheme = {
      label: next.label !== undefined ? next.label : meta.label,
      color: next.color !== undefined ? next.color : meta.color,
      icon: next.icon !== undefined ? next.icon : meta.icon,
      description: next.description !== undefined ? next.description : meta.description,
    }
    setDirty(true)
    // Full merge — reconcile() on every keystroke resets the input/caret.
    setMeta(value)
    schedule([...rows], value, true)
  }

  const patchRows = (next: PropDef[]) => {
    setDirty(true)
    setRows(reconcile(next))
    schedule(next, { ...meta }, false)
  }

  const setRow = (idx: number, patch: Partial<PropDef>) => {
    patchRows(rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  const removeRow = async (idx: number) => {
    const next = rows.filter((_, i) => i !== idx)
    setRows(reconcile(next))
    setDirty(true)
    setBusy(true)
    await updateSchema(next, { ...meta })
    setBusy(false)
  }

  const addField = async () => {
    const k = draft.key.trim()
    if (!k) {
      setAdding(false)
      return
    }
    if (rows.some((d) => d.key === k)) {
      setDraft({ ...BLANK })
      setAdding(false)
      return
    }
    const def: PropDef = { key: k, label: humanize(k), type: draft.type }
    if (draft.required) def.required = true
    const val = draft.default.trim()
    if (val) def.default = val
    const next = [...rows, def]
    setRows(reconcile(next))
    setDraft({ ...BLANK })
    setAdding(false)
    setDirty(true)
    setBusy(true)
    await updateSchema(next, { ...meta })
    setBusy(false)
  }

  const saveFieldMeta = async (idx: number, required: boolean, defaultVal: string) => {
    const row = rows[idx]
    if (!row) return
    const out: PropDef = { ...row }
    if (required) out.required = true
    else delete out.required
    const val = defaultVal.trim()
    if (val) out.default = val
    else delete out.default
    const next = rows.map((item, i) => (i === idx ? out : item))
    setRows(reconcile(next))
    setDirty(true)
    setBusy(true)
    const ok = await updateSchema(next, { ...meta })
    setBusy(false)
    if (ok) showToast({ variant: "success", title: "Field settings saved" })
  }

  const displayNameDef = (): PropDef => ({ key: "label", label: "Display name", type: "text" })
  const colorDef = (): PropDef => ({ key: "color", label: "Color", type: "color" })
  const iconDef = (): PropDef => ({ key: "icon", label: "Icon", type: "text" })
  const descDef = (): PropDef => ({ key: "description", label: "Description", type: "text" })

  return (
    <div class="h-full min-h-0 flex flex-col overflow-hidden">
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
          <FieldRow def={displayNameDef()}>
            <input
              type="text"
              class={INPUT_CLASS}
              value={meta.label}
              placeholder={props.collection.key}
              onInput={(e) => patchMeta({ label: e.currentTarget.value })}
              onBlur={() => void flushPending()}
            />
          </FieldRow>

          <FieldRow def={colorDef()}>
            <div class="flex items-center gap-2">
              <input
                type="color"
                class="size-8 shrink-0 cursor-pointer rounded border border-border-weaker-base bg-transparent"
                value={meta.color || "#000000"}
                onInput={(e) => patchMeta({ color: e.currentTarget.value })}
                onBlur={() => void flushPending()}
              />
              <input
                type="text"
                class={INPUT_CLASS}
                value={meta.color || "#000000"}
                onInput={(e) => patchMeta({ color: e.currentTarget.value })}
                onBlur={() => void flushPending()}
              />
            </div>
          </FieldRow>

          <FieldRow def={iconDef()}>
            <button
              type="button"
              class={INPUT_CLASS + " flex items-center gap-2 text-left"}
              onClick={() => setPicker(true)}
            >
              <EntityIcon type={props.collection.key} color={meta.color} icon={meta.icon} size={16} />
              <span class="truncate">{meta.icon}</span>
              <Icon name="chevron-down" size="small" class="ml-auto text-text-weaker" />
            </button>
          </FieldRow>

          <FieldRow def={descDef()}>
            <input
              type="text"
              class={INPUT_CLASS}
              placeholder="Describe what this collection represents…"
              value={meta.description ?? ""}
              onInput={(e) => patchMeta({ description: e.currentTarget.value })}
              onBlur={() => void flushPending()}
            />
          </FieldRow>

          <Show when={rows.length > 0}>
            <div class="border-t border-border-weaker-base pt-1" />
          </Show>

          <For each={rows}>
            {(def, idx) => (
              <div class="relative flex flex-col gap-1 group">
                <FieldRow def={def}>
                  <input
                    type="text"
                    class={INPUT_CLASS}
                    value={def.label}
                    placeholder={def.key}
                    onInput={(e) => setRow(idx(), { label: e.currentTarget.value })}
                  />
                </FieldRow>
                <div class="absolute top-0.5 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                    <DropdownMenu.Trigger
                      class="rounded p-0.5 text-text-weaker transition-colors hover:bg-surface-raised-base/50 hover:text-text-base"
                      title="Field settings"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Settings2 class="size-3.5" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content class="min-w-[220px] p-2">
                        <div class="flex flex-col gap-2">
                          <div class="text-10-medium uppercase tracking-wide text-text-weaker">Field settings</div>
                          <div class="flex flex-col gap-1">
                            <span class="text-10-medium uppercase tracking-wide text-text-weaker">Key</span>
                            <span class="font-mono text-11-regular text-text-base">{def.key}</span>
                          </div>
                          <label class="flex items-center gap-2 text-11-regular text-text-base">
                            <input
                              type="checkbox"
                              class="size-3.5 accent-text-strong"
                              checked={!!def.required}
                              onChange={(e) => void saveFieldMeta(idx(), e.currentTarget.checked, def.default ?? "")}
                            />
                            <span>Required to publish</span>
                          </label>
                          <div class="flex flex-col gap-1">
                            <span class="text-10-medium uppercase tracking-wide text-text-weaker">Default value</span>
                            <input
                              type="text"
                              class={INPUT_CLASS}
                              placeholder="Applied when creating new entries"
                              value={def.default ?? ""}
                              onInput={(e) => setRow(idx(), { default: e.currentTarget.value })}
                              onBlur={(e) => void saveFieldMeta(idx(), !!def.required, e.currentTarget.value)}
                            />
                          </div>
                        </div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                  <button
                    type="button"
                    class="rounded p-0.5 text-red-400 hover:text-red-600"
                    onClick={() => void removeRow(idx())}
                    title="Remove field from schema"
                  >
                    <X class="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </For>

          <div class="border-t border-border-weaker-base pt-4">
            <Show
              when={adding()}
              fallback={
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 transition-colors"
                  onClick={() => setAdding(true)}
                >
                  <Plus class="size-3.5" />
                  <span>Add field</span>
                </button>
              }
            >
              <div class="flex flex-col gap-2">
                <div class="flex items-end gap-2 flex-wrap">
                  <div class="flex-1 min-w-40 flex flex-col gap-1">
                    <span class="text-11-medium text-text-weak">Field name</span>
                    <input
                      autofocus
                      type="text"
                      class={INPUT_CLASS}
                      placeholder="title"
                      value={draft.key}
                      onInput={(e) => setDraft("key", e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addField()
                        if (e.key === "Escape") {
                          setDraft({ ...BLANK })
                          setAdding(false)
                        }
                      }}
                    />
                  </div>
                  <div class="flex flex-col gap-1 w-32">
                    <span class="text-11-medium text-text-weak">Type</span>
                    <select
                      class={INPUT_CLASS + " appearance-none cursor-pointer"}
                      value={draft.type}
                      onChange={(e) => setDraft("type", e.currentTarget.value as PropDef["type"])}
                    >
                      <For each={FIELD_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
                    </select>
                  </div>
                  <label class="h-[30px] flex items-center gap-1.5 px-2 rounded border border-border-weaker-base text-11-medium text-text-weak">
                    <input
                      type="checkbox"
                      class="size-3.5 accent-text-strong"
                      checked={draft.required}
                      onChange={(e) => setDraft("required", e.currentTarget.checked)}
                    />
                    <span>Required</span>
                  </label>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-md text-12-medium bg-surface-raised-base hover:bg-surface-raised-base/80 transition-colors"
                    onClick={() => void addField()}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1.5 text-12-regular text-text-weaker hover:text-text-base"
                    onClick={() => {
                      setDraft({ ...BLANK })
                      setAdding(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2 flex items-center gap-2 bg-surface-base">
        <span class="min-w-0 flex-1 truncate font-mono text-11-regular text-text-weaker">{props.collection.key}</span>
        <Show when={busy()}>
          <span class="text-10-regular text-text-weaker">Saving…</span>
        </Show>
        <DropdownMenu placement="top-end" gutter={6} modal={false}>
          <DropdownMenu.Trigger
            class="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-raised-base/60 hover:text-text-base"
            title="Collection actions"
          >
            <MoreHorizontal class="size-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="min-w-[160px]">
              <DropdownMenu.Item
                onSelect={() => {
                  void (async () => {
                    await flushPending()
                    await runPending({
                      defs: [...rows],
                      theme: themeForStore({ ...meta }),
                      metaOnly: schemaFacts().some((f) => f.a === "props"),
                    })
                  })()
                }}
              >
                <DropdownMenu.ItemLabel>
                  <span class="flex items-center gap-2">Save now</span>
                </DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
              <Show when={!props.collection.inferred}>
                <DropdownMenu.Item
                  onSelect={() => {
                    if (window.confirm(`Delete collection "${props.collection.key}"?`)) void props.onDelete()
                  }}
                >
                  <DropdownMenu.ItemLabel>
                    <span class="flex items-center gap-2 text-red-400">
                      <Trash2 class="size-3.5" />
                      <span>Delete collection</span>
                    </span>
                  </DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>

      <IconPickerDialog
        open={picker()}
        value={meta.icon}
        color={meta.color}
        type={props.collection.key}
        onClose={() => setPicker(false)}
        onSelect={(icon) => {
          patchMeta({ icon })
          setPicker(false)
          flushPending()
        }}
      />
    </div>
  )
}

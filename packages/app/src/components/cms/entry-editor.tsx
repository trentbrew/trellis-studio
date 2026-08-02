import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Copy, FileEdit, Globe, MoreHorizontal, Plus, Settings2, Trash2, X } from "lucide-solid"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useTrellisStore, type StoreFact } from "@/context/trellis-store"
import type { PropDef } from "@/pages/session/database-panel-utils"
import { Field, type FieldValue } from "@/components/cms/fields"
import { useCollections, type Collection } from "@/components/cms/collections-sidebar"
import { formula } from "@/components/cms/formula"
import { createCmsCache, type CmsCache } from "@/components/cms/cache"
import { DialogPublishChecklist } from "@/components/cms/dialog-publish-checklist"
import { aliasName, slugify } from "@/components/cms/display"
import { publishBlocks } from "@/components/cms/schema"

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

const REPEATS: NonNullable<PropDef["repeat"]>[] = ["none", "daily", "weekly", "monthly", "yearly"]

const BLANK = {
  key: "",
  type: "text" as PropDef["type"],
  target: "",
  formula: "",
  options: "",
  min: "",
  max: "",
  step: "",
  repeat: "none" as NonNullable<PropDef["repeat"]>,
  required: false,
  default: "",
}

const INPUT_CLASS =
  "w-full bg-surface-raised-base/40 border border-border-weaker-base rounded px-2 py-1.5 text-12-regular text-text-base outline-0 focus:border-border-base"

const CORE_FIELDS: PropDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "slug", label: "Slug", type: "text", required: true },
]

function humanize(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

const isEmpty = (v: FieldValue) => v === undefined || v === null || v === ""
const core = (key: string) => CORE_FIELDS.some((def) => def.key === key)
const num = (value: string) => {
  const n = Number(value)
  return value.trim() === "" || !Number.isFinite(n) ? undefined : n
}

function withCore(defs: PropDef[]) {
  const by = new Map(defs.map((def) => [def.key, def]))
  const rest = defs.filter((def) => !core(def.key) && def.key !== "title")
  return [...CORE_FIELDS.map((def) => ({ ...by.get(def.key), ...def })), ...rest]
}

function FieldMetaMenu(props: { def: PropDef; onSave: (required: boolean, value: string) => void }) {
  const [required, setRequired] = createSignal(!!props.def.required)
  const [value, setValue] = createSignal(props.def.default ?? "")
  createEffect(() => {
    props.def.key
    setRequired(!!props.def.required)
    setValue(props.def.default ?? "")
  })
  return (
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
            <label class="flex items-center gap-2 text-11-regular text-text-base">
              <input
                type="checkbox"
                class="size-3.5 accent-text-strong"
                checked={required()}
                onChange={(event) => setRequired(event.currentTarget.checked)}
              />
              <span>Required to publish</span>
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-10-medium uppercase tracking-wide text-text-weaker">Default value</span>
              <input
                type="text"
                class={INPUT_CLASS}
                placeholder="Applied when creating new entries"
                value={value()}
                onInput={(event) => setValue(event.currentTarget.value)}
              />
            </div>
            <button
              type="button"
              class="self-end rounded-md bg-text-strong px-2.5 py-1 text-11-medium text-background-base"
              onClick={() => props.onSave(required(), value())}
            >
              Save
            </button>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}

export function EntryEditor(props: {
  entryId: string
  collection: Collection
  cache?: CmsCache
  collections?: () => Collection[]
  onDelete: () => void
  onDuplicate?: (id: string) => void | Promise<void>
}) {
  const store = useTrellisStore()
  const dialog = useDialog()
  const data = props.cache ?? createCmsCache(store)

  const schemaFacts = () => data.facts().get(props.collection.schemaId) ?? []
  const entryFacts = () => data.facts().get(props.entryId) ?? []
  const collectionEntries = createMemo(() => data.entities(props.collection.key))

  const schemaJson = createMemo(() => {
    const fact = schemaFacts().find((f) => f.a === "props")
    return fact && typeof fact.v === "string" ? fact.v : "[]"
  })

  const explicitSchema = createMemo<PropDef[]>(() => {
    try {
      return JSON.parse(schemaJson()) as PropDef[]
    } catch {
      return []
    }
  })

  const inferredSchema = createMemo<PropDef[]>(() => {
    const seen = new Map<string, PropDef>()
    for (const e of collectionEntries()) {
      for (const fact of data.facts().get(e.id) ?? []) {
        if (fact.a === "type" || fact.a === "cms_status") continue
        if (seen.has(fact.a)) continue
        let kind: PropDef["type"] = "text"
        const v = fact.v
        if (typeof v === "boolean") kind = "boolean"
        else if (typeof v === "number") kind = "number"
        else if (typeof v === "string") {
          if (/^https?:\/\//.test(v)) kind = "url"
          else if (/email/i.test(fact.a) && v.includes("@")) kind = "email"
          else if (/(date|at)$/i.test(fact.a) && !Number.isNaN(new Date(v).getTime())) kind = "date"
        }
        seen.set(fact.a, {
          key: fact.a,
          label: fact.a.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          type: kind,
        })
      }
    }
    return Array.from(seen.values())
  })

  const schema = createMemo<PropDef[]>(() => {
    const explicit = explicitSchema()
    if (explicit.length > 0) return withCore(explicit)
    if (props.collection.inferred) return withCore(inferredSchema())
    return withCore([])
  })

  const [drafts, setDrafts] = createStore<Record<string, FieldValue>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const valueOf = (key: string): FieldValue => {
    if (key in drafts) return drafts[key]
    const f = entryFacts().find((fact) => fact.a === key)
    if (f) return f.v
    if (key === "name") return aliasName(entryFacts())?.value
    if (key === "slug") {
      const name = valueOf("name")
      if (typeof name === "string" && name.trim()) return slugify(name)
    }
  }

  createEffect(() => {
    const id = props.entryId
    const facts = entryFacts()
    const alias = aliasName(facts)
    if (!alias) return
    const name = alias.value
    const slug = slugify(name)
    void (async () => {
      const r = await store.assert([
        { e: id, a: "name", v: name },
        { e: id, a: "slug", v: slug },
      ])
      if (!r) return
      const legacy = facts.find((f) => f.a === alias.key)
      if (legacy) await store.retract([legacy])
    })()
  })

  const commitField = async (entryId: string, key: string, value: FieldValue) => {
    const existing = (data.facts().get(entryId) ?? []).find((f) => f.a === key)
    if (existing) {
      const r = await store.retract([existing])
      if (!r) {
        showToast({ variant: "error", title: `Failed to update "${key}"` })
        return
      }
    }
    if (!isEmpty(value)) {
      const r = await store.assert([{ e: entryId, a: key, v: value as string | number | boolean }])
      if (!r) {
        showToast({ variant: "error", title: `Failed to save "${key}"` })
        return
      }
    }
    setDrafts(
      produce((s) => {
        delete s[key]
      }),
    )
  }

  const schedule = (entryId: string, key: string, value: FieldValue) => {
    const t = timers.get(key)
    if (t) clearTimeout(t)
    const timer = setTimeout(() => {
      void commitField(entryId, key, value)
      timers.delete(key)
    }, 400)
    timers.set(key, timer)
  }

  const handleChange = (key: string, value: FieldValue) => {
    const entryId = props.entryId
    if (key === "name") {
      const before = valueOf("name")
      const slug = valueOf("slug")
      const next = slugify(value)
      const sync = isEmpty(slug) || slug === slugify(before)
      if (sync) {
        setDrafts("slug", next || undefined)
        schedule(entryId, "slug", next || undefined)
      }
    }
    setDrafts(key, value)
    schedule(entryId, key, value)
  }

  onCleanup(() => {
    const entryId = props.entryId
    for (const [key, t] of timers) {
      clearTimeout(t)
      const v = drafts[key]
      void commitField(entryId, key, v)
    }
    timers.clear()
  })

  const factsForField = (fid: string, schemaId: string, def: PropDef, order: number): StoreFact[] => {
    const out: StoreFact[] = [
      { e: fid, a: "type", v: "Field" },
      { e: fid, a: "collection", v: schemaId },
      { e: fid, a: "key", v: def.key },
      { e: fid, a: "label", v: def.label },
      { e: fid, a: "kind", v: def.type },
      { e: fid, a: "order", v: order },
    ]
    if (def.required) out.push({ e: fid, a: "required", v: true })
    if (def.default) out.push({ e: fid, a: "default", v: def.default })
    if (def.options) out.push({ e: fid, a: "options", v: JSON.stringify(def.options) })
    if (def.formula) out.push({ e: fid, a: "formula", v: def.formula })
    if (def.target) out.push({ e: fid, a: "target", v: def.target })
    if (def.min !== undefined) out.push({ e: fid, a: "min", v: def.min })
    if (def.max !== undefined) out.push({ e: fid, a: "max", v: def.max })
    if (def.step !== undefined) out.push({ e: fid, a: "step", v: def.step })
    if (def.repeat && def.repeat !== "none") out.push({ e: fid, a: "repeat", v: def.repeat })
    return out
  }

  const updateSchema = async (defs: PropDef[]) => {
    const schemaId = props.collection.schemaId
    const collectionKey = props.collection.key
    const oldDefs = explicitSchema()
    const newKeys = new Set(defs.map((d) => d.key))

    const retracts: StoreFact[] = []
    const asserts: StoreFact[] = []

    const hasTypeFact = schemaFacts().some((f) => f.a === "type" && f.v === "TypeSchema")
    if (!hasTypeFact) {
      asserts.push({ e: schemaId, a: "type", v: "TypeSchema" })
      asserts.push({ e: schemaId, a: "label", v: props.collection.label })
      asserts.push({ e: schemaId, a: "cms", v: true })
    }

    const oldProps = schemaFacts().find((f) => f.a === "props")
    if (oldProps) retracts.push(oldProps)
    asserts.push({ e: schemaId, a: "props", v: JSON.stringify(defs) })

    for (const old of oldDefs) {
      if (newKeys.has(old.key)) continue
      const fid = `field:${collectionKey}.${old.key}`
      retracts.push(...(data.facts().get(fid) ?? []))
    }

    for (const [i, def] of defs.entries()) {
      const fid = `field:${collectionKey}.${def.key}`
      retracts.push(...(data.facts().get(fid) ?? []))
      asserts.push(...factsForField(fid, schemaId, def, i))
    }

    if (retracts.length > 0) {
      const r = await store.retract(retracts)
      if (!r) {
        showToast({ variant: "error", title: "Failed to update schema" })
        return false
      }
    }
    const r = await store.assert(asserts)
    if (!r) {
      showToast({ variant: "error", title: "Failed to update schema" })
      return false
    }
    return true
  }

  const collections = props.collections ?? useCollections(props.cache)
  const [adding, setAdding] = createSignal(false)
  const [draft, setDraft] = createStore({ ...BLANK })

  const otherCollections = createMemo(() => collections().filter((c) => c.key !== props.collection.key))
  const clear = () => setDraft({ ...BLANK })

  const addField = async () => {
    const k = draft.key.trim()
    if (!k) {
      setAdding(false)
      return
    }
    if (schema().some((d) => d.key === k)) {
      clear()
      setAdding(false)
      return
    }
    if (core(k)) {
      clear()
      setAdding(false)
      return
    }
    const def: PropDef = { key: k, label: humanize(k), type: draft.type }
    const opts = draft.options
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    if (draft.required) def.required = true
    const val = draft.default.trim()
    if (val) def.default = val
    if (draft.type === "reference" && draft.target) def.target = draft.target
    if (draft.type === "formula") def.formula = draft.formula.trim()
    if (draft.type === "select" && opts.length > 0) def.options = opts
    if (draft.type === "number") {
      def.min = num(draft.min)
      def.max = num(draft.max)
      def.step = num(draft.step)
    }
    if (draft.type === "date" && draft.repeat !== "none") def.repeat = draft.repeat
    await updateSchema([...schema(), def])
    clear()
    setAdding(false)
  }

  const removeField = async (key: string) => {
    if (core(key)) return
    await updateSchema(schema().filter((d) => d.key !== key))
  }

  const saveFieldMeta = async (key: string, required: boolean, defaultVal: string) => {
    const next = schema().map((d) => {
      if (d.key !== key) return d
      const out: PropDef = { ...d }
      if (required) out.required = true
      else delete out.required
      const val = defaultVal.trim()
      if (val) out.default = val
      else delete out.default
      return out
    })
    const ok = await updateSchema(next)
    if (ok) showToast({ variant: "success", title: "Field settings saved" })
  }

  const deleteEntry = async () => {
    const list = entryFacts()
    if (list.length > 0) await store.retract(list)
    props.onDelete()
  }

  const status = createMemo<"draft" | "published">(() => {
    const f = entryFacts().find((fact) => fact.a === "cms_status")
    return f?.v === "published" ? "published" : "draft"
  })

  const togglePublish = async () => {
    const next = status() === "published" ? "draft" : "published"
    if (next === "published") {
      const blocks = publishBlocks(schema(), [props.entryId], (_id, key) => valueOf(key))
      if (blocks.length > 0) {
        dialog.show(() => (
          <DialogPublishChecklist
            blocks={blocks}
            label={() => {
              const name = valueOf("name")
              if (typeof name === "string" && name.trim()) return name
              return props.entryId.replace(`${props.collection.key}:`, "")
            }}
            short={(id) => id.replace(`${props.collection.key}:`, "")}
          />
        ))
        return
      }
    }
    const existing = entryFacts().find((f) => f.a === "cms_status")
    if (existing) {
      const r = await store.retract([existing])
      if (!r) {
        showToast({ variant: "error", title: "Failed to update status" })
        return
      }
    }
    const r = await store.assert([{ e: props.entryId, a: "cms_status", v: next }])
    if (!r) {
      showToast({ variant: "error", title: "Failed to update status" })
      return
    }
    showToast({
      variant: "success",
      title: next === "published" ? "Published" : "Moved to drafts",
    })
  }

  const fields = createMemo<Record<string, FieldValue>>(() => {
    const out = Object.fromEntries(schema().map((def) => [def.key, valueOf(def.key)])) as Record<string, FieldValue>
    const defs = schema().filter((def) => def.type === "formula" && def.formula?.trim())
    for (let pass = 0; pass < defs.length; pass++) {
      for (const def of defs) out[def.key] = formula(def.formula ?? "", out)
    }
    return out
  })

  return (
    <div class="h-full min-h-0 flex flex-col overflow-hidden">
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
          <Show
            when={schema().length > 0}
            fallback={
              <div class="text-12-regular text-text-weaker italic text-center py-4">
                No fields yet — add one below to start editing this entry.
              </div>
            }
          >
            <For each={schema()}>
              {(def) => (
                <div class="relative flex flex-col gap-1 group">
                  <Field
                    def={def}
                    value={() => (def.type === "formula" ? fields()[def.key] : valueOf(def.key))}
                    values={fields}
                    onChange={(v) => handleChange(def.key, v)}
                  />
                  <div class="absolute top-0.5 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Show when={def.type !== "formula"}>
                      <FieldMetaMenu
                        def={def}
                        onSave={(required, value) => void saveFieldMeta(def.key, required, value)}
                      />
                    </Show>
                    <Show when={!core(def.key)}>
                      <button
                        class="rounded p-0.5 text-red-400 hover:text-red-600"
                        onClick={() => void removeField(def.key)}
                        title="Remove field from schema"
                      >
                        <X class="size-3.5" />
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <div class="border-t border-border-weaker-base pt-4">
            <Show
              when={adding()}
              fallback={
                <button
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
                          clear()
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
                  <Show when={draft.type !== "formula"}>
                    <div class="flex flex-col gap-1 min-w-40 flex-1">
                      <span class="text-11-medium text-text-weak">Default</span>
                      <input
                        type="text"
                        class={INPUT_CLASS}
                        placeholder="New entry default"
                        value={draft.default}
                        onInput={(e) => setDraft("default", e.currentTarget.value)}
                      />
                    </div>
                  </Show>
                  <button
                    class="px-3 py-1.5 rounded-md text-12-medium bg-surface-raised-base hover:bg-surface-raised-base/80 transition-colors"
                    onClick={() => void addField()}
                  >
                    Add
                  </button>
                  <button
                    class="px-2 py-1.5 text-12-regular text-text-weaker hover:text-text-base"
                    onClick={() => {
                      clear()
                      setAdding(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <Show when={draft.type === "reference"}>
                  <div class="flex flex-col gap-1 max-w-48">
                    <span class="text-11-medium text-text-weak">Target</span>
                    <select
                      class={INPUT_CLASS + " appearance-none cursor-pointer"}
                      value={draft.target}
                      onChange={(e) => setDraft("target", e.currentTarget.value)}
                    >
                      <option value="">— any —</option>
                      <For each={otherCollections()}>{(c) => <option value={c.key}>{c.label}</option>}</For>
                    </select>
                  </div>
                </Show>
                <Show when={draft.type === "select"}>
                  <div class="flex flex-col gap-1">
                    <span class="text-11-medium text-text-weak">Options</span>
                    <input
                      type="text"
                      class={INPUT_CLASS}
                      placeholder="Draft, Published, Archived"
                      value={draft.options}
                      onInput={(e) => setDraft("options", e.currentTarget.value)}
                    />
                  </div>
                </Show>
                <Show when={draft.type === "number"}>
                  <div class="grid grid-cols-3 gap-2">
                    <div class="flex flex-col gap-1">
                      <span class="text-11-medium text-text-weak">Min</span>
                      <input
                        type="number"
                        class={INPUT_CLASS}
                        value={draft.min}
                        onInput={(e) => setDraft("min", e.currentTarget.value)}
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <span class="text-11-medium text-text-weak">Max</span>
                      <input
                        type="number"
                        class={INPUT_CLASS}
                        value={draft.max}
                        onInput={(e) => setDraft("max", e.currentTarget.value)}
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <span class="text-11-medium text-text-weak">Step</span>
                      <input
                        type="number"
                        class={INPUT_CLASS}
                        value={draft.step}
                        onInput={(e) => setDraft("step", e.currentTarget.value)}
                      />
                    </div>
                  </div>
                </Show>
                <Show when={draft.type === "date"}>
                  <div class="flex flex-col gap-1 max-w-48">
                    <span class="text-11-medium text-text-weak">Repeat</span>
                    <select
                      class={INPUT_CLASS + " appearance-none cursor-pointer"}
                      value={draft.repeat}
                      onChange={(e) => setDraft("repeat", e.currentTarget.value as NonNullable<PropDef["repeat"]>)}
                    >
                      <For each={REPEATS}>{(item) => <option value={item}>{item}</option>}</For>
                    </select>
                  </div>
                </Show>
                <Show when={draft.type === "formula"}>
                  <div class="flex flex-col gap-1">
                    <span class="text-11-medium text-text-weak">Formula</span>
                    <input
                      type="text"
                      class={INPUT_CLASS + " font-mono"}
                      placeholder="{price} * {quantity}"
                      value={draft.formula}
                      onInput={(e) => setDraft("formula", e.currentTarget.value)}
                    />
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2 flex items-center gap-2 bg-surface-base">
        <span class="min-w-0 flex-1 truncate font-mono text-11-regular text-text-weaker">{props.entryId}</span>
        <Show when={status() === "published"}>
          <span class="shrink-0 rounded px-1.5 py-0.5 text-9-medium uppercase tracking-wide bg-emerald-500/15 text-emerald-400">
            Live
          </span>
        </Show>
        <Show when={status() === "draft"}>
          <span class="shrink-0 rounded px-1.5 py-0.5 text-9-medium uppercase tracking-wide bg-zinc-500/15 text-zinc-400">
            Draft
          </span>
        </Show>
        <DropdownMenu placement="top-end" gutter={6} modal={false}>
          <DropdownMenu.Trigger
            class="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weaker transition-colors hover:bg-surface-raised-base/60 hover:text-text-base"
            title="Entry actions"
          >
            <MoreHorizontal class="size-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="min-w-[160px]">
              <Show when={status() === "draft"}>
                <DropdownMenu.Item onSelect={() => void togglePublish()}>
                  <DropdownMenu.ItemLabel>
                    <span class="flex items-center gap-2 text-emerald-400">
                      <Globe class="size-3.5" />
                      <span>Publish</span>
                    </span>
                  </DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
              <Show when={status() === "published"}>
                <DropdownMenu.Item onSelect={() => void togglePublish()}>
                  <DropdownMenu.ItemLabel>
                    <span class="flex items-center gap-2">
                      <FileEdit class="size-3.5 text-icon-weak" />
                      <span>Unpublish</span>
                    </span>
                  </DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
              <Show when={props.onDuplicate}>
                <DropdownMenu.Item onSelect={() => void props.onDuplicate?.(props.entryId)}>
                  <DropdownMenu.ItemLabel>
                    <span class="flex items-center gap-2">
                      <Copy class="size-3.5 text-icon-weak" />
                      <span>Duplicate</span>
                    </span>
                  </DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
              <DropdownMenu.Item onSelect={() => void deleteEntry()}>
                <DropdownMenu.ItemLabel>
                  <span class="flex items-center gap-2 text-red-400">
                    <Trash2 class="size-3.5" />
                    <span>Delete</span>
                  </span>
                </DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </div>
    </div>
  )
}

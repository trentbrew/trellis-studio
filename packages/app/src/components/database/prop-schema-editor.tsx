import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { RouteNav } from "@/components/route"
import { SchemaVersions } from "@/components/database/schema-versions"
import {
  lockedProp,
  PROP_TYPE_ICONS,
  sortPropDefs,
  type PropDef,
  type PropType,
  typeKey,
} from "@/pages/session/database-panel-utils"
import { ENTITY_ICON_KEYS, EntityIcon, type EntityTheme } from "@/lib/entity-theme"
import {
  catalogStorageValue,
  CUSTOM_ICON_CATALOG,
  LUCIDE_ICON_CATALOG,
  lucideCategoryNames,
  lucideIconsForCategory,
  searchIconCatalog,
  type IconCatalogEntry,
} from "@/lib/icon-catalog"
import { iconDisplayLabel, iconsMatch } from "@/lib/icon-key"

type ConfigTab = "configure" | "properties" | "versions"

const TABS: { id: ConfigTab; label: string; icon: string }[] = [
  { id: "configure", label: "Configure", icon: "settings-gear" },
  { id: "properties", label: "Properties", icon: "list" },
  { id: "versions", label: "Versions", icon: "branch" },
]

const ALL_PROP_TYPES: PropType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "email",
  "url",
  "color",
  "select",
  "multiselect",
  "file",
  "formula",
]

export function PropSchemaEditor(props: {
  name: string
  defs: PropDef[]
  meta: EntityTheme
  defined: boolean
  readonly?: boolean
  hideHeader?: boolean
  metaLayout?: "grid" | "row"
  tabbed?: boolean
  onSave: (defs: PropDef[], meta: EntityTheme) => Promise<void>
  onDraft?: (meta: EntityTheme) => void
  onDelete: () => void
}) {
  const [rows, setRows] = createStore<PropDef[]>([])
  const [meta, setMeta] = createStore<EntityTheme>({ label: "", color: "#000000", icon: "thing" })
  const [busy, setBusy] = createSignal(false)
  const [confirmDelete, setConfirmDelete] = createSignal(false)
  const [picker, setPicker] = createSignal(false)
  const [tab, setTab] = createSignal<ConfigTab>("configure")
  const editTab = () => !props.tabbed || tab() === "configure" || tab() === "properties"

  createEffect(() => {
    setRows(reconcile(sortPropDefs(props.defs.map((d) => ({ ...d })))))
  })

  createEffect(() => {
    setMeta(reconcile({ ...props.meta }))
  })

  const locked = createMemo(() => rows.map((row, idx) => ({ row, idx })).filter((item) => lockedProp(item.row.key)))
  const editable = createMemo(() => rows.map((row, idx) => ({ row, idx })).filter((item) => !lockedProp(item.row.key)))
  const addProp = () => setRows(rows.length, { key: "", label: "", type: "text" })
  const removeProp = (i: number) => {
    if (lockedProp(rows[i]?.key ?? "")) return
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }
  const setDefault = (key: string, value: string) => {
    const idx = rows.findIndex((row) => row.key === key)
    if (idx >= 0) setRows(idx, "default", value)
  }
  const setDraft = (next: Partial<EntityTheme>) => {
    const value = { ...meta, ...next }
    setMeta(reconcile(value))
    props.onDraft?.(value)
    if (next.color) setDefault("color", next.color)
    if (next.icon) setDefault("icon", next.icon)
  }

  const save = async () => {
    if (props.readonly) return
    setBusy(true)
    try {
      await props.onSave(
        rows.filter((r) => r.key.trim()),
        meta,
      )
    } finally {
      setBusy(false)
    }
  }

  const row = () => props.metaLayout === "row"

  return (
    <div class="db-schema-editor" classList={{ "db-schema-editor--tabbed": !!props.tabbed }}>
      <Show when={!props.hideHeader}>
        <div class="db-detail-header">
          <span class="db-detail-id">{props.name}</span>
          <div class="db-detail-header-actions">
            <Show when={props.readonly}>
              <span class="text-11-medium text-text-weaker">Read-only</span>
            </Show>
            <Show when={props.defined && !props.readonly}>
              <Show
                when={confirmDelete()}
                fallback={
                  <button class="db-detail-close" title="Delete type" onClick={() => setConfirmDelete(true)}>
                    <Icon name="trash-2" size="small" />
                  </button>
                }
              >
                <span class="db-create-error" style="font-size:0.75rem">
                  Delete?
                </span>
                <button
                  class="db-action-btn db-action-btn--danger"
                  onClick={() => {
                    setBusy(true)
                    void props.onDelete()
                  }}
                  disabled={busy()}
                >
                  Yes
                </button>
                <button class="db-action-btn" onClick={() => setConfirmDelete(false)}>
                  No
                </button>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={props.tabbed}>
        <RouteNav
          variant="tabs"
          items={TABS.map((item) => ({
            id: item.id,
            label: item.label,
            icon: <Icon name={item.icon as "list"} size="small" />,
          }))}
          active={tab()}
          onSelect={(id) => setTab(id as ConfigTab)}
        />
      </Show>
      <div class="db-detail-scroll">
        <div class="db-schema-prop-list">
          <Show when={!props.tabbed || tab() === "configure"}>
          <Show when={props.tabbed}>
            <div class="db-detail-id db-detail-id--tabbed">{typeKey(props.name)}</div>
          </Show>
          <div class="db-schema-meta" classList={{ "db-schema-meta--row": row() && !props.tabbed }}>
            <label class="db-schema-meta-card db-schema-meta-card--wide">
              <Show when={!row()}>
                <span class="db-field-label">Display name</span>
              </Show>
              <input
                class="db-field-input"
                placeholder="Display name"
                value={meta.label}
                disabled={props.readonly}
                onInput={(e) => setDraft({ label: e.currentTarget.value })}
              />
            </label>
            <div class="db-schema-meta-card">
              <Show when={!row()}>
                <span class="db-field-label">Color</span>
              </Show>
              <div class="db-color-wrap">
                <input
                  type="color"
                  class="db-color-input"
                  value={meta.color || "#000000"}
                  disabled={props.readonly}
                  onInput={(e) => setDraft({ color: e.currentTarget.value })}
                />
                <span class="db-color-hex">{meta.color || "#000000"}</span>
              </div>
            </div>
            <div class="db-schema-meta-card">
              <Show when={!row()}>
                <span class="db-field-label">Icon</span>
              </Show>
              <button class="db-icon-pick" disabled={props.readonly} onClick={() => setPicker(true)}>
                <EntityIcon type={props.name} color={meta.color} icon={meta.icon} size={16} />
                <span class="truncate">{meta.icon}</span>
                <Icon name="chevron-down" size="small" />
              </button>
            </div>
            <label class="db-schema-meta-card db-schema-meta-card--wide">
              <Show when={!row()}>
                <span class="db-field-label">Description</span>
              </Show>
              <Show
                when={row()}
                fallback={
                  <textarea
                    class="db-field-input db-schema-desc"
                    placeholder="Describe what this collection represents…"
                    value={meta.description ?? ""}
                    disabled={props.readonly}
                    onInput={(e) => setDraft({ description: e.currentTarget.value })}
                  />
                }
              >
                <input
                  class="db-field-input"
                  placeholder="Description"
                  value={meta.description ?? ""}
                  disabled={props.readonly}
                  onInput={(e) => setDraft({ description: e.currentTarget.value })}
                />
              </Show>
            </label>
          </div>
          <div class="db-schema-permissions">
            <div class="db-schema-permissions-head">
              <span class="db-field-label">Permissions</span>
              <span class="db-schema-permissions-badge">Coming soon</span>
            </div>
            <p class="db-schema-permissions-copy">
              Per-type access control is not wired yet. The store has no role or visibility facts on TypeSchema; agent
              tool permissions in Settings are session-wide, not per entity type.
            </p>
          </div>
          </Show>
          <Show when={!props.tabbed || tab() === "properties"}>
          <Show when={locked().length > 0}>
            <div class="db-schema-prop-section-label">System fields</div>
          </Show>
          <For each={locked()}>
            {(item) => (
              <div class="db-schema-prop-row db-schema-prop-row--readonly db-schema-prop-row--locked">
                <span class="db-schema-type-icon" title={item.row.type}>
                  <Icon name={PROP_TYPE_ICONS[item.row.type]} size="small" />
                </span>
                <input class="db-field-input db-field-input--sm" value={item.row.key} disabled />
                <input class="db-field-input db-field-input--sm" value={item.row.label} disabled />
                <select class="db-select db-select--sm" value={item.row.type} disabled>
                  <For each={ALL_PROP_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
                </select>
                <label class="db-schema-required">
                  <input type="checkbox" class="db-checkbox" checked={item.row.required ?? false} disabled />
                  Req
                </label>
                <span class="db-schema-lock" title="System field">
                  <Icon name="lock" size="small" />
                </span>
              </div>
            )}
          </For>
          <Show when={locked().length > 0 && editable().length > 0}>
            <div class="db-schema-prop-section-label">Custom fields</div>
          </Show>
          <For each={editable()}>
            {(item) => (
              <div class="db-schema-prop-row" classList={{ "db-schema-prop-row--readonly": !!props.readonly }}>
                <span class="db-schema-type-icon" title={item.row.type}>
                  <Icon name={PROP_TYPE_ICONS[item.row.type]} size="small" />
                </span>
                <input
                  class="db-field-input db-field-input--sm"
                  placeholder="key"
                  value={item.row.key}
                  disabled={props.readonly}
                  onInput={(e) => setRows(item.idx, "key", e.currentTarget.value)}
                />
                <input
                  class="db-field-input db-field-input--sm"
                  placeholder="label"
                  value={item.row.label}
                  disabled={props.readonly}
                  onInput={(e) => setRows(item.idx, "label", e.currentTarget.value)}
                />
                <select
                  class="db-select db-select--sm"
                  value={item.row.type}
                  disabled={props.readonly}
                  onChange={(e) => setRows(item.idx, "type", e.currentTarget.value as PropType)}
                >
                  <For each={ALL_PROP_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
                </select>
                <label class="db-schema-required">
                  <input
                    type="checkbox"
                    class="db-checkbox"
                    checked={item.row.required ?? false}
                    disabled={props.readonly}
                    onChange={(e) => setRows(item.idx, "required", e.currentTarget.checked)}
                  />
                  Req
                </label>
                <Show
                  when={props.readonly}
                  fallback={
                    <button class="db-detail-close" onClick={() => removeProp(item.idx)}>
                      <Icon name="x" size="small" />
                    </button>
                  }
                >
                  <span class="db-schema-lock" title="Read-only">
                    <Icon name="lock" size="small" />
                  </span>
                </Show>
              </div>
            )}
          </For>
          <For each={editable()}>
            {(item) => (
              <Show when={item.row.type === "select" || item.row.type === "multiselect"}>
                <div class="db-schema-options-row">
                  <span class="db-field-label">{item.row.key || "?"} options</span>
                  <input
                    class="db-field-input"
                    placeholder="comma-separated options"
                    value={(item.row.options ?? []).join(", ")}
                    disabled={props.readonly}
                    onInput={(e) =>
                      setRows(
                        item.idx,
                        "options",
                        e.currentTarget.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </div>
              </Show>
            )}
          </For>
          <For each={editable()}>
            {(item) => (
              <Show when={item.row.type === "formula"}>
                <div class="db-schema-options-row">
                  <span class="db-field-label">{item.row.key || "?"} formula</span>
                  <input
                    class="db-field-input"
                    placeholder="{level} * {strength}"
                    value={item.row.formula ?? ""}
                    disabled={props.readonly}
                    onInput={(e) => setRows(item.idx, "formula", e.currentTarget.value)}
                  />
                </div>
              </Show>
            )}
          </For>
          </Show>
          <Show when={props.tabbed && tab() === "versions"}>
            <SchemaVersions type={props.name} />
          </Show>
        </div>
        <div class="db-schema-editor-footer">
          <Show when={!props.readonly && editTab()}>
            <Show when={props.hideHeader && props.defined}>
              <button
                class="db-action-btn db-action-btn--danger"
                type="button"
                onClick={() => void props.onDelete()}
              >
                <Icon name="trash-2" size="small" />
                Delete type…
              </button>
            </Show>
            <Show when={!props.tabbed || tab() === "properties"}>
              <button class="db-action-btn" onClick={addProp}>
                <Icon name="plus" size="small" />
                Add Property
              </button>
            </Show>
            <button class="db-action-btn db-action-btn--primary" onClick={() => void save()} disabled={busy()}>
              {busy() ? "Saving…" : "Save"}
            </button>
          </Show>
        </div>
      </div>
      <IconPickerDialog
        open={picker()}
        value={meta.icon}
        color={meta.color}
        type={props.name}
        onClose={() => setPicker(false)}
        onSelect={(icon) => {
          setDraft({ icon })
          setPicker(false)
        }}
      />
    </div>
  )
}

export function IconPickerDialog(props: {
  open: boolean
  value: string
  color: string
  type: string
  onClose: () => void
  onSelect: (icon: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const [library, setLibrary] = createSignal<"lucide" | "custom">("lucide")
  const [category, setCategory] = createSignal(lucideCategoryNames()[0] ?? "UI")

  createEffect(() => {
    if (!props.open) {
      setQuery("")
      setLibrary("lucide")
      setCategory(lucideCategoryNames()[0] ?? "UI")
    }
  })

  const icons = createMemo((): IconCatalogEntry[] => {
    const q = query().trim()
    if (library() === "custom") {
      return searchIconCatalog(CUSTOM_ICON_CATALOG, q)
    }
    if (q) {
      return searchIconCatalog(LUCIDE_ICON_CATALOG, q)
    }
    return lucideIconsForCategory(category())
  })

  const showCategoryPicker = () => library() === "lucide" && !query().trim()

  return (
    <Show when={props.open}>
      <div class="db-icon-dialog-backdrop" onClick={props.onClose}>
        <div class="db-icon-dialog" onClick={(e) => e.stopPropagation()}>
          <div class="db-icon-dialog-header">
            <div class="text-13-medium text-text-strong">Choose icon</div>
            <button class="db-detail-close" onClick={props.onClose} title="Close">
              <Icon name="x" size="small" />
            </button>
          </div>
          <div class="db-icon-library-tabs">
            <button
              type="button"
              class="db-icon-library-tab"
              classList={{ "db-icon-library-tab--active": library() === "lucide" }}
              onClick={() => setLibrary("lucide")}
            >
              Lucide
            </button>
            <button
              type="button"
              class="db-icon-library-tab"
              classList={{ "db-icon-library-tab--active": library() === "custom" }}
              onClick={() => setLibrary("custom")}
            >
              Custom
            </button>
          </div>
          <div class="db-icon-search">
            <Icon name="search" size="small" class="text-icon-weak" />
            <input
              class="db-field-input"
              placeholder={library() === "lucide" ? "Search Lucide icons…" : "Search custom icons…"}
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <Show when={showCategoryPicker()}>
            <div class="db-icon-category-row">
              <For each={lucideCategoryNames()}>
                {(name) => (
                  <button
                    type="button"
                    class="db-icon-category-pill"
                    classList={{ "db-icon-category-pill--active": category() === name }}
                    onClick={() => setCategory(name)}
                  >
                    {name}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show
            when={icons().length > 0}
            fallback={
              <div class="px-4 py-10 text-center text-12-regular text-text-weaker">
                No icons match “{query().trim()}”
              </div>
            }
          >
            <div class="db-icon-grid">
              <For each={icons()}>
                {(entry) => {
                  const stored = catalogStorageValue(entry)
                  return (
                    <button
                      class="db-icon-option"
                      classList={{ "db-icon-option--active": iconsMatch(props.value, stored) }}
                      onClick={() => props.onSelect(stored)}
                      title={iconDisplayLabel(stored)}
                    >
                      <EntityIcon type={props.type} icon={stored} color={props.color} size={18} />
                      <span>{iconDisplayLabel(stored)}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

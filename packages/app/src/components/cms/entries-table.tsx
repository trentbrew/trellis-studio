import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import {
  Archive,
  Copy,
  CornerDownLeft,
  FileEdit,
  Filter,
  FunctionSquare,
  Globe,
  Link2,
  MoreHorizontal,
  LayoutGrid,
  Plus,
  Settings2,
  SquareArrowOutUpRight,
  Trash2,
  X,
} from "lucide-solid"
import { useTrellisStore, type StoreEntity, type StoreFact } from "@/context/trellis-store"
import { IconPickerDialog } from "@/components/database/prop-schema-editor"
import { ColorCell, ColorPickerDialog, IconCell, normalizeHex } from "@/components/cms/theme-cells"
import { defaultEntityColor } from "@/lib/entity-theme"
import { matchesType, entityTypeKey, PROP_TYPE_ICONS, type PropType } from "@/pages/session/database-panel-utils"
import { pushCmsNav } from "@/lib/cms-navigate"
import { RouteEmptyState } from "@/components/route"
import { createCmsCache, type CmsCache } from "@/components/cms/cache"
import { DialogPublishChecklist } from "@/components/cms/dialog-publish-checklist"
import type { Collection } from "@/components/cms/collections-sidebar"
import { formula as cmsFormula } from "@/components/cms/formula"
import { buildEqlSuggestions, matchEqlClause, parseEql, type EqlClause } from "@/components/cms/eqls"
import { backlinkIndex, joinRefs, labelOf, parseRefs, refMulti, referenceCols } from "@/components/cms/reference"
import { isEmptyValue, publishBlocks } from "@/components/cms/schema"

const FRESH_MS = 6_000

import { DISPLAY_KEYS } from "@/components/cms/display"
import { EntriesGrid } from "@/components/cms/entries-grid"
const ROW = 42
const OVER = 10
const COL_EDGE = "border-r border-border-weaker-base/70"
const ROW_BG = "transition-colors duration-150"
const MISSING = "ring-1 ring-inset ring-amber-500/35"
const STICKY_CHECK = "sticky left-0 z-30"
const STICKY_INDEX = "sticky left-[36px] z-30"
const STICKY_ID = "sticky left-[76px] z-30"
const STICKY_HDR = "bg-elevated"

function stickyCellBg(opts: { selected: boolean; picked: boolean; fresh: boolean }) {
  if (opts.fresh) return { "bg-surface-success-weak animate-fresh-highlight": true }
  if (opts.selected) return { "bg-[#282828] text-text-strong": true }
  if (opts.picked) return { "bg-[#282828]": true }
  return { "bg-elevated": true }
}

function stickyCellHover(quiet: boolean) {
  return quiet ? { "hover:bg-[#282828]": true } : {}
}

function rowBg(opts: { selected: boolean; picked: boolean; stripe: boolean; quiet: boolean; fresh: boolean }) {
  if (opts.fresh) return { "bg-surface-success-weak animate-fresh-highlight": true }
  if (opts.selected) return { "bg-surface-raised-base/50 text-text-strong": true }
  if (opts.picked) return { "bg-surface-raised-base/40": true }
  return {}
}

function rowHover(quiet: boolean) {
  return quiet ? { "hover:bg-surface-raised-base/50": true } : {}
}

const ACTIONS_W = 36

type Tone = { bg: string; text: string; ring: string }

const tone = (rgb: string): Tone => ({
  bg: `rgba(${rgb}, 0.24)`,
  text: `rgb(${rgb})`,
  ring: `rgba(${rgb}, 0.34)`,
})

const style = (t: Tone) => ({
  "background-color": t.bg,
  color: t.text,
  "box-shadow": `inset 0 0 0 1px ${t.ring}`,
})

const REF_PILL = tone("167, 139, 250")
const IN_PILL = tone("34, 211, 238")
const GRAY_PILL = tone("113, 113, 122")
const BACKLINKS_KEY = "_backlinks"

function colorTone(raw: string | undefined): Tone | undefined {
  if (!raw) return
  if (/^\d+,\s*\d+,\s*\d+$/.test(raw)) return tone(raw)
  const hex = raw.startsWith("#") ? raw : `#${raw}`
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return
  const n = parseInt(m[1], 16)
  return tone(`${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`)
}

function pillColor(def: SchemaField | undefined, opt: string): Tone {
  const custom = colorTone(def?.colors?.[opt])
  if (custom) return custom
  return GRAY_PILL
}

function hexColor(raw: StoreFact["v"] | undefined, fallback: string) {
  return normalizeHex(raw === undefined || raw === null ? undefined : String(raw), fallback)
}

function isColorCol(key: string, def: SchemaField | undefined) {
  return def?.type === "color" || key === "color"
}

function isIconCol(key: string, def: SchemaField | undefined) {
  return key === "icon" || (def?.type === "select" && def.key === "icon")
}

type StatusFilter = "all" | "draft" | "published" | "archived"
type Status = "draft" | "published" | "archived"
type Scalar = string | number | boolean
type Edit = { id: string; key: string } | null
type Pending = { value: Scalar | undefined; seq: number }
type SortState = { key: string | null; dir: "asc" | "desc" }
type Kind = "number" | "date" | "longtext" | "text"
type ColFilter =
  | { kind: "enum"; values: string[] }
  | { kind: "range"; min?: number; max?: number }
  | { kind: "contains"; text: string }
type QueryMode = "text" | "eqls"
type ViewMode = "table" | "grid"
export type EntriesViewMode = ViewMode

const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "table", label: "Table", icon: "bullet-list" },
  { id: "grid", label: "Grid", icon: "grid" },
]

export function EntriesViewToggle(props: { view: EntriesViewMode; onViewChange: (view: EntriesViewMode) => void }) {
  return (
    <div class="flex items-center gap-0.5 rounded-md bg-surface-raised-base/40 p-0.5 hidden">
      <For each={VIEW_MODES}>
        {(m) => (
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded transition-colors"
            classList={{
              "bg-surface-raised-base text-text-strong": props.view === m.id,
              "text-text-weak hover:text-text-base": props.view !== m.id,
            }}
            onClick={() => props.onViewChange(m.id)}
            aria-pressed={props.view === m.id}
            aria-label={m.label}
            title={m.label}
          >
            {m.id === "grid" ? <LayoutGrid class="size-3.5 shrink-0" /> : <Icon name={m.icon as any} size="small" />}
          </button>
        )}
      </For>
    </div>
  )
}
function evalFormula(
  expr: string,
  ctx: Record<string, unknown>,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const vals: Record<string, Scalar | undefined> = {}
  for (const key of Object.keys(ctx)) {
    const value = ctx[key]
    if (value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      vals[key] = value
  }
  return { ok: true, value: cmsFormula(expr, vals) }
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LONG_TEXT_MIN = 60
const READONLY_KEYS = new Set(["slug", "id", "lastEdited", "createdAt", "updatedAt"])
const STATUS_RANK: Record<Status, number> = { draft: 0, published: 1, archived: 2 }
type CellChange = { type: "add" | "update" | "delete"; ts: number }
type SchemaField = {
  key: string
  label?: string
  type?: string
  required?: boolean
  default?: string
  target?: string
  options?: string[]
  colors?: Record<string, string>
  expr?: string
  formula?: string
}
type State = {
  query: string
  filter: StatusFilter
  top: number
  height: number
  picked: Record<string, boolean>
  last: string
  edit: Edit
  draft: string
  pending: Record<string, Pending>
  sort: SortState
  cellChanges: Record<string, CellChange>
  filters: Record<string, ColFilter>
  extraCols: string[]
  colTypeHints: Record<string, Kind | "boolean">
  colFormulas: Record<string, string>
  colWidths: Record<string, number>
  addPropDraft: { name: string; type: Kind | "boolean" | "formula"; expr: string }
  editColDraft: {
    label: string
    type: string
    options: string
    expr: string
    colors: Record<string, string>
    required: boolean
    default: string
  }
  queryMode: QueryMode
  eqlsActive: EqlClause[] | null
  eqlsError: string
}

function label(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function short(id: string, collection: string) {
  return id.replace(`${collection}:`, "")
}

function text(value: StoreFact["v"] | undefined) {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return value.toLocaleString()
  return String(value)
}

function cast(value: string, kind: Kind): Scalar | undefined {
  if (kind === "number") {
    const n = Number(value)
    return value.trim() === "" || !Number.isFinite(n) ? undefined : n
  }
  return value.trim() === "" ? undefined : value
}

function compare(a: StoreFact["v"] | undefined, b: StoreFact["v"] | undefined) {
  const an = typeof a === "number" ? a : typeof a === "string" && a.trim() ? Number(a) : Number.NaN
  const bn = typeof b === "number" ? b : typeof b === "string" && b.trim() ? Number(b) : Number.NaN
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" })
}

const COL_MIN = 80
const COL_MAX = 480
const COL_WIDTH_PREFIX = "cms:col-widths:"

function clampCol(w: number) {
  return Math.min(COL_MAX, Math.max(COL_MIN, w))
}

function loadColWidths(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${COL_WIDTH_PREFIX}${key}`)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, clampCol(v)]))
  } catch {
    return {}
  }
}

function dragCol(e: MouseEvent, start: number, onMove: (w: number) => void) {
  e.preventDefault()
  e.stopPropagation()
  const origin = e.clientX
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"
  const move = (ev: MouseEvent) => onMove(clampCol(start + ev.clientX - origin))
  const up = () => {
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    document.removeEventListener("mousemove", move)
    document.removeEventListener("mouseup", up)
  }
  document.addEventListener("mousemove", move)
  document.addEventListener("mouseup", up)
}

function ColResize(props: { width: () => number; onResize: (w: number) => void; onReset: () => void }) {
  return (
    <div
      class="absolute right-0 top-0 z-30 h-full w-1.5 cursor-col-resize touch-none hover:bg-border-base/60 active:bg-border-base"
      onMouseDown={(e) => dragCol(e, props.width(), props.onResize)}
      onDblClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        props.onReset()
      }}
      title="Drag to resize · double-click to reset"
    />
  )
}

export function EntriesTable(props: {
  compact?: boolean
  cache?: CmsCache
  collection: Collection
  selected: string | null
  view?: EntriesViewMode
  onViewChange?: (view: EntriesViewMode) => void
  onSelect: (id: string | null) => void
  onCreate: () => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onDuplicate?: (id: string) => Promise<void> | void
}) {
  const store = useTrellisStore()
  const dialog = useDialog()
  const data = props.cache ?? createCmsCache(store)
  const [localView, setLocalView] = createSignal<ViewMode>("table")
  const view = () => props.view ?? localView()
  const setView = (next: ViewMode) => {
    props.onViewChange?.(next)
    if (props.view === undefined) setLocalView(next)
  }
  const [state, setState] = createStore<State>({
    query: "",
    filter: "all",
    top: 0,
    height: 0,
    picked: {},
    last: "",
    edit: null,
    draft: "",
    pending: {},
    sort: { key: null, dir: "asc" },
    cellChanges: {},
    filters: {},
    extraCols: [],
    colTypeHints: {},
    colFormulas: {},
    colWidths: {},
    addPropDraft: { name: "", type: "text", expr: "" },
    editColDraft: { label: "", type: "text", options: "", expr: "", colors: {}, required: false, default: "" },
    queryMode: "text",
    eqlsActive: null,
    eqlsError: "",
  })
  let scroller: HTMLDivElement | undefined
  let seq = 0
  const saves = new Map<string, Promise<boolean>>()
  const [iconPicker, setIconPicker] = createSignal<{ id: string; key: string } | null>(null)
  const [colorPicker, setColorPicker] = createSignal<{ id: string; key: string } | null>(null)

  const facts = (id: string) => data.facts().get(id) ?? []
  const fact = (id: string, key: string) => facts(id).find((item) => item.a === key)
  const slot = (id: string, key: string) => `${id}\u0000${key}`
  const raw = (id: string, key: string) => {
    const item = state.pending[slot(id, key)]
    return item ? item.value : fact(id, key)?.v
  }
  const status = (id: string): Status => {
    const v = raw(id, "cms_status")
    if (v === "published") return "published"
    if (v === "archived") return "archived"
    return "draft"
  }
  const schemaFields = createMemo<SchemaField[]>(() => {
    const list = data.facts().get(props.collection.schemaId) ?? []
    const propsFact = list.find((f) => f.a === "props")
    if (!propsFact || typeof propsFact.v !== "string") return []
    try {
      const parsed = JSON.parse(propsFact.v) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter((d): d is SchemaField => !!d && typeof (d as SchemaField).key === "string")
    } catch {
      return []
    }
  })
  const titleClaim = createMemo<Set<string>>(() => {
    const schema = schemaFields()
    if (schema.length === 0) return new Set<string>(DISPLAY_KEYS)
    const declared = new Set(schema.map((f) => f.key))
    const claim = new Set<string>(DISPLAY_KEYS)
    let kept: string | null = null
    for (const k of DISPLAY_KEYS) {
      if (!declared.has(k)) continue
      if (kept === null) kept = k
      else claim.delete(k)
    }
    return claim
  })
  const title = (id: string) => {
    const claim = titleClaim()
    for (const key of DISPLAY_KEYS) {
      if (!claim.has(key)) continue
      const v = raw(id, key)
      if (typeof v === "string" && v.trim()) return { value: v, empty: false, key }
    }
    return { value: short(id, props.collection.key), empty: true, key: "name" }
  }
  const value = (entry: StoreEntity, key: string) => text(raw(entry.id, key))

  const base = createMemo(() => data.entities(props.collection.key))
  const cols = createMemo(() => {
    const schema = schemaFields()
    const claim = titleClaim()
    if (schema.length > 0) {
      const declared = schema
        .map((f) => f.key)
        .filter((k) => !claim.has(k) && k !== "type" && k !== "cms_status" && k !== "id")
      const extras = state.extraCols.filter((k) => !declared.includes(k))
      return [...declared, ...extras]
    }
    const seen = new Map<string, number>()
    for (const entry of base()) {
      for (const item of facts(entry.id)) {
        if (item.a === "type" || item.a === "cms_status") continue
        if (claim.has(item.a)) continue
        seen.set(item.a, (seen.get(item.a) ?? 0) + 1)
      }
    }
    const auto = Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, props.compact ? 3 : 6)
      .map(([key]) => key)
    const extras = state.extraCols.filter((k) => !auto.includes(k))
    return [...auto, ...extras]
  })
  const schemaMap = createMemo<Map<string, SchemaField>>(() => new Map(schemaFields().map((f) => [f.key, f])))
  const titleRequired = createMemo(() => {
    const claim = titleClaim()
    for (const k of DISPLAY_KEYS) {
      if (!claim.has(k)) continue
      if (schemaMap().get(k)?.required) return true
    }
    return false
  })
  const colRequired = (key: string) => !!schemaMap().get(key)?.required
  const cellMissing = (id: string, key: string) => colRequired(key) && isEmptyValue(raw(id, key))
  const refs = createMemo(() => referenceCols(cols(), schemaMap(), raw, base()))
  const backlinks = createMemo(() => backlinkIndex(store.facts, store.links))
  const openBacklink = (sourceId: string) => {
    const entity = store.entities.find((e) => e.id === sourceId)
    const collection = entity ? entityTypeKey(entity.type) : sourceId.split(":")[0]?.toLowerCase()
    if (collection === props.collection.key) {
      props.onSelect(sourceId)
      return
    }
    pushCmsNav({ collection, entry: sourceId })
  }
  const formulaOf = (def: SchemaField | undefined) => def?.formula ?? def?.expr
  const formulas = createMemo(() =>
    schemaFields()
      .map((f) => {
        const expr = formulaOf(f)
        return f.type === "formula" && expr ? { key: f.key, expr } : undefined
      })
      .filter((f): f is { key: string; expr: string } => !!f),
  )
  const scalar = (v: StoreFact["v"] | undefined): Scalar | undefined => {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v
    return undefined
  }
  const vals = (id: string): Record<string, Scalar | undefined> => {
    const out: Record<string, Scalar | undefined> = {}
    for (const f of facts(id)) out[f.a] = scalar(f.v)
    const prefix = `${id}\u0000`
    for (const k of Object.keys(state.pending)) {
      if (!k.startsWith(prefix)) continue
      out[k.slice(prefix.length)] = state.pending[k]?.value
    }
    const defs = formulas()
    for (let pass = 0; pass < defs.length; pass++) {
      for (const def of defs) out[def.key] = cmsFormula(def.expr, out)
    }
    return out
  }
  const kindFromSchema = (type: string | undefined): Kind | undefined => {
    if (!type) return undefined
    if (type === "number") return "number"
    if (type === "date") return "date"
    if (type === "rich_text" || type === "longtext") return "longtext"
    if (type === "text" || type === "email" || type === "url" || type === "color") return "text"
    return undefined
  }
  const evalCol = (id: string, expr: string): Scalar | undefined => {
    return cmsFormula(expr, vals(id))
  }
  const enumCols = createMemo(() => {
    const result = new Map<string, string[]>()
    const schema = schemaMap()
    for (const col of cols()) {
      if (refs().has(col)) continue
      const def = schema.get(col)
      if (isIconCol(col, def)) continue
      if (
        def &&
        (def.type === "select" || def.type === "multiselect") &&
        Array.isArray(def.options) &&
        def.options.length > 0
      ) {
        result.set(col, [...def.options])
        continue
      }
      if (def && def.type && def.type !== "text") continue
      const all: string[] = []
      for (const entry of base()) {
        const v = raw(entry.id, col)
        if (typeof v === "string" && v.trim()) all.push(v.trim())
      }
      const unique = [...new Set(all)].sort()
      const numeric = all.every((v) => Number.isFinite(Number(v)))
      if (!numeric && unique.length >= 2 && unique.length <= 30 && all.length / unique.length >= 1.5)
        result.set(col, unique)
    }
    return result
  })
  const colKinds = createMemo(() => {
    const result = new Map<string, Kind>()
    const enums = enumCols()
    const schema = schemaMap()
    for (const col of cols()) {
      if (enums.has(col)) continue
      const formula = state.colFormulas[col]
      if (formula) {
        for (const entry of base()) {
          const v = evalCol(entry.id, formula)
          if (v === undefined || v === null || v === "") continue
          if (typeof v === "number") {
            result.set(col, "number")
            break
          }
          if (typeof v === "string" && DATE_RE.test(v)) {
            result.set(col, "date")
            break
          }
          result.set(col, "text")
          break
        }
        if (!result.has(col)) result.set(col, "text")
        continue
      }
      const schemaKind = kindFromSchema(schema.get(col)?.type)
      const samples: Scalar[] = []
      let booleans = 0
      for (const entry of base()) {
        const v = raw(entry.id, col)
        if (v === undefined || v === null || v === "") continue
        if (typeof v === "boolean") {
          booleans++
          continue
        }
        samples.push(v as Scalar)
      }
      const hint = state.colTypeHints[col]
      if (booleans > 0 && samples.length === 0) {
        if (schemaKind) result.set(col, schemaKind)
        else if (hint && hint !== "boolean") result.set(col, hint as Kind)
        continue
      }
      if (!samples.length) {
        if (schemaKind) result.set(col, schemaKind)
        else result.set(col, hint && hint !== "boolean" ? (hint as Kind) : "text")
        continue
      }
      if (schemaKind) {
        result.set(col, schemaKind)
        continue
      }
      const allNumber = samples.every(
        (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))),
      )
      if (allNumber) {
        result.set(col, "number")
        continue
      }
      const allDate = samples.every((v) => typeof v === "string" && DATE_RE.test(v))
      if (allDate) {
        result.set(col, "date")
        continue
      }
      const anyLong = samples.some((v) => typeof v === "string" && v.length > LONG_TEXT_MIN)
      result.set(col, anyLong ? "longtext" : "text")
    }
    return result
  })
  const kind = (key: string): Kind => colKinds().get(key) ?? "text"
  const colLabel = (key: string): string => {
    const declared = schemaMap().get(key)?.label
    return declared && declared.trim() ? declared : label(key)
  }
  const colIcon = (key: string): string => {
    if (key === "_entry") return PROP_TYPE_ICONS.text
    if (key === "_status") return "status"
    if (refs().has(key)) return PROP_TYPE_ICONS.reference
    if (enumCols().has(key)) return PROP_TYPE_ICONS.select
    const def = schemaMap().get(key)
    if (def?.type && def.type in PROP_TYPE_ICONS) return PROP_TYPE_ICONS[def.type as PropType]
    const hint = state.colTypeHints[key]
    if (hint === "boolean") return PROP_TYPE_ICONS.boolean
    if (hint === "number") return PROP_TYPE_ICONS.number
    if (hint === "date") return PROP_TYPE_ICONS.date
    if (hint === "longtext") return PROP_TYPE_ICONS.rich_text
    const k = kind(key)
    if (k === "number") return PROP_TYPE_ICONS.number
    if (k === "date") return PROP_TYPE_ICONS.date
    if (k === "longtext") return PROP_TYPE_ICONS.rich_text
    return PROP_TYPE_ICONS.text
  }
  const setFilter = (key: string, next: ColFilter | undefined) => {
    const merged: Record<string, ColFilter> = {}
    for (const k of Object.keys(state.filters)) {
      const v = state.filters[k]
      if (k === key) continue
      if (v) merged[k] = v
    }
    if (next) merged[key] = next
    setState("filters", reconcile(merged))
  }
  const clearFilters = () => setState("filters", reconcile({}))
  const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/
  const addPropError = createMemo(() => {
    const name = state.addPropDraft.name.trim()
    if (!name) return ""
    if (!NAME_RE.test(name)) return "Letters, digits, _ only"
    if (name === "type" || name === "cms_status" || name === "id") return "Reserved name"
    if (READONLY_KEYS.has(name)) return "Reserved name"
    if (DISPLAY_KEYS.includes(name as (typeof DISPLAY_KEYS)[number])) return "Reserved name"
    if (cols().includes(name)) return "Already exists"
    return ""
  })
  const matchClause = (entry: StoreEntity, c: EqlClause) => {
    const formula = state.colFormulas[c.attr]
    const value = formula ? evalCol(entry.id, formula) : raw(entry.id, c.attr)
    return matchEqlClause(value, c)
  }
  const applyEqls = (input: string) => {
    const parsed = parseEql(input)
    if (parsed.ok) setState({ eqlsActive: parsed.clauses, eqlsError: "" })
    else setState({ eqlsActive: null, eqlsError: parsed.error })
  }
  const eqlSuggestions = createMemo(() =>
    buildEqlSuggestions({
      fields: schemaFields(),
      enumCols: enumCols(),
      colKinds: colKinds(),
      sample: (key) => {
        for (const entry of base()) {
          const formula = state.colFormulas[key]
          const value = formula ? evalCol(entry.id, formula) : raw(entry.id, key)
          if (value === undefined || value === null || value === "") continue
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
        }
        return undefined
      },
    }),
  )
  const writeSchema = async (defs: SchemaField[]) => {
    const schemaId = props.collection.schemaId
    const retracts: StoreFact[] = []
    const asserts: StoreFact[] = []
    const hasType = (data.facts().get(schemaId) ?? []).some((f) => f.a === "type" && f.v === "TypeSchema")
    if (!hasType) {
      asserts.push({ e: schemaId, a: "type", v: "TypeSchema" })
      asserts.push({ e: schemaId, a: "label", v: props.collection.label })
      asserts.push({ e: schemaId, a: "cms", v: true })
    }
    const oldProps = (data.facts().get(schemaId) ?? []).find((f) => f.a === "props")
    if (oldProps) retracts.push(oldProps)
    asserts.push({ e: schemaId, a: "props", v: JSON.stringify(defs) })
    if (retracts.length > 0) await store.retract(retracts)
    return store.assert(asserts)
  }
  type SchemaPatch = {
    type?: string
    expr?: string | null
    label?: string
    options?: string[] | null
    colors?: Record<string, string> | null
    required?: boolean
    default?: string | null
  }
  const saveSchemaField = async (key: string, patch: SchemaPatch) => {
    const existing = schemaFields()
    const defs = [...existing]
    const i = defs.findIndex((d) => d.key === key)
    const base: SchemaField = i >= 0 ? defs[i] : { key }
    const next: SchemaField = {
      key,
      label: patch.label ?? base.label ?? label(key),
      type: patch.type ?? base.type,
    }
    if (patch.expr === null) {
      // explicit removal
    } else if (patch.expr !== undefined) {
      next.formula = patch.expr
    } else if (formulaOf(base) && (next.type ?? base.type) === "formula") {
      next.formula = formulaOf(base)
    }
    if (patch.options === null) {
      // explicit removal
    } else if (patch.options !== undefined) {
      next.options = patch.options
    } else if (base.options && (next.type === "select" || next.type === "multiselect")) {
      next.options = base.options
    }
    if (patch.colors === null) {
      // explicit removal
    } else if (patch.colors !== undefined) {
      next.colors = patch.colors
    } else if (base.colors && (next.type === "select" || next.type === "multiselect")) {
      next.colors = base.colors
    }
    if (patch.required === true) next.required = true
    else if (patch.required === false) delete next.required
    if (patch.default === null || patch.default === "") delete next.default
    else if (patch.default !== undefined) next.default = patch.default
    if (i >= 0) defs[i] = next
    else defs.push(next)
    const ok = await writeSchema(defs)
    if (!ok) showToast({ variant: "error", title: "Failed to save field" })
    return ok
  }
  const deleteSchemaField = async (key: string) => {
    const defs = schemaFields().filter((d) => d.key !== key)
    const ok = await writeSchema(defs)
    if (!ok) showToast({ variant: "error", title: "Failed to delete field" })
    return ok
  }
  const openColEditor = (key: string) => {
    const def = schemaMap().get(key)
    const formula = state.colFormulas[key]
    const type = formula ? "formula" : (def?.type ?? state.colTypeHints[key] ?? kind(key))
    setState("editColDraft", {
      label: def?.label ?? label(key),
      type: String(type),
      options: (def?.options ?? []).join("\n"),
      expr: formula ?? formulaOf(def) ?? "",
      colors: { ...(def?.colors ?? {}) },
      required: !!def?.required,
      default: def?.default ?? "",
    })
  }
  const saveEditCol = async (key: string) => {
    const d = state.editColDraft
    const type = d.type
    const labelText = d.label.trim() || label(key)
    const patch: SchemaPatch = { type, label: labelText }
    patch.expr = type === "formula" ? d.expr.trim() || "0" : null
    patch.options =
      type === "select" || type === "multiselect"
        ? d.options
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : null
    patch.colors =
      type === "select" || type === "multiselect"
        ? Object.fromEntries(
            patch.options
              ?.map((opt) => [opt, d.colors[opt] ?? "71717a"])
              .filter((pair): pair is [string, string] => !!pair[0]) ?? [],
          )
        : null
    patch.required = d.required
    patch.default = d.default.trim() || null
    const ok = await saveSchemaField(key, patch)
    if (!ok) return
    if (type === "formula") {
      setState("colFormulas", key, patch.expr ?? "0")
      setState("colTypeHints", (m) => {
        const n = { ...m }
        delete n[key]
        return n
      })
    } else {
      setState("colFormulas", (m) => {
        const n = { ...m }
        delete n[key]
        return n
      })
      if (type === "boolean" || type === "text" || type === "longtext" || type === "number" || type === "date") {
        setState("colTypeHints", key, type as Kind | "boolean")
      }
    }
    setFilter(key, undefined)
  }
  const deleteCol = async (key: string) => {
    if (!window.confirm(`Delete column "${colLabel(key)}"? Existing row data is preserved.`)) return
    const ok = await deleteSchemaField(key)
    if (!ok) return
    setState("extraCols", (xs) => xs.filter((x) => x !== key))
    setState("colFormulas", (m) => {
      const n = { ...m }
      delete n[key]
      return n
    })
    setState("colTypeHints", (m) => {
      const n = { ...m }
      delete n[key]
      return n
    })
    setFilter(key, undefined)
    if (state.sort.key === key) setState("sort", { key: null, dir: "asc" })
  }
  const submitAddProp = async () => {
    const name = state.addPropDraft.name.trim()
    if (!name || addPropError()) return
    setState("extraCols", (xs) => [...xs, name])
    const type = state.addPropDraft.type
    if (type === "formula") {
      const expr = state.addPropDraft.expr.trim() || "0"
      setState("colFormulas", name, expr)
      void saveSchemaField(name, { type: "formula", expr })
    } else {
      setState("colTypeHints", name, type)
      void saveSchemaField(name, { type })
    }
    setState("addPropDraft", { name: "", type: "text", expr: "" })
  }
  createEffect(() => {
    const fields = schemaFields()
    const extra: string[] = []
    const hints: Record<string, Kind | "boolean"> = {}
    const formulas: Record<string, string> = {}
    for (const f of fields) {
      const expr = formulaOf(f)
      if (f.type === "formula" && expr) {
        extra.push(f.key)
        formulas[f.key] = expr
      } else if (f.type && f.type !== "formula") {
        extra.push(f.key)
        hints[f.key] = f.type as Kind | "boolean"
      }
    }
    setState({ extraCols: extra, colTypeHints: hints, colFormulas: formulas })
  })
  const passes = (entry: StoreEntity) => {
    for (const key of Object.keys(state.filters)) {
      const f = state.filters[key]
      if (!f) continue
      const formula = state.colFormulas[key]
      const v = formula ? evalCol(entry.id, formula) : raw(entry.id, key)
      if (f.kind === "enum") {
        if (f.values.length === 0) continue
        if (!f.values.includes(String(v ?? ""))) return false
      } else if (f.kind === "range") {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN
        if (f.min !== undefined && (!Number.isFinite(n) || n < f.min)) return false
        if (f.max !== undefined && (!Number.isFinite(n) || n > f.max)) return false
      } else if (f.kind === "contains") {
        const needle = f.text.trim().toLowerCase()
        if (!needle) continue
        if (typeof v !== "string" || !v.toLowerCase().includes(needle)) return false
      }
    }
    return true
  }
  const entries = createMemo(() => {
    const filtered = state.filter === "all" ? base() : base().filter((entry) => status(entry.id) === state.filter)
    let searched: StoreEntity[]
    if (state.queryMode === "eqls") {
      if (state.eqlsError && state.query.trim()) {
        searched = []
      } else {
        const clauses = state.eqlsActive ?? []
        searched =
          clauses.length === 0 ? filtered : filtered.filter((entry) => clauses.every((c) => matchClause(entry, c)))
      }
    } else {
      const q = state.query.trim().toLowerCase()
      searched = !q
        ? filtered
        : filtered.filter(
            (entry) =>
              entry.id.toLowerCase().includes(q) ||
              facts(entry.id).some((item) => String(item.v).toLowerCase().includes(q)),
          )
    }
    const colFiltered = Object.keys(state.filters).length === 0 ? searched : searched.filter(passes)
    const { key, dir } = state.sort
    if (!key) return colFiltered
    return [...colFiltered].sort((a, b) => {
      const formula = state.colFormulas[key]
      const n =
        key === "_status"
          ? STATUS_RANK[status(a.id)] - STATUS_RANK[status(b.id)]
          : key === "_entry"
            ? title(a.id).value.localeCompare(title(b.id).value, undefined, { numeric: true, sensitivity: "base" })
            : formula
              ? compare(evalCol(a.id, formula), evalCol(b.id, formula))
              : compare(raw(a.id, key), raw(b.id, key))
      return dir === "asc" ? n : -n
    })
  })
  const selected = createMemo(() => entries().filter((entry) => state.picked[entry.id]))
  const ids = createMemo(() => selected().map((entry) => entry.id))
  const all = createMemo(() => entries().length > 0 && entries().every((entry) => state.picked[entry.id]))
  const range = createMemo(() => {
    const height = state.height || 600
    return {
      start: Math.max(0, Math.floor(state.top / ROW) - OVER),
      end: Math.min(entries().length, Math.ceil((state.top + height) / ROW) + OVER),
    }
  })
  const visible = createMemo(() => entries().slice(range().start, range().end))
  const rowAt = (id: string) => {
    const idx = entries().findIndex((entry) => entry.id === id)
    return idx >= 0 ? idx : 0
  }
  const autoWidth = (key: string) => {
    if (key === BACKLINKS_KEY) {
      const vals = entries()
        .slice(0, 80)
        .map((entry) => (backlinks().get(entry.id) ?? []).map((item) => labelOf(item.id, data.facts())).join(", "))
      const size = Math.max("Linked from".length, ...vals.map((v) => v.length))
      return clampCol(Math.min(320, Math.max(160, size * 7 + 48)))
    }
    const vals = entries()
      .slice(0, 80)
      .map((entry) =>
        key === "_entry"
          ? title(entry.id).value
          : key === "_id"
            ? short(entry.id, props.collection.key)
            : value(entry, key),
      )
    const name = key === "_entry" ? "Entry" : key === "_id" ? "ID" : label(key)
    const size = Math.max(name.length, ...vals.map((v) => v.length))
    return clampCol(Math.min(320, Math.max(140, size * 7 + 48)))
  }
  const colWidth = (key: string) => {
    const saved = state.colWidths[key]
    if (saved !== undefined) return saved
    if (key === "_id") return 128
    if (key === "_entry") return clampCol(Math.max(220, autoWidth("_entry")))
    if (key === BACKLINKS_KEY) return clampCol(Math.max(160, autoWidth(BACKLINKS_KEY)))
    return autoWidth(key)
  }
  const persistWidths = (widths: Record<string, number>) => {
    localStorage.setItem(`${COL_WIDTH_PREFIX}${props.collection.key}`, JSON.stringify(widths))
  }
  const setColWidth = (key: string, w: number) => {
    const next = { ...state.colWidths, [key]: clampCol(w) }
    setState("colWidths", next)
    persistWidths(next)
  }
  const resetColWidth = (key: string) => {
    const next = { ...state.colWidths }
    delete next[key]
    setState("colWidths", next)
    persistWidths(next)
  }
  const orderedCols = createMemo(() => {
    const allCols = cols()
    // Find slug index if it exists
    const slugIndex = allCols.findIndex((col) => col === "slug")
    const ordered = []
    // Add non-slug columns first
    for (let i = 0; i < allCols.length; i++) {
      if (allCols[i] !== "slug") {
        ordered.push(allCols[i])
      }
    }
    // Insert slug right after entry if it exists
    if (slugIndex >= 0) {
      const slugPos = ordered.findIndex((col) => !["title", "name", "label", "description"].includes(col))
      if (slugPos >= 0) {
        ordered.splice(slugPos, 0, "slug")
      }
    }
    return ordered
  })
  const orderedColWidths = createMemo(() => orderedCols().map((key) => colWidth(key)))
  const tableWidth = createMemo(
    () =>
      36 +
      40 +
      colWidth("_id") +
      colWidth("_entry") +
      orderedColWidths().reduce((sum, w) => sum + w, 0) +
      colWidth(BACKLINKS_KEY) +
      ACTIONS_W,
  )
  const grid = createMemo(
    () =>
      `36px 40px ${colWidth("_id")}px ${colWidth("_entry")}px ${orderedCols()
        .map((key) => `${colWidth(key)}px`)
        .join(" ")} ${colWidth(BACKLINKS_KEY)}px ${ACTIONS_W}px`,
  )
  const measure = (el: HTMLDivElement) => setState({ top: el.scrollTop, height: el.clientHeight })
  const clear = () => setState({ picked: {}, last: "" })
  const choose = (next: boolean) =>
    setState({
      picked: next ? Object.fromEntries(entries().map((entry) => [entry.id, true])) : {},
      last: "",
    })
  const mark = (id: string, next: boolean, shift: boolean) => {
    const list = entries().map((entry) => entry.id)
    const start = list.indexOf(state.last)
    const end = list.indexOf(id)
    if (shift && start >= 0 && end >= 0) {
      for (const item of list.slice(Math.min(start, end), Math.max(start, end) + 1)) setState("picked", item, next)
    } else {
      setState("picked", id, next)
    }
    setState("last", id)
  }
  const done = () => setState({ edit: null, draft: "" })
  const toggleSort = (key: string) =>
    setState("sort", (s) => ({
      key: s.key === key && s.dir === "desc" ? null : key,
      dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
    }))
  const clearPending = (name: string, token: number) => {
    if (state.pending[name]?.seq !== token) return
    setState("pending", (items) => {
      const next = { ...items }
      delete next[name]
      return next
    })
  }
  const write = async (id: string, key: string, next: Scalar | undefined) => {
    const before = fact(id, key)
    if ((!before && next === undefined) || before?.v === next) return true
    const changeKey = `${id}\u0000${key}`
    let changeType: CellChange["type"] | null = null
    if (before) {
      if (next === undefined || next === "") changeType = "delete"
      else changeType = "update"
      const r = await store.retract([before])
      if (!r) {
        showToast({ variant: "error", title: `Failed to update "${key}"` })
        return false
      }
    } else if (next !== undefined && next !== "") {
      changeType = "add"
    }
    if (next !== undefined && next !== "") {
      const now = new Date().toISOString()
      const r = await store.assert([
        { e: id, a: key, v: next },
        { e: id, a: "lastEdited", v: now },
      ])
      if (!r) {
        showToast({ variant: "error", title: `Failed to save "${key}"` })
        return false
      }
    }
    if (changeType) {
      setState("cellChanges", changeKey, { type: changeType, ts: Date.now() })
      setTimeout(() => {
        setState("cellChanges", (items) => {
          const next = { ...items }
          delete next[changeKey]
          return next
        })
      }, 3000)
    }
    return true
  }
  const save = (id: string, key: string, next: Scalar | undefined) => {
    const name = slot(id, key)
    const token = ++seq
    setState("pending", name, { value: next, seq: token })
    const job = (saves.get(name) ?? Promise.resolve(true))
      .then(() => write(id, key, next))
      .then((ok) => {
        if (ok) done()
        return ok
      })
      .finally(() => {
        clearPending(name, token)
        if (saves.get(name) === job) saves.delete(name)
      })
    saves.set(name, job)
    return job
  }
  const begin = (id: string, key: string) => {
    if (READONLY_KEYS.has(key)) return
    if (state.colFormulas[key]) return
    if (refs().has(key)) return
    const def = schemaMap().get(key)
    if (isColorCol(key, def) || isIconCol(key, def)) return
    const v = raw(id, key)
    if (typeof v === "boolean") return
    if (enumCols().has(key)) return
    setState({ edit: { id, key }, draft: v === undefined || v === null ? "" : String(v) })
  }
  const beginKey = (id: string, vkey: string) => {
    const actual = vkey === "_entry" ? title(id).key : vkey
    begin(id, actual)
  }
  const editableKeys = (id: string): string[] => {
    const out: string[] = ["_entry"]
    const enums = enumCols()
    const schema = schemaMap()
    for (const c of cols()) {
      if (READONLY_KEYS.has(c)) continue
      if (state.colFormulas[c]) continue
      if (refs().has(c)) continue
      if (enums.has(c)) continue
      const def = schema.get(c)
      if (isColorCol(c, def) || isIconCol(c, def)) continue
      if (typeof raw(id, c) === "boolean") continue
      out.push(c)
    }
    return out
  }
  const iconPickerCtx = createMemo(() => {
    const pick = iconPicker()
    if (!pick) return null
    const current = raw(pick.id, pick.key)
    return {
      id: pick.id,
      key: pick.key,
      value: current === undefined || current === null || current === "" ? "" : String(current),
      color: hexColor(raw(pick.id, "color"), defaultEntityColor(props.collection.key)),
    }
  })
  const colorPickerCtx = createMemo(() => {
    const pick = colorPicker()
    if (!pick) return null
    const current = raw(pick.id, pick.key)
    return {
      id: pick.id,
      key: pick.key,
      value: hexColor(current, defaultEntityColor(props.collection.key)),
    }
  })
  const virtualKey = (key: string): string =>
    DISPLAY_KEYS.includes(key as (typeof DISPLAY_KEYS)[number]) ? "_entry" : key
  const scrollInto = (idx: number) => {
    if (!scroller) return
    const y = idx * ROW
    if (y < state.top) scroller.scrollTop = y
    else if (y + ROW > state.top + state.height) scroller.scrollTop = y - state.height + ROW
  }
  const focusEditor = () => {
    requestAnimationFrame(() => {
      const el = scroller?.querySelector(
        "input[type='text'], input[type='number'], input[type='date'], textarea",
      ) as HTMLElement | null
      if (el && document.activeElement !== el) el.focus()
    })
  }
  const advance = (id: string, key: string, dir: "next" | "prev" | "down") => {
    const vk = virtualKey(key)
    if (dir === "down") {
      const list = entries()
      const idx = list.findIndex((e) => e.id === id)
      if (idx < 0) return
      const next = list[idx + 1]
      if (!next) return
      if (!editableKeys(next.id).includes(vk)) return
      scrollInto(idx + 1)
      requestAnimationFrame(() => {
        beginKey(next.id, vk)
        focusEditor()
      })
      return
    }
    const keys = editableKeys(id)
    const ki = keys.indexOf(vk)
    if (ki < 0) return
    const target = keys[dir === "next" ? ki + 1 : ki - 1]
    if (!target) return
    beginKey(id, target)
    focusEditor()
  }
  const sortIcon = (key: string) => {
    if (state.sort.key !== key) return null
    return state.sort.dir === "asc" ? " ↑" : " ↓"
  }
  const commit = async (id: string, key: string) => {
    if (state.edit?.id !== id || state.edit.key !== key) return
    await save(id, key, cast(state.draft, kind(key)))
  }
  const saveStatus = async (id: string, next: Status) => {
    if (next === "published") {
      const blocks = publishBlocks(schemaFields(), [id], (entry, key) => raw(entry, key))
      if (blocks.length > 0) {
        dialog.show(() => (
          <DialogPublishChecklist
            blocks={blocks}
            label={(entry) => {
              const meta = title(entry)
              return meta.empty ? short(entry, props.collection.key) : meta.value
            }}
            short={(entry) => short(entry, props.collection.key)}
          />
        ))
        return false
      }
    }
    const cur = fact(id, "cms_status")
    if (cur?.v === next) return true
    if (cur) {
      const r = await store.retract([cur])
      if (!r) {
        showToast({ variant: "error", title: "Failed to update entry" })
        return false
      }
    }
    const r = await store.assert([
      { e: id, a: "cms_status", v: next },
      { e: id, a: "lastEdited", v: new Date().toISOString() },
    ])
    if (!r) {
      showToast({ variant: "error", title: "Failed to update entry" })
      return false
    }
    return true
  }
  const batchStatus = async (next: Status) => {
    const list = ids()
    if (list.length === 0) return
    if (next === "published") {
      const blocked = publishBlocks(schemaFields(), list, (id, key) => raw(id, key))
      if (blocked.length > 0) {
        dialog.show(() => (
          <DialogPublishChecklist
            blocks={blocked}
            label={(id) => {
              const meta = title(id)
              return meta.empty ? short(id, props.collection.key) : meta.value
            }}
            short={(id) => short(id, props.collection.key)}
          />
        ))
        return
      }
    }
    let ok = true
    for (const id of list) ok = (await saveStatus(id, next)) && ok
    if (!ok) return
    const verb = next === "published" ? "published" : next === "archived" ? "archived" : "moved to drafts"
    showToast({ variant: "success", title: `${list.length} ${verb}` })
    clear()
  }
  const batchDelete = async () => {
    const list = ids()
    if (list.length === 0) return
    if (!window.confirm(`Delete ${list.length} selected ${list.length === 1 ? "entry" : "entries"}?`)) return
    const retracts = list.flatMap((id) => facts(id))
    if (retracts.length === 0) return
    const r = await store.retract(retracts)
    if (!r) {
      showToast({ variant: "error", title: "Failed to delete selected entries" })
      return
    }
    if (props.selected && list.includes(props.selected)) props.onSelect(null)
    showToast({ variant: "success", title: `Deleted ${list.length} ${list.length === 1 ? "entry" : "entries"}` })
    clear()
  }
  const copyId = (id: string) => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(id).then(() => showToast({ variant: "success", title: "Copied ID" }))
  }
  const edit = (id: string, key: string, shown?: () => string, faded?: () => boolean) => {
    const active = () => state.edit?.id === id && state.edit.key === key
    const v = () => raw(id, key)
    return (
      <Switch>
        <Match when={state.colFormulas[key]}>
          {(expr) => {
            const ctx = createMemo(() => vals(id))
            const result = createMemo(() => evalFormula(expr(), ctx()))
            return (
              <div
                class="flex min-w-0 items-center gap-1 truncate pr-3 text-11-regular italic text-text-weak"
                title={`Formula: ${expr()}`}
              >
                <FunctionSquare class="size-3 shrink-0 text-icon-weak" />
                <Show
                  when={result().ok}
                  fallback={
                    <span class="truncate text-red-400" title={(result() as { ok: false; error: string }).error}>
                      !
                    </span>
                  }
                >
                  <span class="truncate">
                    {text((result() as { ok: true; value: unknown }).value as Scalar | undefined)}
                  </span>
                </Show>
              </div>
            )
          }}
        </Match>
        <Match when={typeof v() === "boolean" || undefined}>
          <button
            role="switch"
            aria-checked={v() === true}
            class="relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors"
            classList={{
              "bg-blue-500": v() === true,
              "bg-surface-raised-base/80 ring-1 ring-inset ring-border-base/50": v() !== true,
            }}
            onClick={(event) => {
              event.stopPropagation()
              void save(id, key, !v())
            }}
            title={`Toggle ${colLabel(key)}`}
          >
            <span
              class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
              classList={{
                "translate-x-3.5": v() === true,
                "translate-x-0.5": v() !== true,
              }}
            />
          </button>
        </Match>
        <Match when={refs().get(key)}>
          {(def) => {
            const target = () => {
              const t = def().target
              if (t) return t
              const first = ids()[0]
              if (first?.includes(":")) return first.split(":")[0]
              return undefined
            }
            const multi = () => refMulti(key, raw, base())
            const ids = () => parseRefs(v())
            const facts = () => data.facts()
            const candidates = () => {
              const t = target()
              const list = t ? store.entities.filter((e) => matchesType(e.type, t)) : store.entities
              return list.slice(0, 40)
            }
            const pick = (refId: string) => {
              if (multi()) {
                const cur = ids()
                if (cur.includes(refId)) return
                void save(id, key, joinRefs([...cur, refId]))
                return
              }
              void save(id, key, refId)
            }
            const remove = (refId: string) => {
              const next = ids().filter((x) => x !== refId)
              void save(id, key, next.length === 0 ? undefined : joinRefs(next))
            }
            const clear = () => void save(id, key, undefined)
            return (
              <div class="flex min-w-0 pr-1">
                <DropdownMenu placement="bottom-start" gutter={2} modal={false}>
                  <DropdownMenu.Trigger
                    class="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-1 rounded px-1.5 py-[1px] text-9-regular tracking-wide transition-opacity hover:opacity-80"
                    style={style(REF_PILL)}
                    onClick={(event) => event.stopPropagation()}
                    title={`Edit ${colLabel(key)}`}
                  >
                    <Show
                      when={ids().length > 0}
                      fallback={
                        <>
                          <Link2 class="size-3 shrink-0 opacity-80" />
                          <span class="min-w-0 truncate text-text-weaker">—</span>
                        </>
                      }
                    >
                      <span class="inline-flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                        <For each={ids()}>
                          {(refId) => (
                            <span class="inline-flex min-w-0 items-center gap-1 overflow-hidden" title={refId}>
                              <Link2 class="size-3 shrink-0 opacity-80" />
                              <span class="min-w-0 truncate">{labelOf(refId, facts())}</span>
                              <Show when={multi()}>
                                <span
                                  role="button"
                                  class="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    remove(refId)
                                  }}
                                  title="Remove"
                                >
                                  <X class="size-2.5" />
                                </span>
                              </Show>
                            </span>
                          )}
                        </For>
                      </span>
                    </Show>
                    <Icon name="chevron-down" size="small" class="shrink-0 opacity-60" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="min-w-[180px] max-h-64 overflow-y-auto">
                      <Show when={!multi()}>
                        <DropdownMenu.Item onSelect={clear}>
                          <DropdownMenu.ItemLabel>
                            <span class="flex items-center justify-between gap-3">
                              <span class="text-text-weaker">—</span>
                              <Show when={ids().length === 0}>
                                <Icon name="check" size="small" class="text-text-base" />
                              </Show>
                            </span>
                          </DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </Show>
                      <For each={candidates()}>
                        {(e) => {
                          const picked = () => ids().includes(e.id)
                          return (
                            <DropdownMenu.Item onSelect={() => pick(e.id)}>
                              <DropdownMenu.ItemLabel>
                                <span class="flex items-center justify-between gap-3 min-w-0">
                                  <span
                                    class="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-[1px] text-9-regular tracking-wide"
                                    style={style(REF_PILL)}
                                  >
                                    <Link2 class="size-3 shrink-0 opacity-80" />
                                    <span class="truncate">{labelOf(e.id, facts())}</span>
                                  </span>
                                  <Show when={picked()}>
                                    <Icon name="check" size="small" class="text-text-base shrink-0" />
                                  </Show>
                                </span>
                              </DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          )
                        }}
                      </For>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </div>
            )
          }}
        </Match>
        <Match when={isColorCol(key, schemaMap().get(key))}>
          <div class="min-w-0">
            <ColorCell
              value={v() === undefined || v() === null ? undefined : String(v())}
              title={`Edit ${colLabel(key)}`}
              onPick={() => setColorPicker({ id, key })}
            />
          </div>
        </Match>
        <Match when={isIconCol(key, schemaMap().get(key))}>
          <div class="min-w-0">
            <IconCell
              value={v() === undefined || v() === null ? undefined : String(v())}
              color={hexColor(raw(id, "color"), defaultEntityColor(props.collection.key))}
              type={props.collection.key}
              title={`Edit ${colLabel(key)}`}
              onPick={() => setIconPicker({ id, key })}
            />
          </div>
        </Match>
        <Match when={enumCols().get(key) as string[] | undefined}>
          {(opts) => {
            const current = () => (v() === undefined || v() === null || v() === "" ? "" : String(v()))
            const def = () => schemaMap().get(key)
            const shade = () => (current() ? pillColor(def(), current()) : GRAY_PILL)
            return (
              <div class="flex min-w-0 items-center pr-1">
                <DropdownMenu placement="bottom-start" gutter={2} modal={false}>
                  <DropdownMenu.Trigger
                    class="flex min-w-0 max-w-full flex-nowrap items-center gap-0.5 rounded px-1.5 py-[1px] text-9-regular uppercase tracking-wide transition-opacity hover:opacity-80"
                    style={style(shade())}
                    onClick={(event) => event.stopPropagation()}
                    title={`Edit ${colLabel(key)}`}
                  >
                    <span class="min-w-0 truncate">{current() || "—"}</span>
                    <Icon name="chevron-down" size="small" class="shrink-0 opacity-60" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="min-w-[140px]">
                      <DropdownMenu.Item onSelect={() => void save(id, key, undefined)}>
                        <DropdownMenu.ItemLabel>
                          <span class="flex items-center justify-between gap-3">
                            <span class="text-text-weaker">—</span>
                            <Show when={!current()}>
                              <Icon name="check" size="small" class="text-text-base" />
                            </Show>
                          </span>
                        </DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                      <For each={opts()}>
                        {(opt) => {
                          const t = pillColor(def(), opt)
                          return (
                            <DropdownMenu.Item onSelect={() => void save(id, key, opt)}>
                              <DropdownMenu.ItemLabel>
                                <span class="flex items-center justify-between gap-3">
                                  <span
                                    class="rounded px-1.5 py-[1px] text-9-regular uppercase tracking-wide"
                                    style={style(t)}
                                  >
                                    {opt}
                                  </span>
                                  <Show when={current() === opt}>
                                    <Icon name="check" size="small" class="text-text-base" />
                                  </Show>
                                </span>
                              </DropdownMenu.ItemLabel>
                            </DropdownMenu.Item>
                          )
                        }}
                      </For>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu>
              </div>
            )
          }}
        </Match>
        <Match when={READONLY_KEYS.has(key)}>
          <div class="truncate pr-3 text-11-regular text-text-weaker" title={`${colLabel(key)} is read-only`}>
            {shown?.() ?? text(v())}
          </div>
        </Match>
        <Match when={true}>
          <Show
            when={active()}
            fallback={
              <div
                class="mr-3 min-w-0 truncate rounded px-1.5 py-1 text-11-regular text-text-base cursor-text hover:bg-surface-raised-base/30"
                classList={{ "italic text-text-weaker": faded?.() }}
                title={shown?.() ?? text(v())}
                onClick={(event) => {
                  event.stopPropagation()
                  const next = v()
                  setState({ edit: { id, key }, draft: next === undefined || next === null ? "" : String(next) })
                }}
              >
                {faded?.() && shown ? shown() : v() === undefined || v() === null || v() === "" ? "—" : String(v())}
              </div>
            }
          >
            <input
              type={kind(key) === "number" ? "number" : kind(key) === "date" ? "date" : "text"}
              step={kind(key) === "number" ? "any" : undefined}
              class="mr-3 min-w-0 w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-11-regular text-text-base outline-0 transition-colors placeholder:text-text-weaker hover:border-border-weaker-base hover:bg-surface-raised-base/30 focus:border-border-base focus:bg-surface-raised-base"
              classList={{ "italic text-text-weaker": faded?.() && !active() }}
              value={state.draft}
              placeholder={faded?.() ? (shown?.() ?? "") : "—"}
              autofocus
              onClick={(event) => event.stopPropagation()}
              onInput={(event) => setState("draft", event.currentTarget.value)}
              onBlur={() => void commit(id, key)}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  event.preventDefault()
                  const dir = event.shiftKey ? "prev" : "next"
                  void commit(id, key).then(() => advance(id, key, dir))
                  return
                }
                if (event.key === "Enter") {
                  event.preventDefault()
                  void commit(id, key).then(() => advance(id, key, "down"))
                  return
                }
                if (event.key === "Escape") done()
              }}
            />
          </Show>
        </Match>
      </Switch>
    )
  }

  createEffect(() => {
    props.collection.key
    setState("colWidths", loadColWidths(props.collection.key))
  })
  createEffect(() => {
    state.query
    state.filter
    props.collection.key
    clear()
    requestAnimationFrame(() => {
      if (!scroller) return
      scroller.scrollTop = 0
      measure(scroller)
    })
  })
  createEffect(
    on(
      () => props.collection.key,
      (key, prev) => {
        if (prev !== undefined && key !== prev) {
          setView("table")
          setIconPicker(null)
          setColorPicker(null)
          setState({ query: "", queryMode: "text", eqlsActive: null, eqlsError: "" })
        }
      },
    ),
  )

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="route-toolbar">
        <div class="route-toolbar-search">
          <div class="relative flex-1 h-8 rounded-md border border-border-base/50 bg-surface-raised-base/30 focus-within:border-border-strong-base/80 focus-within:bg-surface-raised-base/50 transition-colors flex items-center px-2.5 gap-2">
            <Icon name="search" size="small" class="shrink-0 text-icon-weak" />
            <input
              type="text"
              class={
                state.queryMode === "eqls"
                  ? "min-w-0 flex-1 border-0 bg-transparent font-mono text-12-regular text-text-base outline-0 placeholder:text-text-weaker shadow-none"
                  : "min-w-0 flex-1 border-0 bg-transparent text-12-regular text-text-base outline-0 placeholder:text-text-weaker shadow-none"
              }
              placeholder={
                state.queryMode === "eqls"
                  ? 'find ?e where points >= 200 and difficulty = "easy"'
                  : `Search ${props.collection.label}…`
              }
              value={state.query}
              onInput={(event) => {
                const v = event.currentTarget.value
                setState("query", v)
                if (state.queryMode === "eqls") applyEqls(v)
              }}
            />
            <button
              role="switch"
              aria-checked={state.queryMode === "eqls"}
              class="flex items-center gap-1 rounded px-1.5 py-0.5 text-9-medium uppercase tracking-wide text-text-weaker transition-colors hover:text-text-base shrink-0"
              onClick={() => {
                const next: QueryMode = state.queryMode === "eqls" ? "text" : "eqls"
                setState("queryMode", next)
                if (next === "eqls") applyEqls(state.query)
                else setState({ eqlsActive: null, eqlsError: "" })
              }}
              title={state.queryMode === "eqls" ? "Switch to text search" : "Switch to EQL-S query mode"}
            >
              <span class="mr-2">Query mode</span>
              <span
                class="relative inline-flex h-4 w-7 rounded-full transition-colors"
                style={{
                  "background-color": state.queryMode === "eqls" ? "rgb(34, 211, 238)" : "rgb(63, 63, 70)",
                  "box-shadow":
                    state.queryMode === "eqls"
                      ? "inset 0 0 0 1px rgba(207, 250, 254, 0.8)"
                      : "inset 0 0 0 1px rgba(212, 212, 216, 0.75)",
                }}
              >
                <span
                  class="absolute top-0.5 h-3 w-3 rounded-full shadow-sm transition-transform"
                  style={{
                    "background-color": state.queryMode === "eqls" ? "rgb(9, 9, 11)" : "rgb(255, 255, 255)",
                    transform: state.queryMode === "eqls" ? "translateX(14px)" : "translateX(2px)",
                  }}
                />
              </span>
            </button>
            <Show when={state.query}>
              <button
                class="text-text-weaker hover:text-text-base shrink-0"
                onClick={() => {
                  setState("query", "")
                  if (state.queryMode === "eqls") setState({ eqlsActive: [], eqlsError: "" })
                }}
                title="Clear"
              >
                <Icon name="x" size="small" />
              </button>
            </Show>
          </div>
        </div>
      </div>
      <Show
        when={
          state.queryMode === "eqls" &&
          (state.eqlsError || (eqlSuggestions().length > 0 && (!state.query.trim() || state.eqlsError)))
        }
      >
        <div class="shrink-0 border-b border-border-weaker-base px-3 py-1.5 flex flex-col gap-1 bg-background-base">
          <Show when={state.eqlsError}>
            <div class="px-2 text-10-regular text-red-400">{state.eqlsError}</div>
          </Show>
          <Show when={eqlSuggestions().length > 0 && (!state.query.trim() || state.eqlsError)}>
            <div class="flex flex-wrap items-center gap-1.5 px-2 pb-0.5">
              <span class="text-10-medium uppercase tracking-wide text-text-weaker">Try</span>
              <For each={eqlSuggestions()}>
                {(item) => (
                  <button
                    type="button"
                    class="rounded-full border border-border-weaker-base px-2 py-0.5 font-mono text-10-regular text-text-weak transition-colors hover:border-border-weak-base hover:bg-surface-raised-base/50 hover:text-text-base"
                    title={item.query}
                    onClick={() => {
                      setState("query", item.query)
                      applyEqls(item.query)
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={Object.keys(state.filters).length > 0}>
        <div class="shrink-0 border-b border-border-weaker-base pl-3 pr-0 py-1.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <For each={Object.keys(state.filters)}>
              {(key) => {
                const f = () => state.filters[key]
                const summary = () => {
                  const v = f()
                  if (!v) return ""
                  if (v.kind === "enum") return v.values.join(", ")
                  if (v.kind === "range") {
                    const lo = v.min !== undefined ? String(v.min) : "*"
                    const hi = v.max !== undefined ? String(v.max) : "*"
                    return `${lo}…${hi}`
                  }
                  if (v.kind === "contains") return `"${v.text}"`
                  return ""
                }
                return (
                  <span class="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-11-regular text-blue-300">
                    <span class="text-text-weaker">{colLabel(key)}:</span>
                    <span class="font-medium">{summary()}</span>
                    <button
                      class="hover:text-text-base"
                      onClick={() => setFilter(key, undefined)}
                      title="Remove filter"
                    >
                      <X class="size-3" />
                    </button>
                  </span>
                )
              }}
            </For>
            <button class="ml-1 text-10-regular text-text-weaker hover:text-text-base" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        </div>
      </Show>
      <Switch>
        <Match when={view() === "grid"}>
          <EntriesGrid
            collection={props.collection}
            entries={entries()}
            selected={props.selected}
            fresh={store.fresh}
            facts={facts}
            allFacts={data.facts()}
            title={title}
            status={status}
            schemaFields={schemaFields()}
            titleKeys={titleClaim()}
            refs={refs()}
            backlinks={backlinks()}
            raw={raw}
            onSelect={props.onSelect}
            onCreate={props.onCreate}
          />
        </Match>
        <Match when={view() === "table"}>
          <div
            class="min-h-0 flex-1 overflow-auto bg-well"
            ref={(el) => {
              scroller = el
              requestAnimationFrame(() => measure(el))
            }}
            onScroll={(event) => measure(event.currentTarget)}
          >
            <div class="min-w-full" style={{ width: `${tableWidth()}px` }}>
              <div
                class={`sticky top-0 z-10 grid h-9 items-stretch border-b border-border-weaker-base px-0! text-10-medium uppercase tracking-wide text-text-weaker pl-2 ${STICKY_HDR}`}
                style={{ "grid-template-columns": grid() }}
              >
                <div class={`flex h-full items-center justify-center ${STICKY_CHECK} z-30 ${STICKY_HDR} ${COL_EDGE}`}>
                  <input
                    type="checkbox"
                    class="size-3.5 accent-text-strong"
                    checked={all()}
                    onChange={(event) => choose(event.currentTarget.checked)}
                    title="Select all rows"
                  />
                </div>
                <div
                  class={`flex h-full items-center justify-center ${STICKY_INDEX} z-30 ${STICKY_HDR} ${COL_EDGE}`}
                  title="Row"
                >
                  #
                </div>
                <div
                  class={`relative flex h-full min-w-0 items-center gap-1 pl-2 pr-2 ${STICKY_ID} z-30 ${STICKY_HDR} ${COL_EDGE}`}
                >
                  <Icon name="fingerprint" size="small" class="shrink-0 text-icon-weak" />
                  <span class="truncate">ID</span>
                  <ColResize
                    width={() => colWidth("_id")}
                    onResize={(w) => setColWidth("_id", w)}
                    onReset={() => resetColWidth("_id")}
                  />
                </div>
                <div class={`relative flex h-full min-w-0 items-center px-2 ${COL_EDGE}`}>
                  <button
                    class="flex w-full min-w-0 items-center gap-1 truncate hover:text-text-base transition-colors"
                    onClick={() => toggleSort("_entry")}
                  >
                    <Icon name={colIcon("_entry") as any} size="small" class="shrink-0 text-icon-weak" />
                    <Show when={titleRequired()}>
                      <span class="size-1 shrink-0 rounded-full bg-amber-500/80" title="Required" />
                    </Show>
                    Entry{sortIcon("_entry")}
                  </button>
                  <ColResize
                    width={() => colWidth("_entry")}
                    onResize={(w) => setColWidth("_entry", w)}
                    onReset={() => resetColWidth("_entry")}
                  />
                </div>
                <For each={orderedCols()}>
                  {(key) => {
                    const k = () => kind(key)
                    const enums = () => enumCols().get(key)
                    const hasFilter = () => !!state.filters[key]
                    return (
                      <div class={`relative flex h-full min-w-0 items-center gap-1 px-2 ${COL_EDGE}`}>
                        <button
                          class="flex min-w-0 flex-1 items-center gap-1 truncate hover:text-text-base transition-colors"
                          onClick={() => toggleSort(key)}
                        >
                          <Icon name={colIcon(key) as any} size="small" class="shrink-0 text-icon-weak" />
                          <Show when={colRequired(key)}>
                            <span class="size-1 shrink-0 rounded-full bg-amber-500/80" title="Required" />
                          </Show>
                          <span class="truncate">{colLabel(key)}</span>
                          {sortIcon(key)}
                        </button>
                        <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                          <DropdownMenu.Trigger
                            class="flex size-4 shrink-0 items-center justify-center rounded text-icon-weak hover:text-text-base"
                            classList={{ "text-blue-400": hasFilter() }}
                            onClick={(event) => event.stopPropagation()}
                            title={`Filter ${colLabel(key)}`}
                          >
                            <Filter class="size-3" />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content class="min-w-[200px] p-2">
                              <Show
                                when={enums()}
                                fallback={
                                  <Show
                                    when={k() === "number"}
                                    fallback={
                                      <div class="flex flex-col gap-1.5">
                                        <div class="text-10-medium uppercase tracking-wide text-text-weaker">
                                          Contains
                                        </div>
                                        <input
                                          type="text"
                                          class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                          placeholder="search…"
                                          value={state.filters[key]?.kind === "contains" ? state.filters[key].text : ""}
                                          onInput={(event) => {
                                            const t = event.currentTarget.value
                                            setFilter(key, t ? { kind: "contains", text: t } : undefined)
                                          }}
                                        />
                                        <button
                                          class="self-end text-10-regular text-text-weaker hover:text-text-base"
                                          onClick={() => setFilter(key, undefined)}
                                        >
                                          Clear
                                        </button>
                                      </div>
                                    }
                                  >
                                    <div class="flex flex-col gap-1.5">
                                      <div class="text-10-medium uppercase tracking-wide text-text-weaker">Range</div>
                                      <div class="flex items-center gap-1">
                                        <input
                                          type="number"
                                          step="any"
                                          class="w-full rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                          placeholder="min"
                                          value={
                                            state.filters[key]?.kind === "range" ? (state.filters[key].min ?? "") : ""
                                          }
                                          onInput={(event) => {
                                            const min =
                                              event.currentTarget.value === ""
                                                ? undefined
                                                : Number(event.currentTarget.value)
                                            const cur = state.filters[key]
                                            const max = cur?.kind === "range" ? cur.max : undefined
                                            setFilter(
                                              key,
                                              min === undefined && max === undefined
                                                ? undefined
                                                : { kind: "range", min, max },
                                            )
                                          }}
                                        />
                                        <span class="text-text-weaker">–</span>
                                        <input
                                          type="number"
                                          step="any"
                                          class="w-full rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                          placeholder="max"
                                          value={
                                            state.filters[key]?.kind === "range" ? (state.filters[key].max ?? "") : ""
                                          }
                                          onInput={(event) => {
                                            const max =
                                              event.currentTarget.value === ""
                                                ? undefined
                                                : Number(event.currentTarget.value)
                                            const cur = state.filters[key]
                                            const min = cur?.kind === "range" ? cur.min : undefined
                                            setFilter(
                                              key,
                                              min === undefined && max === undefined
                                                ? undefined
                                                : { kind: "range", min, max },
                                            )
                                          }}
                                        />
                                      </div>
                                      <button
                                        class="self-end text-10-regular text-text-weaker hover:text-text-base"
                                        onClick={() => setFilter(key, undefined)}
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </Show>
                                }
                              >
                                {(opts) => (
                                  <div class="flex flex-col gap-1">
                                    <div class="px-1 pb-1 text-10-medium uppercase tracking-wide text-text-weaker">
                                      Match any
                                    </div>
                                    <For each={opts()}>
                                      {(opt) => {
                                        const checked = () => {
                                          const f = state.filters[key]
                                          return f?.kind === "enum" && f.values.includes(opt)
                                        }
                                        return (
                                          <label class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-11-regular text-text-base hover:bg-surface-raised-base/40">
                                            <input
                                              type="checkbox"
                                              class="size-3.5 accent-text-strong"
                                              checked={checked()}
                                              onChange={(event) => {
                                                const cur = state.filters[key]
                                                const values = cur?.kind === "enum" ? [...cur.values] : []
                                                if (event.currentTarget.checked) values.push(opt)
                                                else {
                                                  const i = values.indexOf(opt)
                                                  if (i >= 0) values.splice(i, 1)
                                                }
                                                setFilter(
                                                  key,
                                                  values.length === 0 ? undefined : { kind: "enum", values },
                                                )
                                              }}
                                            />
                                            <span>{opt}</span>
                                          </label>
                                        )
                                      }}
                                    </For>
                                    <button
                                      class="mt-1 self-end text-10-regular text-text-weaker hover:text-text-base"
                                      onClick={() => setFilter(key, undefined)}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                )}
                              </Show>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                        <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                          <DropdownMenu.Trigger
                            class="flex size-4 shrink-0 items-center justify-center rounded text-icon-weak hover:text-text-base"
                            onClick={(event) => {
                              event.stopPropagation()
                              openColEditor(key)
                            }}
                            title={`Edit ${colLabel(key)}`}
                          >
                            <Settings2 class="size-3" />
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content class="min-w-[240px] p-2">
                              <div
                                class="flex flex-col gap-2"
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault()
                                    void saveEditCol(key)
                                  }
                                }}
                              >
                                <div class="text-10-medium uppercase tracking-wide text-text-weaker">Edit property</div>
                                <input
                                  type="text"
                                  class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                  placeholder="Display label"
                                  value={state.editColDraft.label}
                                  onInput={(event) => setState("editColDraft", "label", event.currentTarget.value)}
                                />
                                <select
                                  class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                  value={state.editColDraft.type}
                                  onChange={(event) => setState("editColDraft", "type", event.currentTarget.value)}
                                >
                                  <option value="text">Text</option>
                                  <option value="longtext">Long text</option>
                                  <option value="number">Number</option>
                                  <option value="date">Date</option>
                                  <option value="boolean">Boolean</option>
                                  <option value="select">Select</option>
                                  <option value="multiselect">Multi-select</option>
                                  <option value="reference">Reference</option>
                                  <option value="formula">Formula</option>
                                </select>
                                <Show
                                  when={
                                    state.editColDraft.type === "select" || state.editColDraft.type === "multiselect"
                                  }
                                >
                                  <textarea
                                    rows={3}
                                    class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                    placeholder="One option per line"
                                    value={state.editColDraft.options}
                                    onInput={(event) => setState("editColDraft", "options", event.currentTarget.value)}
                                  />
                                  <div class="text-10-medium uppercase tracking-wide text-text-weaker">
                                    Option colors
                                  </div>
                                  <For
                                    each={state.editColDraft.options
                                      .split("\n")
                                      .map((s) => s.trim())
                                      .filter(Boolean)}
                                  >
                                    {(opt) => (
                                      <div class="flex items-center gap-2">
                                        <span class="min-w-0 flex-1 truncate text-11-regular text-text-base">
                                          {opt}
                                        </span>
                                        <input
                                          type="color"
                                          class="size-7 shrink-0 cursor-pointer rounded border border-border-weaker-base bg-transparent"
                                          value={
                                            state.editColDraft.colors[opt]?.startsWith("#")
                                              ? state.editColDraft.colors[opt]
                                              : `#${state.editColDraft.colors[opt] ?? "71717a"}`
                                          }
                                          onInput={(event) =>
                                            setState("editColDraft", "colors", opt, event.currentTarget.value.slice(1))
                                          }
                                        />
                                      </div>
                                    )}
                                  </For>
                                </Show>
                                <Show when={state.editColDraft.type === "formula"}>
                                  <textarea
                                    rows={2}
                                    class="rounded border border-border-base bg-surface-raised-base px-2 py-1 font-mono text-11-regular text-text-base outline-0"
                                    placeholder="points * 2"
                                    value={state.editColDraft.expr}
                                    onInput={(event) => setState("editColDraft", "expr", event.currentTarget.value)}
                                  />
                                </Show>
                                <label class="flex items-center gap-2 text-11-regular text-text-base">
                                  <input
                                    type="checkbox"
                                    class="size-3.5 accent-text-strong"
                                    checked={state.editColDraft.required}
                                    onChange={(event) =>
                                      setState("editColDraft", "required", event.currentTarget.checked)
                                    }
                                  />
                                  <span>Required to publish</span>
                                </label>
                                <Show when={state.editColDraft.type !== "formula"}>
                                  <div class="flex flex-col gap-1">
                                    <span class="text-10-medium uppercase tracking-wide text-text-weaker">
                                      Default value
                                    </span>
                                    <input
                                      type="text"
                                      class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                                      placeholder="Applied when creating new entries"
                                      value={state.editColDraft.default}
                                      onInput={(event) =>
                                        setState("editColDraft", "default", event.currentTarget.value)
                                      }
                                    />
                                  </div>
                                </Show>
                                <div class="flex items-center justify-between gap-2 pt-1">
                                  <button
                                    type="button"
                                    class="flex items-center gap-1 rounded px-2 py-1 text-11-medium text-red-400 hover:bg-red-500/10"
                                    onClick={() => void deleteCol(key)}
                                    title="Delete column"
                                  >
                                    <Trash2 class="size-3.5" />
                                    <span>Delete</span>
                                  </button>
                                  <button
                                    type="button"
                                    class="rounded-md bg-text-strong px-2.5 py-1 text-11-medium text-background-base"
                                    onClick={() => void saveEditCol(key)}
                                    title="Save (⌘/Ctrl+Enter)"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu>
                        <ColResize
                          width={() => colWidth(key)}
                          onResize={(w) => setColWidth(key, w)}
                          onReset={() => resetColWidth(key)}
                        />
                      </div>
                    )
                  }}
                </For>
                <div class={`relative flex h-full min-w-0 items-center gap-1 px-2 ${COL_EDGE}`}>
                  <CornerDownLeft class="size-3 shrink-0 text-icon-weak" />
                  <span class="truncate">Linked from</span>
                  <ColResize
                    width={() => colWidth(BACKLINKS_KEY)}
                    onResize={(w) => setColWidth(BACKLINKS_KEY, w)}
                    onReset={() => resetColWidth(BACKLINKS_KEY)}
                  />
                </div>
                <Show when={view() === "table"}>
                  <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                    <DropdownMenu.Trigger
                      class={`sticky right-0 z-30 flex h-full w-full items-center justify-center border-l border-border-weaker-base text-icon-weak shadow-[-12px_0_16px_-18px_rgba(0,0,0,0.8)] transition-colors hover:text-text-base ${STICKY_HDR}`}
                      title="Add property"
                    >
                      <Plus class="size-3.5" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content class="min-w-[240px] p-2">
                        <div
                          class="flex flex-col gap-2"
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !addPropError() && state.addPropDraft.name.trim()) {
                              event.preventDefault()
                              submitAddProp()
                            }
                          }}
                        >
                          <div class="text-10-medium uppercase tracking-wide text-text-weaker">New property</div>
                          <input
                            type="text"
                            autofocus
                            class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                            placeholder="name (e.g. category)"
                            value={state.addPropDraft.name}
                            onInput={(event) => setState("addPropDraft", "name", event.currentTarget.value)}
                          />
                          <select
                            class="rounded border border-border-base bg-surface-raised-base px-2 py-1 text-11-regular text-text-base outline-0"
                            value={state.addPropDraft.type}
                            onChange={(event) =>
                              setState(
                                "addPropDraft",
                                "type",
                                event.currentTarget.value as Kind | "boolean" | "formula",
                              )
                            }
                          >
                            <option value="text">Text</option>
                            <option value="longtext">Long text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="boolean">Boolean</option>
                            <option value="formula">Formula</option>
                          </select>
                          <Show when={state.addPropDraft.type === "formula"}>
                            <textarea
                              rows={2}
                              class="rounded border border-border-base bg-surface-raised-base px-2 py-1 font-mono text-11-regular text-text-base outline-0"
                              placeholder="points * 2"
                              value={state.addPropDraft.expr}
                              onInput={(event) => setState("addPropDraft", "expr", event.currentTarget.value)}
                            />
                          </Show>
                          <Show when={addPropError()}>
                            <div class="text-10-regular text-red-400">{addPropError()}</div>
                          </Show>
                          <button
                            type="button"
                            class="self-end rounded-md bg-text-strong px-2.5 py-1 text-11-medium text-background-base disabled:opacity-50"
                            disabled={!state.addPropDraft.name.trim() || !!addPropError()}
                            onClick={submitAddProp}
                          >
                            Add
                          </button>
                        </div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </Show>
              </div>
              <Show
                when={entries().length > 0}
                fallback={
                  <RouteEmptyState
                    icon={<Plus class="size-5" />}
                    title={state.query ? "No matching entries" : "No entries yet"}
                    description={
                      state.query
                        ? "Try a different search or status filter."
                        : "Create the first row in this collection."
                    }
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
                <div class="relative" style={{ height: `${entries().length * ROW}px` }}>
                  <For each={visible()}>
                    {(entry) => {
                      const meta = () => title(entry.id)
                      const rowIndex = () => rowAt(entry.id)
                      const stripe = () => rowIndex() % 2 === 1
                      const quiet = () =>
                        props.selected !== entry.id && !state.picked[entry.id] && !store.fresh.includes(entry.id)
                      const bg = () =>
                        rowBg({
                          selected: props.selected === entry.id,
                          picked: !!state.picked[entry.id],
                          stripe: stripe(),
                          quiet: quiet(),
                          fresh: store.fresh.includes(entry.id),
                        })
                      const sticky = () =>
                        stickyCellBg({
                          selected: props.selected === entry.id,
                          picked: !!state.picked[entry.id],
                          fresh: store.fresh.includes(entry.id),
                        })
                      const stickyHoverCls = () => stickyCellHover(quiet())
                      return (
                        <div
                          class="group absolute left-0 right-0 px-0 border-b border-border-weaker-base/70"
                          style={{ top: `${rowIndex() * ROW}px`, height: `${ROW}px`, "z-index": rowIndex() + 1 }}
                        >
                          <div
                            class={`grid h-full w-full items-stretch rounded-md border border-transparent px-0 text-left ${ROW_BG}`}
                            classList={{
                              ...bg(),
                              ...rowHover(quiet()),
                            }}
                            style={{ "grid-template-columns": grid() }}
                          >
                            <div
                              class={`flex h-full items-center justify-center ${STICKY_CHECK} ${COL_EDGE} ${ROW_BG}`}
                              classList={{ ...sticky(), ...stickyHoverCls() }}
                            >
                              <input
                                type="checkbox"
                                class="size-3.5 accent-text-strong"
                                checked={!!state.picked[entry.id]}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  mark(entry.id, event.currentTarget.checked, event.shiftKey)
                                }}
                                title={`Select ${meta().empty ? short(entry.id, props.collection.key) : meta().value}`}
                              />
                            </div>
                            <div
                              class={`flex h-full items-center justify-center font-mono text-10-regular text-text-weaker ${STICKY_INDEX} ${COL_EDGE} ${ROW_BG}`}
                              classList={{ ...sticky(), ...stickyHoverCls() }}
                            >
                              {rowIndex() + 1}
                            </div>
                            <div
                              class={`flex h-full min-w-0 items-center gap-0.5 pl-2 pr-1 ${STICKY_ID} shadow-[4px_0_8px_-4px_rgba(0,0,0,0.45)] ${COL_EDGE} ${ROW_BG}`}
                              classList={{ ...sticky(), ...stickyHoverCls() }}
                            >
                              <span class="min-w-0 flex-1 truncate font-mono text-10-regular text-text-weaker">
                                {short(entry.id, props.collection.key)}
                              </span>
                              <button
                                class="flex size-5 shrink-0 items-center justify-center rounded text-icon-weak opacity-0 transition-opacity hover:bg-surface-raised-base/70 hover:text-text-base group-hover:opacity-100 focus:opacity-100"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  copyId(entry.id)
                                }}
                                title="Copy ID"
                              >
                                <Copy class="size-3" />
                              </button>
                              <button
                                class="flex size-5 shrink-0 items-center justify-center rounded text-icon-weak opacity-0 transition-opacity hover:bg-surface-raised-base/70 hover:text-text-base group-hover:opacity-100 focus:opacity-100"
                                classList={{
                                  "opacity-100 text-text-base": props.selected === entry.id,
                                }}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  props.onSelect(props.selected === entry.id ? null : entry.id)
                                }}
                                title={props.selected === entry.id ? "Close sidebar" : "Open in sidebar"}
                              >
                                <SquareArrowOutUpRight class="size-3" />
                              </button>
                            </div>
                            <div class={`flex h-full min-w-0 items-center gap-2 overflow-hidden pr-3 ${COL_EDGE}`}>
                              <div
                                class="min-w-0 flex-1 flex items-center gap-2 overflow-hidden rounded"
                                classList={{
                                  "text-text-weaker italic": meta().empty,
                                  "text-text-base": !meta().empty,
                                  [MISSING]: titleRequired() && meta().empty,
                                }}
                              >
                                {edit(
                                  entry.id,
                                  meta().key,
                                  () => (meta().empty ? "Untitled" : meta().value),
                                  () => meta().empty,
                                )}
                                <Show when={store.fresh.includes(entry.id)}>
                                  <span class="shrink-0 px-1.5 py-0.5 rounded text-9-medium bg-emerald-500/20 text-emerald-400 uppercase tracking-wider animate-fade-out">
                                    New
                                  </span>
                                </Show>
                              </div>
                            </div>
                            <For each={orderedCols()}>
                              {(key) => {
                                const change = () => state.cellChanges[`${entry.id}\u0000${key}`]
                                const changeClass = () => {
                                  const c = change()
                                  if (!c) return ""
                                  if (c.type === "add") return "animate-cell-add"
                                  if (c.type === "update") return "animate-cell-update"
                                  if (c.type === "delete") return "animate-cell-delete"
                                  return ""
                                }
                                const def = () => schemaMap().get(key)
                                const missingRing = () =>
                                  cellMissing(entry.id, key) && !isColorCol(key, def()) && !isIconCol(key, def())
                                return (
                                  <div
                                    class={`flex h-full min-w-0 items-center overflow-hidden rounded px-2 ${changeClass()} ${COL_EDGE}`}
                                    classList={{ [MISSING]: missingRing() }}
                                  >
                                    {edit(entry.id, key, () => value(entry, key))}
                                  </div>
                                )
                              }}
                            </For>
                            <div class={`flex h-full min-w-0 items-center overflow-hidden px-2 ${COL_EDGE}`}>
                              <Show
                                when={(backlinks().get(entry.id) ?? []).length > 0}
                                fallback={<span class="truncate px-1.5 text-11-regular text-text-weaker">—</span>}
                              >
                                <div class="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden pr-1">
                                  <For each={backlinks().get(entry.id) ?? []}>
                                    {(item) => (
                                      <button
                                        type="button"
                                        class="inline-flex max-w-full min-w-0 items-center gap-1 rounded px-1.5 py-[1px] text-9-regular tracking-wide transition-opacity hover:opacity-80"
                                        style={style(IN_PILL)}
                                        title={`${labelOf(item.id, data.facts())} via ${item.via}`}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          openBacklink(item.id)
                                        }}
                                      >
                                        <CornerDownLeft class="size-3 shrink-0 opacity-80" />
                                        <span class="min-w-0 truncate">{labelOf(item.id, data.facts())}</span>
                                      </button>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                            <div
                              class={`sticky right-0 z-30 flex h-full items-center justify-center border-l border-border-weaker-base px-1 shadow-[-12px_0_16px_-18px_rgba(0,0,0,0.8)] ${ROW_BG}`}
                              classList={{ ...sticky(), ...stickyHoverCls() }}
                            >
                              <DropdownMenu placement="bottom-end" gutter={4} modal={false}>
                                <DropdownMenu.Trigger
                                  class="flex size-6 items-center justify-center rounded-md text-icon-weak transition-colors hover:bg-surface-raised-base/70 hover:text-text-base"
                                  onClick={(event) => event.stopPropagation()}
                                  title="Row actions"
                                >
                                  <MoreHorizontal class="size-3.5" />
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                  <DropdownMenu.Content class="min-w-[140px]">
                                    <Show when={status(entry.id) !== "published"}>
                                      <DropdownMenu.Item onSelect={() => void saveStatus(entry.id, "published")}>
                                        <DropdownMenu.ItemLabel>
                                          <span class="flex items-center gap-2 text-emerald-400">
                                            <Globe class="size-3.5" />
                                            <span>Publish</span>
                                          </span>
                                        </DropdownMenu.ItemLabel>
                                      </DropdownMenu.Item>
                                    </Show>
                                    <Show when={status(entry.id) !== "draft"}>
                                      <DropdownMenu.Item onSelect={() => void saveStatus(entry.id, "draft")}>
                                        <DropdownMenu.ItemLabel>
                                          <span class="flex items-center gap-2">
                                            <FileEdit class="size-3.5 text-icon-weak" />
                                            <span>Move to draft</span>
                                          </span>
                                        </DropdownMenu.ItemLabel>
                                      </DropdownMenu.Item>
                                    </Show>
                                    <Show when={status(entry.id) !== "archived"}>
                                      <DropdownMenu.Item onSelect={() => void saveStatus(entry.id, "archived")}>
                                        <DropdownMenu.ItemLabel>
                                          <span class="flex items-center gap-2 text-zinc-300">
                                            <Archive class="size-3.5" />
                                            <span>Archive</span>
                                          </span>
                                        </DropdownMenu.ItemLabel>
                                      </DropdownMenu.Item>
                                    </Show>
                                    <Show when={props.onDuplicate}>
                                      <DropdownMenu.Item onSelect={() => void props.onDuplicate?.(entry.id)}>
                                        <DropdownMenu.ItemLabel>
                                          <span class="flex items-center gap-2">
                                            <Copy class="size-3.5 text-icon-weak" />
                                            <span>Duplicate</span>
                                          </span>
                                        </DropdownMenu.ItemLabel>
                                      </DropdownMenu.Item>
                                    </Show>
                                    <DropdownMenu.Item
                                      onSelect={() => {
                                        void props.onDelete(entry.id)
                                        setState("picked", entry.id, false)
                                      }}
                                    >
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
                        </div>
                      )
                    }}
                  </For>
                </div>
              </Show>
              <Show when={entries().length > 0}>
                <div class="sticky bottom-0 z-30 border-t border-border-weaker-base bg-elevated">
                  <button
                    class="flex h-12 w-full items-center px-5 text-left text-11-medium text-text-weaker transition-colors hover:text-text-base"
                    onClick={() => void props.onCreate()}
                  >
                    <span class="sticky left-5 flex items-center gap-2">
                      <Plus class="size-3.5" />
                      <span>New entry</span>
                    </span>
                  </button>
                </div>
              </Show>
            </div>
          </div>
          <Show when={ids().length > 0}>
            <div class="shrink-0 border-t border-border-weaker-base px-3 py-2">
              <div class="flex flex-wrap items-center gap-1.5 rounded-md border border-border-weaker-base bg-surface-raised-base/30 px-2 py-1.5">
                <span class="mr-1 text-11-medium text-text-base">{ids().length} selected</span>
                <button
                  class="flex items-center gap-1 rounded px-2 py-1 text-11-medium text-emerald-400 hover:bg-emerald-500/10"
                  onClick={() => void batchStatus("published")}
                >
                  <Globe class="size-3.5" />
                  <span>Publish</span>
                </button>
                <button
                  class="flex items-center gap-1 rounded px-2 py-1 text-11-medium text-text-weak hover:bg-surface-raised-base/60 hover:text-text-base"
                  onClick={() => void batchStatus("draft")}
                >
                  <FileEdit class="size-3.5" />
                  <span>Draft</span>
                </button>
                <button
                  class="flex items-center gap-1 rounded px-2 py-1 text-11-medium text-zinc-300 hover:bg-zinc-500/10"
                  onClick={() => void batchStatus("archived")}
                >
                  <Archive class="size-3.5" />
                  <span>Archive</span>
                </button>
                <button
                  class="flex items-center gap-1 rounded px-2 py-1 text-11-medium text-red-400 hover:bg-red-500/10"
                  onClick={() => void batchDelete()}
                >
                  <Trash2 class="size-3.5" />
                  <span>Delete</span>
                </button>
                <button
                  class="ml-auto rounded px-2 py-1 text-11-regular text-text-weaker hover:text-text-base"
                  onClick={clear}
                >
                  Clear
                </button>
              </div>
            </div>
          </Show>
        </Match>
      </Switch>
      <Show when={colorPickerCtx()}>
        {(ctx) => (
          <ColorPickerDialog
            open={true}
            value={ctx().value}
            onClose={() => setColorPicker(null)}
            onSelect={(hex) => {
              void save(ctx().id, ctx().key, hex)
              setColorPicker(null)
            }}
          />
        )}
      </Show>
      <Show when={iconPickerCtx()}>
        {(ctx) => (
          <IconPickerDialog
            open={true}
            value={ctx().value}
            color={ctx().color}
            type={props.collection.key}
            onClose={() => setIconPicker(null)}
            onSelect={(icon) => {
              void save(ctx().id, ctx().key, icon)
              setIconPicker(null)
            }}
          />
        )}
      </Show>
    </div>
  )
}

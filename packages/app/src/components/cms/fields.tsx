import { useDialog } from "@opencode-ai/ui/context/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, Show, type Accessor, type JSX } from "solid-js"
import { Link2, X } from "lucide-solid"
import { useTrellisStore, type StoreFact } from "@/context/trellis-store"
import { useSDK } from "@/context/sdk"
import { matchesType, PROP_TYPE_ICONS, type PropDef, type PropType } from "@/pages/session/database-panel-utils"
import { useMentionCallbacks } from "@/lib/use-mention-callbacks"
import { MarkdownEditor } from "@/pages/session/file-editor"
import { formula } from "@/components/cms/formula"
import { labelOf } from "@/components/cms/reference"
import { media } from "@/pages/session/media"

export type FieldValue = string | number | boolean | undefined

export type FieldProps = {
  def: PropDef
  value: Accessor<FieldValue>
  values?: Accessor<Record<string, FieldValue>>
  onChange: (value: FieldValue) => void
  disabled?: boolean
}

const INPUT_CLASS =
  "w-full bg-surface-raised-base/40 border border-border-weaker-base rounded px-2 py-1.5 text-12-regular text-text-base outline-0 focus:border-border-base disabled:opacity-50"

export { INPUT_CLASS }

const typeIcon = (type: PropDef["type"]) =>
  type in PROP_TYPE_ICONS ? PROP_TYPE_ICONS[type as PropType] : PROP_TYPE_ICONS.text

export function FieldRow(props: { def: PropDef; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="text-11-medium text-text-weak flex items-center gap-1.5 min-h-[14px]">
        <Icon name={typeIcon(props.def.type)} size="small" class="text-text-weaker shrink-0 opacity-80" />
        <span class="capitalize">{props.def.label}</span>
        <Show when={props.def.required}>
          <span class="text-red-500" title="Required">
            *
          </span>
        </Show>
        <span class="ml-auto text-10-regular text-text-weaker font-mono transition-[margin] duration-150 group-hover:mr-5">
          {props.def.type}
        </span>
      </span>
      {props.children}
    </label>
  )
}

function TextField(props: FieldProps) {
  const inputType = () => (props.def.type === "email" ? "email" : props.def.type === "url" ? "url" : "text")
  const value = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  return (
    <FieldRow def={props.def}>
      <input
        type={inputType()}
        class={INPUT_CLASS}
        value={value()}
        placeholder={props.def.default}
        onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
        disabled={props.disabled}
      />
    </FieldRow>
  )
}

function NumberField(props: FieldProps) {
  const value = () => {
    const v = props.value()
    return typeof v === "number" ? v : ""
  }
  return (
    <FieldRow def={props.def}>
      <input
        type="number"
        class={INPUT_CLASS}
        value={value()}
        min={props.def.min}
        max={props.def.max}
        step={props.def.step}
        placeholder={props.def.default}
        onInput={(e) => {
          const raw = e.currentTarget.value
          if (raw === "") return props.onChange(undefined)
          const n = Number(raw)
          if (Number.isFinite(n)) props.onChange(n)
        }}
        disabled={props.disabled}
      />
    </FieldRow>
  )
}

function BooleanField(props: FieldProps) {
  return (
    <FieldRow def={props.def}>
      <div class="flex items-center gap-2 px-2 py-1.5 rounded border border-border-weaker-base bg-surface-raised-base/40">
        <input
          type="checkbox"
          class="size-3.5 accent-text-strong"
          checked={Boolean(props.value())}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
          disabled={props.disabled}
        />
        <span class="text-12-regular text-text-weak">{Boolean(props.value()) ? "True" : "False"}</span>
      </div>
    </FieldRow>
  )
}

function DateField(props: FieldProps) {
  const stringValue = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  const dateValue = () => {
    const v = stringValue()
    if (!v) return ""
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return ""
    return d.toISOString().slice(0, 10)
  }
  return (
    <FieldRow def={props.def}>
      <div class="flex flex-col gap-1">
        <input
          type="date"
          class={INPUT_CLASS}
          value={dateValue()}
          onInput={(e) => {
            const raw = e.currentTarget.value
            if (!raw) return props.onChange(undefined)
            props.onChange(new Date(raw).toISOString())
          }}
          disabled={props.disabled}
        />
        <Show when={props.def.repeat && props.def.repeat !== "none"}>
          <span class="text-10-regular text-text-weaker">Repeats {props.def.repeat}</span>
        </Show>
      </div>
    </FieldRow>
  )
}

function SelectField(props: FieldProps) {
  const options = () => props.def.options ?? []
  const value = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  return (
    <FieldRow def={props.def}>
      <select
        class={INPUT_CLASS + " appearance-none cursor-pointer"}
        value={value()}
        onChange={(e) => props.onChange(e.currentTarget.value || undefined)}
        disabled={props.disabled}
      >
        <option value="">— none —</option>
        <For each={options()}>{(opt) => <option value={opt}>{opt}</option>}</For>
      </select>
    </FieldRow>
  )
}

function ColorField(props: FieldProps) {
  const value = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  const hex = () => {
    const v = props.value()
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) return v
    if (typeof props.def.default === "string" && /^#[0-9a-fA-F]{6}$/.test(props.def.default)) return props.def.default
    return "#888888"
  }
  return (
    <FieldRow def={props.def}>
      <div class="flex items-center gap-2">
        <input
          type="color"
          class="size-8 rounded border border-border-weaker-base bg-transparent cursor-pointer disabled:opacity-50"
          value={hex()}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          disabled={props.disabled}
        />
        <input
          type="text"
          class={INPUT_CLASS + " font-mono"}
          value={value()}
          placeholder={hex()}
          onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
          disabled={props.disabled}
        />
      </div>
    </FieldRow>
  )
}

function RichTextField(props: FieldProps) {
  const mention = useMentionCallbacks()
  const value = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  return (
    <FieldRow def={props.def}>
      <div
        data-cms-field
        class="bg-surface-raised-base/40 border border-border-weaker-base rounded px-1 py-0.5 min-h-[96px] focus-within:border-border-base overflow-hidden"
      >
        <MarkdownEditor
          path={`cms:${props.def.key}`}
          value={value()}
          active={true}
          onChange={(v) => props.onChange(v || undefined)}
          mention={mention}
        />
      </div>
    </FieldRow>
  )
}

function FormulaField(props: FieldProps) {
  const value = createMemo(() => {
    const result = formula(props.def.formula ?? "", props.values?.() ?? {})
    return result === undefined ? "—" : String(result)
  })
  return (
    <FieldRow def={props.def}>
      <div class="flex items-center gap-2 px-2 py-1.5 rounded border border-border-weaker-base bg-surface-raised-base/30">
        <span class="text-10-medium text-text-weaker font-mono">ƒ</span>
        <span class="text-12-regular text-text-base font-mono">{value()}</span>
        <Show when={props.def.formula}>
          <span class="ml-auto text-10-regular text-text-weaker font-mono truncate">{props.def.formula}</span>
        </Show>
      </div>
    </FieldRow>
  )
}

function ReferenceField(props: FieldProps) {
  const store = useTrellisStore()
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")

  const target = () => props.def.target
  const current = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }

  const facts = createMemo(() => {
    const map = new Map<string, StoreFact[]>()
    for (const fact of store.facts) {
      const list = map.get(fact.e)
      if (list) list.push(fact)
      else map.set(fact.e, [fact])
    }
    return map
  })

  const candidates = createMemo(() => {
    const t = target()
    const list = t ? store.entities.filter((e) => matchesType(e.type, t)) : store.entities
    const q = query().trim().toLowerCase()
    const filtered = q
      ? list.filter((e) => {
          if (e.id.toLowerCase().includes(q)) return true
          const list = facts().get(e.id) ?? []
          return list.some(
            (f) =>
              (f.a === "title" || f.a === "name" || f.a === "label" || f.a === "description") &&
              String(f.v).toLowerCase().includes(q),
          )
        })
      : list
    return filtered.slice(0, 20)
  })

  const select = (id: string) => {
    props.onChange(id)
    setOpen(false)
    setQuery("")
  }

  return (
    <FieldRow def={props.def}>
      <Show
        when={current()}
        fallback={
          <button
            type="button"
            class={INPUT_CLASS + " text-left text-text-weaker hover:text-text-weak transition-colors"}
            onClick={() => setOpen(true)}
            disabled={props.disabled}
          >
            {target() ? `Pick a ${target()}…` : "Pick an entity…"}
          </button>
        }
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex flex-1 items-center gap-2 rounded border px-2 py-1.5 text-left text-12-regular disabled:opacity-50"
            style={{
              "background-color": "rgba(167, 139, 250, 0.24)",
              "border-color": "rgba(167, 139, 250, 0.34)",
              color: "rgb(167, 139, 250)",
              "box-shadow": "inset 0 0 0 1px rgba(167, 139, 250, 0.2)",
            }}
            onClick={() => setOpen(true)}
            disabled={props.disabled}
          >
            <Link2 class="size-3.5 shrink-0 opacity-80" />
            <span class="truncate">{labelOf(current(), facts())}</span>
          </button>
          <button
            type="button"
            class="px-2 py-1.5 text-text-weaker hover:text-text-base"
            onClick={() => props.onChange(undefined)}
            disabled={props.disabled}
            title="Clear"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </Show>

      <Show when={open()}>
        <div class="border border-border-weaker-base rounded bg-background-base mt-1 overflow-hidden">
          <input
            autofocus
            type="text"
            class="w-full bg-transparent border-0 border-b border-border-weaker-base outline-0 px-2 py-1.5 text-12-regular"
            placeholder={target() ? `Search ${target()}…` : "Search entities…"}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false)
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          <div class="max-h-48 overflow-y-auto">
            <Show
              when={candidates().length > 0}
              fallback={<div class="px-2 py-2 text-11-regular text-text-weaker italic text-center">No results</div>}
            >
              <For each={candidates()}>
                {(e) => (
                  <button
                    type="button"
                    class="w-full text-left px-2 py-1.5 text-12-regular hover:bg-surface-raised-base/40 flex items-center gap-2"
                    onMouseDown={() => select(e.id)}
                  >
                    <span class="truncate flex-1">{labelOf(e.id, facts())}</span>
                    <span class="text-10-regular text-text-weaker font-mono shrink-0">{e.id}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </FieldRow>
  )
}

function AssetField(props: FieldProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const value = () => {
    const v = props.value()
    return typeof v === "string" ? v : ""
  }
  const src = () => {
    const v = value()
    return v ? media(sdk.url, v, sdk.directory) : ""
  }
  const pick = () => {
    void import("@/components/dialog-select-file").then((mod) => {
      dialog.show(() => <mod.DialogSelectFile mode="files" onSelectFile={(path) => props.onChange(path)} />)
    })
  }
  return (
    <FieldRow def={props.def}>
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <div class="flex-1 relative">
            <input
              type="text"
              class={INPUT_CLASS + " pl-8 font-mono"}
              placeholder="assets/file.png"
              value={value()}
              onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
              disabled={props.disabled}
            />
            <FileIcon
              node={{ path: value() || props.def.key, type: "file" }}
              class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5"
            />
          </div>
          <button
            type="button"
            class="px-2 py-1.5 rounded border border-border-weaker-base text-11-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 disabled:opacity-50"
            onClick={pick}
            disabled={props.disabled}
          >
            Browse
          </button>
          <Show when={value()}>
            <button
              type="button"
              class="px-2 py-1.5 text-text-weaker hover:text-text-base"
              onClick={() => props.onChange(undefined)}
              disabled={props.disabled}
              title="Clear"
            >
              <X class="size-3.5" />
            </button>
          </Show>
        </div>
        <Show when={props.def.type === "image" && src()}>
          <div class="rounded border border-border-weaker-base overflow-hidden bg-surface-raised-base/30 p-2 flex items-center justify-center">
            <img
              src={src()}
              alt={props.def.label}
              class="max-h-32 max-w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          </div>
        </Show>
        <Show when={props.def.type === "video" && src()}>
          <video src={src()} controls class="rounded border border-border-weaker-base max-h-40 bg-black" />
        </Show>
        <Show when={props.def.type === "audio" && src()}>
          <audio src={src()} controls preload="metadata" class="w-full" />
        </Show>
      </div>
    </FieldRow>
  )
}

function FallbackField(props: FieldProps) {
  return (
    <FieldRow def={props.def}>
      <input
        type="text"
        class={INPUT_CLASS}
        value={props.value() === undefined ? "" : String(props.value())}
        onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
        disabled={props.disabled}
      />
      <span class="text-10-regular text-text-weaker">
        Field type "{props.def.type}" not yet supported — falling back to text input
      </span>
    </FieldRow>
  )
}

export function Field(props: FieldProps) {
  switch (props.def.type) {
    case "text":
    case "email":
    case "url":
      return <TextField {...props} />
    case "number":
      return <NumberField {...props} />
    case "boolean":
      return <BooleanField {...props} />
    case "date":
      return <DateField {...props} />
    case "select":
      return <SelectField {...props} />
    case "color":
      return <ColorField {...props} />
    case "rich_text":
      return <RichTextField {...props} />
    case "reference":
      return <ReferenceField {...props} />
    case "file":
    case "image":
    case "video":
    case "audio":
      return <AssetField {...props} />
    case "formula":
      return <FormulaField {...props} />
    default:
      return <FallbackField {...props} />
  }
}

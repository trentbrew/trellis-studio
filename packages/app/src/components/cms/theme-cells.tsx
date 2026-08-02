import { createEffect, createSignal, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { EntityIcon } from "@/lib/entity-theme"

export const EMPTY_COLOR = "#00000000"
export const EMPTY_ICON = "thing"
export const EMPTY_LABEL = "Not set"

const CELL =
  "flex h-7 min-w-0 w-full max-w-full cursor-pointer items-stretch overflow-hidden rounded border border-border-weaker-base bg-surface-raised-base/10 text-11-regular transition-colors hover:bg-surface-raised-base/30"
const PREVIEW = "flex w-7 shrink-0 items-center justify-center border-r border-border-weaker-base"
const VALUE = "flex min-w-0 flex-1 items-center truncate px-2 text-10-regular text-text-base"

function isNil(value: string | undefined | null) {
  return value === undefined || value === null || value === ""
}

export function normalizeHex(raw: string | undefined | null, fallback: string) {
  if (raw === undefined || raw === null || raw === "") return fallback
  const s = String(raw).trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`
  return fallback
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`
}

function parseHex(hex: string) {
  const m = hex.replace(/^#/, "").match(/^([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100
  return { h, s, v }
}

function hsvToRgb(h: number, s: number, v: number) {
  s /= 100
  v /= 100
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function dragPlane(event: MouseEvent, el: HTMLElement, move: (x: number, y: number) => void) {
  const pick = (e: MouseEvent) => {
    const rect = el.getBoundingClientRect()
    move(clamp((e.clientX - rect.left) / rect.width, 0, 1), clamp((e.clientY - rect.top) / rect.height, 0, 1))
  }
  pick(event)
  const onMove = (event: MouseEvent) => pick(event)
  const onUp = () => {
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)
  }
  document.addEventListener("mousemove", onMove)
  document.addEventListener("mouseup", onUp)
}

export function ColorPickerDialog(props: {
  open: boolean
  value: string
  onClose: () => void
  onSelect: (hex: string) => void
}) {
  const [h, setH] = createSignal(0)
  const [s, setS] = createSignal(100)
  const [v, setV] = createSignal(100)
  const [hexDraft, setHexDraft] = createSignal("#000000")

  const rgb = () => hsvToRgb(h(), s(), v())
  const hex = () => rgbToHex(rgb().r, rgb().g, rgb().b)

  createEffect(() => {
    if (!props.open) return
    const parsed = parseHex(props.value)
    if (!parsed) return
    const next = rgbToHsv(parsed.r, parsed.g, parsed.b)
    setH(next.h)
    setS(next.s)
    setV(next.v)
    setHexDraft(rgbToHex(parsed.r, parsed.g, parsed.b))
  })

  createEffect(() => {
    if (!props.open) return
    setHexDraft(hex())
  })

  const applyHex = (raw: string) => {
    const normalized = normalizeHex(raw, hex())
    const parsed = parseHex(normalized)
    if (!parsed) return
    const next = rgbToHsv(parsed.r, parsed.g, parsed.b)
    setH(next.h)
    setS(next.s)
    setV(next.v)
    setHexDraft(normalized)
  }

  const setPlane = (x: number, y: number) => {
    setS(x * 100)
    setV((1 - y) * 100)
  }

  return (
    <Show when={props.open}>
      <div class="db-icon-dialog-backdrop" onClick={props.onClose}>
        <div class="db-color-dialog" onClick={(event) => event.stopPropagation()}>
          <div class="db-icon-dialog-header">
            <div class="text-13-medium text-text-strong">Choose color</div>
            <button class="db-detail-close" onClick={props.onClose} title="Close">
              <Icon name="x" size="small" />
            </button>
          </div>
          <div class="db-color-dialog-body">
            <div
              class="db-color-plane"
              style={{ "background-color": `hsl(${h()}, 100%, 50%)` }}
              onMouseDown={(event) => {
                event.preventDefault()
                dragPlane(event, event.currentTarget, setPlane)
              }}
            >
              <div
                class="db-color-plane-cursor"
                style={{
                  left: `${s()}%`,
                  top: `${100 - v()}%`,
                  "background-color": hex(),
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              class="db-color-hue"
              value={h()}
              onInput={(event) => setH(Number(event.currentTarget.value))}
            />
            <div class="db-color-fields">
              <span class="db-color-preview" style={{ "background-color": hex() }} />
              <label class="db-color-field">
                <span>Hex</span>
                <input
                  class="db-field-input db-field-input--sm"
                  value={hexDraft()}
                  onInput={(event) => {
                    const next = event.currentTarget.value
                    setHexDraft(next)
                    if (/^#?[0-9a-fA-F]{6}$/.test(next.replace(/^#/, ""))) applyHex(next)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyHex(hexDraft())
                      props.onSelect(hex())
                    }
                  }}
                />
              </label>
              <label class="db-color-field">
                <span>R</span>
                <input
                  class="db-field-input db-field-input--sm"
                  type="number"
                  min={0}
                  max={255}
                  value={Math.round(rgb().r)}
                  onInput={(event) => {
                    const parsed = parseHex(hex())
                    if (!parsed) return
                    parsed.r = Number(event.currentTarget.value)
                    applyHex(rgbToHex(parsed.r, parsed.g, parsed.b))
                  }}
                />
              </label>
              <label class="db-color-field">
                <span>G</span>
                <input
                  class="db-field-input db-field-input--sm"
                  type="number"
                  min={0}
                  max={255}
                  value={Math.round(rgb().g)}
                  onInput={(event) => {
                    const parsed = parseHex(hex())
                    if (!parsed) return
                    parsed.g = Number(event.currentTarget.value)
                    applyHex(rgbToHex(parsed.r, parsed.g, parsed.b))
                  }}
                />
              </label>
              <label class="db-color-field">
                <span>B</span>
                <input
                  class="db-field-input db-field-input--sm"
                  type="number"
                  min={0}
                  max={255}
                  value={Math.round(rgb().b)}
                  onInput={(event) => {
                    const parsed = parseHex(hex())
                    if (!parsed) return
                    parsed.b = Number(event.currentTarget.value)
                    applyHex(rgbToHex(parsed.r, parsed.g, parsed.b))
                  }}
                />
              </label>
            </div>
          </div>
          <div class="db-color-dialog-footer">
            <button class="db-action-btn" onClick={props.onClose}>
              Cancel
            </button>
            <button
              class="db-action-btn db-action-btn--primary"
              onClick={() => {
                props.onSelect(hex())
                props.onClose()
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export function ColorCell(props: {
  value: string | undefined | null
  title?: string
  onPick: () => void
}) {
  const empty = () => isNil(props.value)
  const hex = () => (empty() ? EMPTY_COLOR : normalizeHex(props.value, EMPTY_COLOR))

  return (
    <button
      type="button"
      class={CELL}
      title={props.title}
      onClick={(event) => {
        event.stopPropagation()
        props.onPick()
      }}
    >
      <span class={PREVIEW}>
        <span
          class="size-4 rounded-sm border border-border-weaker-base/80"
          classList={{ "db-color-swatch-transparent": empty() }}
          style={{ "background-color": hex() }}
        />
      </span>
      <span
        class={VALUE}
        classList={{ "text-text-weaker": empty(), "font-mono": !empty() }}
      >
        {empty() ? EMPTY_LABEL : hex()}
      </span>
    </button>
  )
}

export function IconCell(props: {
  value: string | undefined | null
  color: string
  type: string
  title?: string
  onPick: () => void
}) {
  const empty = () => isNil(props.value)
  const icon = () => (empty() ? EMPTY_ICON : String(props.value))
  const label = () => (empty() ? EMPTY_LABEL : String(props.value))
  const iconColor = () => (empty() ? "rgb(113, 113, 122)" : props.color)

  return (
    <button
      type="button"
      class={CELL}
      title={props.title}
      onClick={(event) => {
        event.stopPropagation()
        props.onPick()
      }}
    >
      <span class={PREVIEW}>
        <EntityIcon type={props.type} color={iconColor()} icon={icon()} size={14} class="shrink-0" />
      </span>
      <span class={VALUE} classList={{ "text-text-weaker italic": empty() }}>
        {label()}
      </span>
    </button>
  )
}

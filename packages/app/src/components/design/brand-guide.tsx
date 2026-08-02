import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Upload, X } from "lucide-solid"
import {
  CURATED_FONTS,
  type BrandSemanticsView,
  type BrandSnapshotView,
} from "@/lib/design-entity-client"
import { EntityIcon } from "@/lib/entity-theme"
import { formatIconKey } from "@/lib/icon-key"
import "./brand-guide.css"

type Props = {
  snapshot: BrandSnapshotView
  logoUrl?: string
  uploadingLogo?: boolean
  savingSemantics?: boolean
  savingBrand?: boolean
  onUploadLogo: (file: File) => void | Promise<void>
  onSaveSemantics: (semantics: BrandSemanticsView) => void | Promise<void>
  onSaveName: (name: string) => void | Promise<void>
  onSaveSwatch: (paletteId: string, role: string, color: string) => void | Promise<void>
  onSaveFontFamily: (family: string) => void | Promise<void>
}

const displayHex = (hex: string) => hex.replace(/^#/, "").toUpperCase()

const readableOn = (hex: string) => {
  const raw = hex.replace(/^#/, "")
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return "#f8fafc"
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? "#0a0a0a" : "#f8fafc"
}

const normalizeHex = (hex: string) => {
  const raw = hex.trim().replace(/^#/, "")
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${[...raw].map((c) => c + c).join("")}`.toLowerCase()
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase()
  return hex
}

const colorInputValue = (hex: string) => {
  const normalized = normalizeHex(hex)
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#000000"
}

const initialAdjectives = (semantics?: BrandSemanticsView) => {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (tag: string) => {
    const key = tag.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(tag.trim())
  }
  for (const tag of semantics?.adjectives ?? []) add(tag)
  for (const tag of semantics?.tone ?? []) add(tag)
  for (const tag of semantics?.mood ?? []) add(tag)
  for (const tag of semantics?.values ?? []) add(tag)
  return out
}

function iconCatalogRef(icon: { key: string; library: string }) {
  if (icon.library === "lucide") return icon.key
  return formatIconKey(icon.library as "lucide" | "custom", icon.key)
}

function TypeSpecimen(props: { label: string; family: string; sample: string; large?: boolean }) {
  return (
    <div class="brand-type-specimen">
      <div class="brand-type-specimen-label">{props.label}</div>
      <div
        class="brand-type-specimen-sample"
        classList={{ "brand-type-specimen-sample--lg": props.large }}
        style={{ "font-family": `"${props.family}", system-ui, sans-serif` }}
      >
        {props.sample}
      </div>
    </div>
  )
}

function PaletteSwatch(props: {
  role: string
  color: string
  disabled?: boolean
  onSave: (role: string, color: string) => void | Promise<void>
}) {
  let input: HTMLInputElement | undefined

  const pick = () => {
    if (props.disabled) return
    input?.click()
  }

  const onColorChange: JSX.EventHandlerUnion<HTMLInputElement, Event> = (e) => {
    void props.onSave(props.role, e.currentTarget.value)
  }

  return (
    <>
      <button
        type="button"
        class="brand-palette-bar"
        style={{ "background-color": props.color, color: readableOn(props.color) }}
        disabled={props.disabled}
        onClick={pick}
        title={`Edit ${props.role} color`}
      >
        <span class="brand-palette-bar-label">
          <span class="brand-palette-bar-hex">{displayHex(props.color)}</span>
          <span class="brand-palette-bar-role">{props.role}</span>
        </span>
      </button>
      <input
        ref={(el) => {
          input = el
        }}
        type="color"
        class="sr-only"
        value={colorInputValue(props.color)}
        disabled={props.disabled}
        onChange={onColorChange}
      />
    </>
  )
}

function BrandVoiceEditor(props: {
  semantics?: BrandSemanticsView
  saving?: boolean
  onSave: (semantics: BrandSemanticsView) => void | Promise<void>
}) {
  const [voice, setVoice] = createSignal("")
  const [adjectives, setAdjectives] = createSignal<string[]>([])
  const [draft, setDraft] = createSignal("")

  createEffect(() => {
    const sem = props.semantics
    setVoice(sem?.voice ?? "")
    setAdjectives(initialAdjectives(sem))
    setDraft("")
  })

  const persist = async (nextVoice: string, nextAdjectives: string[]) => {
    const sem = props.semantics
    await props.onSave({
      ...sem,
      voice: nextVoice.trim() || undefined,
      adjectives: nextAdjectives.length ? nextAdjectives : undefined,
    })
  }

  const addTag = (raw: string) => {
    const parts = raw
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) return
    const seen = new Set(adjectives().map((t) => t.toLowerCase()))
    const next = [...adjectives()]
    for (const part of parts) {
      const key = part.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(part)
    }
    setAdjectives(next)
    setDraft("")
    void persist(voice(), next)
  }

  const removeTag = (index: number) => {
    const next = adjectives().filter((_, i) => i !== index)
    setAdjectives(next)
    void persist(voice(), next)
  }

  const onDraftKeyDown: JSX.EventHandlerUnion<HTMLInputElement, KeyboardEvent> = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(draft())
      return
    }
    if (e.key === "Backspace" && !draft() && adjectives().length) {
      removeTag(adjectives().length - 1)
    }
  }

  return (
    <div class="brand-voice-editor">
      <label class="brand-field-label" for="brand-voice-description">
        Brand voice
      </label>
      <textarea
        id="brand-voice-description"
        class="brand-voice-textarea"
        rows={4}
        placeholder="Describe how this brand sounds in copy…"
        value={voice()}
        disabled={props.saving}
        onInput={(e) => setVoice(e.currentTarget.value)}
        onBlur={() => void persist(voice(), adjectives())}
      />

      <label class="brand-field-label" for="brand-voice-adjectives">
        Adjectives
      </label>
      <div
        class="brand-tag-field"
        classList={{ "brand-tag-field--disabled": props.saving }}
        onClick={() => document.getElementById("brand-voice-adjectives")?.focus()}
      >
        <For each={adjectives()}>
          {(tag, index) => (
            <span class="brand-voice-tag">
              {tag}
              <button
                type="button"
                class="brand-voice-tag-remove"
                aria-label={`Remove ${tag}`}
                disabled={props.saving}
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(index())
                }}
              >
                <X class="size-3" />
              </button>
            </span>
          )}
        </For>
        <input
          id="brand-voice-adjectives"
          type="text"
          class="brand-tag-input"
          placeholder={adjectives().length ? "Add another…" : "Type and press Enter…"}
          value={draft()}
          disabled={props.saving}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onDraftKeyDown}
          onBlur={() => {
            if (draft().trim()) addTag(draft())
          }}
        />
      </div>
    </div>
  )
}

export function BrandGuide(props: Props) {
  const primary = createMemo(() => {
    const snap = props.snapshot
    return snap.palettes.find((p) => p.id === snap.primaryPaletteId) ?? snap.palettes[0]
  })

  const sampleIcons = createMemo(() => props.snapshot.icons.slice(0, 12))

  const heading = () =>
    props.snapshot.fonts.find((f) => f.id === props.snapshot.headingFontId)?.family ?? "Inter"
  const body = () => props.snapshot.fonts.find((f) => f.id === props.snapshot.bodyFontId)?.family ?? "Inter"
  const mono = () => props.snapshot.fonts.find((f) => f.id === props.snapshot.monoFontId)?.family ?? "JetBrains Mono"

  const fontOptions = createMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const add = (family: string) => {
      const key = family.trim()
      if (!key || seen.has(key)) return
      seen.add(key)
      out.push(key)
    }
    for (const font of props.snapshot.fonts) add(font.family)
    for (const font of CURATED_FONTS) add(font.family)
    return out
  })

  const [brandName, setBrandName] = createSignal(props.snapshot.name)

  createEffect(() => {
    setBrandName(props.snapshot.name)
  })

  let logoInput: HTMLInputElement | undefined

  const pickLogo = () => logoInput?.click()

  const onLogoChange: JSX.EventHandlerUnion<HTMLInputElement, Event> = (e) => {
    const file = e.currentTarget.files?.[0]
    if (file) void props.onUploadLogo(file)
    e.currentTarget.value = ""
  }

  const commitName = () => {
    const next = brandName().trim()
    if (!next || next === props.snapshot.name) return
    void props.onSaveName(next)
  }

  const busy = () => props.savingBrand || props.savingSemantics

  return (
    <div class="brand-bento">
      <header class="brand-bento-cell brand-bento-hero">
        <div class="brand-bento-hero-copy">
          <p class="brand-bento-eyebrow">Brand guide</p>
          <input
            type="text"
            class="brand-bento-title brand-bento-title-input"
            value={brandName()}
            disabled={busy()}
            aria-label="Brand name"
            onInput={(e) => setBrandName(e.currentTarget.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      </header>

      <div class="brand-bento-pair brand-bento-pair--logo-voice">
        <section class="brand-bento-cell brand-bento-logo" aria-label="Brand logo">
          <div class="brand-bento-cell-head">
            <span class="brand-bento-cell-title">Logo mark</span>
            <span class="brand-bento-cell-hint">SVG or PNG</span>
          </div>
          <button
            type="button"
            class="brand-logo-drop"
            onClick={pickLogo}
            disabled={props.uploadingLogo}
            title="Upload brand logo"
          >
            <Show
              when={props.logoUrl}
              fallback={
                <div class="brand-logo-placeholder">
                  <Upload class="size-8 opacity-60" />
                  <span>Drop or click to upload</span>
                </div>
              }
            >
              <img src={props.logoUrl} alt="" class="brand-logo-image" />
            </Show>
            <span class="brand-logo-overlay">
              <Show when={props.uploadingLogo} fallback={<Upload class="size-5" />}>
                <Spinner />
              </Show>
            </span>
          </button>
          <input
            ref={(el) => {
              logoInput = el
            }}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp,image/avif"
            class="sr-only"
            onChange={onLogoChange}
          />
        </section>

        <section class="brand-bento-cell brand-bento-voice">
          <div class="brand-bento-cell-head">
            <span class="brand-bento-cell-title">Voice & semantics</span>
            <Show when={props.savingSemantics}>
              <span class="brand-bento-cell-hint">Saving…</span>
            </Show>
          </div>
          <BrandVoiceEditor
            semantics={props.snapshot.semantics}
            saving={props.savingSemantics}
            onSave={props.onSaveSemantics}
          />
        </section>
      </div>

      <div class="brand-bento-pair brand-bento-pair--type-icons">
        <section class="brand-bento-cell brand-bento-type">
          <div class="brand-bento-cell-head brand-bento-cell-head--stacked">
            <span class="brand-bento-cell-title">Typography</span>
            <label class="brand-font-select-wrap">
              <span class="sr-only">Font family</span>
              <select
                class="brand-font-select"
                value={heading()}
                disabled={busy()}
                onChange={(e) => void props.onSaveFontFamily(e.currentTarget.value)}
              >
                <For each={fontOptions()}>
                  {(family) => <option value={family}>{family}</option>}
                </For>
              </select>
            </label>
          </div>
          <div class="brand-type-stack">
            <TypeSpecimen label="Display" family={heading()} sample="Aa" large />
            <TypeSpecimen label="Heading" family={heading()} sample="The quick brown fox" />
            <TypeSpecimen label="Body" family={body()} sample="Design systems stay coherent when type scales match intent." />
            <TypeSpecimen label="Mono" family={mono()} sample={'const brand = "on-brand"'} />
          </div>
        </section>

        <section class="brand-bento-cell brand-bento-icons">
          <div class="brand-bento-cell-head">
            <span class="brand-bento-cell-title">Icon system</span>
            <span class="brand-bento-cell-hint capitalize">
              {props.snapshot.iconLibrary} · {props.snapshot.icons.length} enabled
            </span>
          </div>
          <div class="brand-icon-grid">
            <For each={sampleIcons()}>
              {(icon) => (
                <div class="brand-icon-cell" title={icon.key}>
                  <EntityIcon type="Icon" icon={iconCatalogRef(icon)} size={22} class="text-text-strong" />
                  <span class="brand-icon-name">{icon.key}</span>
                </div>
              )}
            </For>
            <Show when={sampleIcons().length === 0}>
              <p class="brand-bento-muted brand-icon-empty">No icons enabled yet. Add icons from the Icons section.</p>
            </Show>
          </div>
        </section>
      </div>

      <Show when={primary()}>
        {(palette) => (
          <section class="brand-bento-cell brand-bento-palette" aria-label={`Color palette ${palette().name}`}>
            <div class="brand-bento-cell-head">
              <span class="brand-bento-cell-title">Colors</span>
            </div>
            <div class="brand-palette-strip">
              <For each={Object.entries(palette().swatches)}>
                {([role, color]) => (
                  <PaletteSwatch
                    role={role}
                    color={color}
                    disabled={busy()}
                    onSave={(r, c) => props.onSaveSwatch(palette().id, r, c)}
                  />
                )}
              </For>
            </div>
          </section>
        )}
      </Show>
    </div>
  )
}

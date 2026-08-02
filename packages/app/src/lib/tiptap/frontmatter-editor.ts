import type { Editor, NodeViewRendererProps } from "@tiptap/core"
import type { Node } from "@tiptap/pm/model"

export interface FrontmatterOptions {
  getModels?: () => string[]
}

// ── YAML serializer ─────────────────────────────────────────────────────────

function yamlVal(v: unknown): string {
  if (typeof v === "boolean" || typeof v === "number") return String(v)
  if (typeof v === "string") {
    const needs = v === "" || v.trim() !== v || /[:#\[\]{},|>&*!'"\\%@`]/.test(v)
    return needs ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v
  }
  return String(v)
}

export function serializeFrontmatter(meta: Record<string, unknown>): string {
  const lines: string[] = ["---"]
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      lines.push(`${k}:`)
      for (const item of v) lines.push(`  - ${yamlVal(item)}`)
    } else if (typeof v === "object") {
      lines.push(`${k}:`)
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        lines.push(`  ${yamlVal(k2)}: ${yamlVal(v2)}`)
      }
    } else {
      lines.push(`${k}: ${yamlVal(v)}`)
    }
  }
  lines.push("---", "")
  return lines.join("\n")
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | HTMLElement)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c))
    else e.appendChild(c as HTMLElement)
  }
  return e
}

// ── Field renderers ───────────────────────────────────────────────────────────

function renderToggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const wrap = el("label", { class: "fm-toggle", title: value ? "true" : "false" })
  const input = el("input", { type: "checkbox", class: "fm-toggle-input" }) as HTMLInputElement
  input.checked = value
  input.addEventListener("change", () => onChange(input.checked))
  const track = el("span", { class: "fm-toggle-track" })
  const thumb = el("span", { class: "fm-toggle-thumb" })
  track.appendChild(thumb)
  wrap.appendChild(input)
  wrap.appendChild(track)
  return wrap
}

function renderSegment(options: string[], value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = el("div", { class: "fm-segment", role: "radiogroup" })
  for (const opt of options) {
    const btn = el(
      "button",
      {
        class: `fm-segment-btn${value === opt ? " fm-segment-btn--active" : ""}`,
        type: "button",
      },
      opt,
    )
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".fm-segment-btn").forEach((b) => b.classList.remove("fm-segment-btn--active"))
      btn.classList.add("fm-segment-btn--active")
      onChange(opt)
    })
    wrap.appendChild(btn)
  }
  return wrap
}

function renderColor(value: string, onChange: (v: string) => void): HTMLElement {
  const wrap = el("div", { class: "fm-color-wrap" })

  // Color swatch button that opens native picker
  const swatch = el("span", { class: "fm-color-swatch" })
  swatch.style.background = value

  const picker = el("input", { type: "color", class: "fm-color-picker" }) as HTMLInputElement
  // Normalize to 6-digit hex for color input
  const hex6 = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888"
  picker.value = hex6

  const text = el("input", {
    type: "text",
    class: "fm-color-text",
    placeholder: "#rrggbb",
    value,
    spellcheck: "false",
  }) as HTMLInputElement

  picker.addEventListener("input", () => {
    swatch.style.background = picker.value
    text.value = picker.value
    onChange(picker.value)
  })

  text.addEventListener("change", () => {
    const v = text.value.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      swatch.style.background = v
      picker.value = v
      onChange(v)
    }
  })

  swatch.addEventListener("click", () => picker.click())

  wrap.appendChild(swatch)
  wrap.appendChild(picker)
  wrap.appendChild(text)
  return wrap
}

function renderModel(value: string, getModels: () => string[], onChange: (v: string) => void): HTMLElement {
  const wrap = el("div", { class: "fm-model-wrap" })
  const listId = `fm-models-${Math.random().toString(36).slice(2)}`
  const input = el("input", {
    type: "text",
    class: "fm-model-input",
    value,
    placeholder: "provider/model-id",
    list: listId,
    spellcheck: "false",
    autocomplete: "off",
  }) as HTMLInputElement

  const datalist = el("datalist", { id: listId })
  const models = getModels()
  for (const m of models) {
    const opt = el("option", { value: m })
    datalist.appendChild(opt)
  }

  input.addEventListener("change", () => onChange(input.value.trim()))

  wrap.appendChild(input)
  wrap.appendChild(datalist)
  return wrap
}

function renderTools(value: Record<string, boolean>, onChange: (v: Record<string, boolean>) => void): HTMLElement {
  const wrap = el("div", { class: "fm-tools" })
  const current = { ...value }

  function refresh() {
    wrap.innerHTML = ""
    for (const [tool, enabled] of Object.entries(current)) {
      const chip = el("span", { class: `fm-tool-chip${enabled ? " fm-tool-chip--on" : " fm-tool-chip--off"}` })
      const label = el("span", { class: "fm-tool-label" }, tool)
      const btn = el("button", { type: "button", class: "fm-tool-toggle", title: enabled ? "Disable" : "Enable" })
      btn.textContent = enabled ? "✓" : "✗"
      btn.addEventListener("click", () => {
        current[tool] = !current[tool]
        onChange({ ...current })
        refresh()
      })
      const del = el("button", { type: "button", class: "fm-tool-del", title: "Remove" }, "×")
      del.addEventListener("click", () => {
        delete current[tool]
        onChange({ ...current })
        refresh()
      })
      chip.appendChild(btn)
      chip.appendChild(label)
      chip.appendChild(del)
      wrap.appendChild(chip)
    }

    // Add new tool input
    const addWrap = el("span", { class: "fm-tool-add" })
    const addInput = el("input", {
      type: "text",
      placeholder: "tool-name",
      class: "fm-tool-input",
      spellcheck: "false",
    }) as HTMLInputElement
    const addBtn = el("button", { type: "button", class: "fm-tool-add-btn", title: "Add tool" }, "+")
    addBtn.addEventListener("click", () => {
      const name = addInput.value.trim()
      if (!name) return
      current[name] = true
      addInput.value = ""
      onChange({ ...current })
      refresh()
    })
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        addBtn.click()
      }
    })
    addWrap.appendChild(addInput)
    addWrap.appendChild(addBtn)
    wrap.appendChild(addWrap)
  }

  refresh()
  return wrap
}

function renderNumber(
  value: number,
  opts: { min?: number; max?: number; step?: number; isFloat?: boolean },
  onChange: (v: number) => void,
): HTMLElement {
  const wrap = el("div", { class: "fm-number-wrap" })
  const attrs: Record<string, string> = { type: "number", class: "fm-number-input", value: String(value) }
  if (opts.min !== undefined) attrs.min = String(opts.min)
  if (opts.max !== undefined) attrs.max = String(opts.max)
  if (opts.step !== undefined) attrs.step = String(opts.step)
  const input = el("input", attrs) as HTMLInputElement
  input.addEventListener("change", () => {
    const n = opts.isFloat ? parseFloat(input.value) : parseInt(input.value, 10)
    if (!isNaN(n)) onChange(n)
  })
  wrap.appendChild(input)
  return wrap
}

function renderText(value: string, onChange: (v: string) => void): HTMLElement {
  const input = el("input", { type: "text", class: "fm-text-input", value, spellcheck: "false" }) as HTMLInputElement
  input.addEventListener("change", () => onChange(input.value))
  return input
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderField(key: string, control: HTMLElement): HTMLElement {
  const field = el("div", { class: "fm-field" })
  const label = el("span", { class: "fm-field-key" }, key)
  const val = el("div", { class: "fm-field-val" })
  val.appendChild(control)
  field.appendChild(label)
  field.appendChild(val)
  return field
}

export function buildFrontmatterControls(
  meta: Record<string, unknown>,
  onChange: (newMeta: Record<string, unknown>) => void,
  getModels: () => string[],
): HTMLElement {
  const current = { ...meta }

  function emit() {
    onChange({ ...current })
  }

  const body = el("div", { "data-slot": "fm-body" })

  // Title header (if present)
  const title = typeof current.title === "string" ? current.title : undefined
  const desc = typeof current.description === "string" ? current.description : undefined

  if (title !== undefined || desc !== undefined) {
    const header = el("div", { "data-slot": "fm-header" })
    if (title !== undefined) {
      const h = el("div", { "data-slot": "fm-title" })
      const input = el("input", {
        type: "text",
        class: "fm-title-input",
        value: title,
        spellcheck: "false",
      }) as HTMLInputElement
      input.addEventListener("change", () => {
        current.title = input.value
        emit()
      })
      h.appendChild(input)
      header.appendChild(h)
    }
    if (desc !== undefined) {
      const d = el("div", { "data-slot": "fm-desc" })
      const input = el("input", {
        type: "text",
        class: "fm-desc-input",
        value: desc,
        spellcheck: "false",
      }) as HTMLInputElement
      input.addEventListener("change", () => {
        current.description = input.value
        emit()
      })
      d.appendChild(input)
      header.appendChild(d)
    }
    body.appendChild(header)
  }

  const grid = el("div", { "data-slot": "fm-grid" })

  // Known fields in display order
  const known = new Set([
    "title",
    "description",
    "mode",
    "hidden",
    "subtask",
    "model",
    "color",
    "tools",
    "temperature",
    "top_p",
    "steps",
  ])

  if (typeof current.mode === "string" || current.mode === undefined) {
    const v = (current.mode ?? "all") as string
    grid.appendChild(
      renderField(
        "mode",
        renderSegment(["subagent", "primary", "all"], v, (val) => {
          current.mode = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.hidden === "boolean" || current.hidden === undefined) {
    const v = current.hidden === true
    grid.appendChild(
      renderField(
        "hidden",
        renderToggle(v, (val) => {
          current.hidden = val
          emit()
        }),
      ),
    )
  }

  if (current.subtask !== undefined) {
    const v = current.subtask === true
    grid.appendChild(
      renderField(
        "subtask",
        renderToggle(v, (val) => {
          current.subtask = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.model === "string" || current.model === undefined) {
    const v = (current.model ?? "") as string
    grid.appendChild(
      renderField(
        "model",
        renderModel(v, getModels, (val) => {
          current.model = val || undefined
          emit()
        }),
      ),
    )
  }

  if (typeof current.color === "string" || current.color === undefined) {
    const v = (current.color ?? "#888888") as string
    grid.appendChild(
      renderField(
        "color",
        renderColor(v, (val) => {
          current.color = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.tools === "object" && current.tools !== null && !Array.isArray(current.tools)) {
    const v = current.tools as Record<string, boolean>
    grid.appendChild(
      renderField(
        "tools",
        renderTools(v, (val) => {
          current.tools = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.temperature === "number") {
    grid.appendChild(
      renderField(
        "temperature",
        renderNumber(current.temperature, { min: 0, max: 2, step: 0.05, isFloat: true }, (val) => {
          current.temperature = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.top_p === "number") {
    grid.appendChild(
      renderField(
        "top_p",
        renderNumber(current.top_p, { min: 0, max: 1, step: 0.05, isFloat: true }, (val) => {
          current.top_p = val
          emit()
        }),
      ),
    )
  }

  if (typeof current.steps === "number") {
    grid.appendChild(
      renderField(
        "steps",
        renderNumber(current.steps, { min: 1, step: 1 }, (val) => {
          current.steps = val
          emit()
        }),
      ),
    )
  }

  // Unknown / extra fields
  for (const [k, v] of Object.entries(current)) {
    if (known.has(k)) continue
    if (typeof v === "string") {
      grid.appendChild(
        renderField(
          k,
          renderText(v, (val) => {
            current[k] = val
            emit()
          }),
        ),
      )
    } else if (typeof v === "number") {
      grid.appendChild(
        renderField(
          k,
          renderNumber(v, { isFloat: true }, (val) => {
            current[k] = val
            emit()
          }),
        ),
      )
    } else if (typeof v === "boolean") {
      grid.appendChild(
        renderField(
          k,
          renderToggle(v, (val) => {
            current[k] = val
            emit()
          }),
        ),
      )
    }
  }

  body.appendChild(grid)
  return body
}

export function buildFrontmatterView(
  meta: Record<string, unknown>,
  onChange: (newMeta: Record<string, unknown>) => void,
  getModels: () => string[],
): HTMLElement {
  const details = el("details", { "data-component": "frontmatter", open: "" })
  const summary = el("summary", { "data-slot": "frontmatter-toggle" }, "Frontmatter")
  details.appendChild(summary)
  details.appendChild(buildFrontmatterControls(meta, onChange, getModels))
  return details
}

// ── Tiptap node view factory ──────────────────────────────────────────────────

export function createFrontmatterNodeView(opts: FrontmatterOptions) {
  return ({ node, editor, getPos }: NodeViewRendererProps) => {
    let current = node as Node
    const host = document.createElement("div")

    function dispatch(meta: Record<string, unknown>) {
      const raw = serializeFrontmatter(meta)
      const pos = typeof getPos === "function" ? getPos() : undefined
      if (pos == null) return
      const { tr } = (editor as Editor).view.state
      ;(editor as Editor).view.dispatch(tr.setNodeMarkup(pos, undefined, { ...current.attrs, raw, meta }))
    }

    function render(n: Node) {
      host.innerHTML = ""
      const meta = (n.attrs.meta ?? {}) as Record<string, unknown>
      host.appendChild(buildFrontmatterView(meta, dispatch, opts.getModels ?? (() => [])))
    }

    render(current)

    return {
      dom: host,
      update(updated: Node) {
        if (updated.type.name !== "frontmatter") return false
        current = updated
        render(updated)
        return true
      },
    }
  }
}

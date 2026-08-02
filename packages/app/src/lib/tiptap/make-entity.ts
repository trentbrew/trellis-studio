import { Extension } from "@tiptap/core"

export interface MakeEntityOptions {
  onCreate: (opts: { name: string; type: string }) => Promise<string | undefined>
}

function popover(opts: {
  rect: DOMRect | { left: number; top: number; bottom: number }
  initial: string
  onConfirm: (name: string, type: string) => void
  onCancel: () => void
}) {
  const existing = document.getElementById("make-entity-popover")
  existing?.remove()

  const el = document.createElement("div")
  el.id = "make-entity-popover"
  el.className = "make-entity-popover"
  el.setAttribute("role", "dialog")

  const row = document.createElement("div")
  row.className = "make-entity-row"

  const input = document.createElement("input")
  input.type = "text"
  input.placeholder = "Entity name"
  input.className = "make-entity-input"
  input.value = opts.initial
  input.spellcheck = false

  const typeSelect = document.createElement("select")
  typeSelect.className = "make-entity-type-select"
  for (const t of ["Thing", "Person", "Organization", "Project", "Concept", "Place", "Event"]) {
    const opt = document.createElement("option")
    opt.value = t
    opt.textContent = t
    typeSelect.appendChild(opt)
  }

  const hint = document.createElement("div")
  hint.className = "make-entity-hint"
  hint.textContent = "Enter to create · Esc to cancel"

  row.appendChild(input)
  row.appendChild(typeSelect)
  el.appendChild(row)
  el.appendChild(hint)

  const gap = 4
  const width = 380
  el.style.position = "fixed"
  el.style.zIndex = "9999"
  el.style.left = `${Math.min(opts.rect.left, window.innerWidth - width - 16)}px`
  const below = window.innerHeight - opts.rect.bottom - gap
  if (below > 80) {
    el.style.top = `${opts.rect.bottom + gap}px`
  } else {
    el.style.top = `${opts.rect.top - 80}px`
  }

  function close() {
    document.removeEventListener("mousedown", onOutside, true)
    el.remove()
  }

  function onOutside(e: MouseEvent) {
    if (e.target instanceof Node && el.contains(e.target)) return
    opts.onCancel()
    close()
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const name = input.value.trim()
      if (name) opts.onConfirm(name, typeSelect.value)
      close()
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      opts.onCancel()
      close()
    }
  })

  typeSelect.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault()
      opts.onCancel()
      close()
    }
  })

  document.addEventListener("mousedown", onOutside, true)
  document.body.appendChild(el)
  requestAnimationFrame(() => input.focus())
}

export const MakeEntity = Extension.create<MakeEntityOptions>({
  name: "makeEntity",

  addOptions() {
    return {
      onCreate: async () => undefined,
    }
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-e": () => {
        const editor = this.editor
        const { from, to, empty } = editor.state.selection
        const view = editor.view
        const startCoords = view.coordsAtPos(from)
        const endCoords = view.coordsAtPos(to)
        const rect = {
          left: Math.min(startCoords.left, endCoords.left),
          top: Math.min(startCoords.top, endCoords.top),
          bottom: Math.max(startCoords.bottom, endCoords.bottom),
        }

        const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ")

        popover({
          rect,
          initial: selectedText,
          onConfirm: async (name, type) => {
            const id = await this.options.onCreate({ name, type })
            if (!id) return
            editor
              .chain()
              .focus()
              .deleteRange({ from, to })
              .insertContent({ type: "mention", attrs: { type: "entity", id, label: name } })
              .run()
          },
          onCancel: () => editor.chain().focus().run(),
        })
        return true
      },
    }
  },
})

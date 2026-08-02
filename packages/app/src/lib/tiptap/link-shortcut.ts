import { Extension } from "@tiptap/core"

function popover(opts: {
  rect: DOMRect | { left: number; top: number; bottom: number }
  initial: string
  onSubmit: (value: string) => void
  onCancel?: () => void
}) {
  const existing = document.getElementById("link-shortcut-popover")
  existing?.remove()

  const el = document.createElement("div")
  el.id = "link-shortcut-popover"
  el.className = "link-shortcut-popover"
  el.setAttribute("role", "dialog")

  const input = document.createElement("input")
  input.type = "text"
  input.placeholder = "Paste URL or type path"
  input.className = "link-shortcut-input"
  input.value = opts.initial
  input.spellcheck = false

  el.appendChild(input)

  const gap = 4
  const width = 320
  el.style.position = "fixed"
  el.style.zIndex = "9999"
  el.style.left = `${Math.min(opts.rect.left, window.innerWidth - width - 16)}px`
  const below = window.innerHeight - opts.rect.bottom - gap
  if (below > 60) {
    el.style.top = `${opts.rect.bottom + gap}px`
  } else {
    el.style.top = `${opts.rect.top - 44}px`
  }

  function close() {
    document.removeEventListener("mousedown", onOutside, true)
    el.remove()
  }

  function onOutside(e: MouseEvent) {
    if (e.target instanceof Node && el.contains(e.target)) return
    opts.onCancel?.()
    close()
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      opts.onSubmit(input.value.trim())
      close()
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      opts.onCancel?.()
      close()
    }
  })

  document.addEventListener("mousedown", onOutside, true)
  document.body.appendChild(el)
  requestAnimationFrame(() => input.focus())
}

export const LinkShortcut = Extension.create({
  name: "linkShortcut",

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
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

        const existingHref = editor.getAttributes("link").href as string | undefined
        const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ")

        popover({
          rect,
          initial: existingHref ?? "",
          onSubmit: (value) => {
            if (!value) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
              return
            }
            if (empty) {
              const label = selectedText || value
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "text",
                  text: label,
                  marks: [{ type: "link", attrs: { href: value } }],
                })
                .run()
              return
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run()
          },
          onCancel: () => editor.chain().focus().run(),
        })
        return true
      },
    }
  },
})

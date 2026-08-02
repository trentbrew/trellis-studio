import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Slice, Fragment } from "@tiptap/pm/model"

const key = new PluginKey("dragHandle")

interface BlockInfo {
  node: PmNode
  pos: number
  dom: HTMLElement
}

function topBlock(view: EditorView, y: number): BlockInfo | null {
  const pos = view.posAtCoords({ left: view.dom.getBoundingClientRect().left + 1, top: y })
  if (!pos) return null
  const resolved = view.state.doc.resolve(pos.pos)
  // Walk up to find the top-level (depth 1) block
  let depth = resolved.depth
  while (depth > 1) depth--
  if (depth === 0) return null
  const start = resolved.before(depth)
  const node = resolved.node(depth)
  const dom = view.nodeDOM(start) as HTMLElement | null
  return dom ? { node, pos: start, dom } : null
}

function createHandle(): HTMLDivElement {
  const el = document.createElement("div")
  el.className = "drag-handle"
  el.setAttribute("draggable", "true")
  el.setAttribute("data-drag-handle", "")
  el.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="3" r="1.5"/><circle cx="10.5" cy="3" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="10.5" cy="8" r="1.5"/><circle cx="5.5" cy="13" r="1.5"/><circle cx="10.5" cy="13" r="1.5"/></svg>`
  return el
}

interface MenuItem {
  label: string
  icon: string
  action: (view: EditorView, pos: number, node: PmNode) => void
  divider?: boolean
}

function setBlock(view: EditorView, pos: number, node: PmNode, type: string, attrs?: Record<string, any>) {
  const target = view.state.schema.nodes[type]
  if (!target) return
  // For textblock nodes, setBlockType works on the content range
  if (node.isTextblock) {
    view.dispatch(view.state.tr.setBlockType(pos, pos + node.nodeSize, target, attrs))
  } else {
    // For wrapper nodes (lists etc), replace the whole node with a new block
    const text = node.textContent
    const block = target.create(attrs, text ? view.state.schema.text(text) : undefined)
    view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, block))
  }
}

const menuItems: MenuItem[] = [
  {
    label: "Paragraph",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 4v16M17 4v16M14 4H9.5a4.5 4.5 0 0 0 0 9H13"/></svg>`,
    action: (view, pos, node) => setBlock(view, pos, node, "paragraph"),
  },
  {
    label: "Heading 1",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 18V6M12 18V6M17 12l3-2v8"/></svg>`,
    action: (view, pos, node) => setBlock(view, pos, node, "heading", { level: 1 }),
  },
  {
    label: "Heading 2",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>`,
    action: (view, pos, node) => setBlock(view, pos, node, "heading", { level: 2 }),
  },
  {
    label: "Heading 3",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M17.5 17.5c1.7 1 3.5 0 3.5-1.5a2 2 0 0 0-2-2"/></svg>`,
    action: (view, pos, node) => setBlock(view, pos, node, "heading", { level: 3 }),
  },
  {
    label: "Duplicate",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    divider: true,
    action: (view, pos, node) => {
      view.dispatch(view.state.tr.insert(pos + node.nodeSize, node))
    },
  },
  {
    label: "Copy text",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    action: (_view, _pos, node) => {
      navigator.clipboard.writeText(node.textContent)
    },
  },
  {
    label: "Delete",
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    divider: true,
    action: (view, pos, node) => {
      view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize))
    },
  },
]

function createMenu(view: EditorView, block: BlockInfo, handle: HTMLDivElement): HTMLDivElement {
  const menu = document.createElement("div")
  menu.className = "drag-context-menu"

  menuItems.forEach((item) => {
    if (item.divider) {
      const hr = document.createElement("div")
      hr.className = "drag-context-divider"
      menu.appendChild(hr)
    }
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "drag-context-item"
    btn.innerHTML = `<span class="drag-context-icon">${item.icon}</span><span class="drag-context-label">${item.label}</span>`
    btn.addEventListener("mousedown", (e) => e.preventDefault())
    btn.addEventListener("click", () => {
      item.action(view, block.pos, block.node)
      menu.remove()
    })
    menu.appendChild(btn)
  })

  const rect = handle.getBoundingClientRect()
  menu.style.position = "fixed"
  menu.style.left = `${rect.left}px`
  menu.style.top = `${rect.bottom + 4}px`

  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect()
    if (mr.bottom > window.innerHeight - 8) {
      menu.style.top = ""
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`
    }
  })

  return menu
}

export const DragHandle = Extension.create({
  name: "dragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        view(editorView) {
          const handle = createHandle()
          let menu: HTMLDivElement | null = null
          let current: BlockInfo | null = null
          let timeout: ReturnType<typeof setTimeout> | null = null

          const dismiss = () => {
            menu?.remove()
            menu = null
          }

          const dismissOnClick = (e: MouseEvent) => {
            if (menu && !menu.contains(e.target as HTMLElement)) dismiss()
          }

          document.addEventListener("mousedown", dismissOnClick)

          const show = (block: BlockInfo) => {
            if (timeout) {
              clearTimeout(timeout)
              timeout = null
            }
            current = block
            const wrapper = editorView.dom.parentElement
            if (!wrapper) return
            const wrapperRect = wrapper.getBoundingClientRect()
            const blockRect = block.dom.getBoundingClientRect()
            handle.style.position = "absolute"
            handle.style.left = `-28px`
            handle.style.top = `${blockRect.top - wrapperRect.top + wrapper.scrollTop}px`
            handle.style.opacity = "1"
            handle.style.pointerEvents = "auto"

            if (!handle.parentElement) {
              wrapper.style.position = "relative"
              wrapper.appendChild(handle)
            }
          }

          const hide = () => {
            timeout = setTimeout(() => {
              handle.style.opacity = "0"
              handle.style.pointerEvents = "none"
              current = null
            }, 200)
          }

          handle.addEventListener("mouseenter", () => {
            if (timeout) {
              clearTimeout(timeout)
              timeout = null
            }
          })

          handle.addEventListener("mouseleave", () => {
            if (!menu) hide()
          })

          handle.addEventListener("click", (e) => {
            e.preventDefault()
            e.stopPropagation()
            dismiss()
            if (current) {
              menu = createMenu(editorView, current, handle)
              document.body.appendChild(menu)
            }
          })

          handle.addEventListener("dragstart", () => {
            dismiss()
            if (!current) return
            const { pos, node } = current
            try {
              const sel = NodeSelection.create(editorView.state.doc, pos)
              editorView.dispatch(editorView.state.tr.setSelection(sel))
              editorView.dragging = {
                slice: new Slice(Fragment.from(node), 0, 0),
                move: true,
              } as any
            } catch {
              // Some nodes can't be node-selected; ignore
            }
          })

          const mousemove = (e: MouseEvent) => {
            const block = topBlock(editorView, e.clientY)
            if (block) show(block)
            else if (!menu) hide()
          }

          editorView.dom.addEventListener("mousemove", mousemove)
          editorView.dom.addEventListener("mouseleave", () => {
            if (!menu) hide()
          })

          return {
            update() {},
            destroy() {
              handle.remove()
              dismiss()
              document.removeEventListener("mousedown", dismissOnClick)
              editorView.dom.removeEventListener("mousemove", mousemove)
            },
          }
        },
      }),
    ]
  },
})

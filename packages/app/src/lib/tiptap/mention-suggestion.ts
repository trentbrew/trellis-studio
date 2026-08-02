import { Extension } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion"
import { PluginKey } from "@tiptap/pm/state"

export interface MentionItem {
  type: "file" | "entity" | "symbol" | "agent" | "create"
  id: string
  label: string
  detail?: string
  icon?: string
}

export interface MentionSuggestionOptions {
  char: string
  search: (query: string) => Promise<MentionItem[]> | MentionItem[]
  onCreate?: (id: string) => Promise<string | undefined> | string | undefined
}

const GROUP_ORDER: Record<MentionItem["type"], number> = {
  agent: 0,
  entity: 1,
  symbol: 2,
  file: 3,
  create: 4,
}

const GROUP_LABEL: Record<MentionItem["type"], string> = {
  agent: "AGENTS",
  entity: "ENTITIES",
  symbol: "SYMBOLS",
  file: "FILES",
  create: "CREATE",
}

function iconFor(type: MentionItem["type"]) {
  if (type === "file") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
  }
  if (type === "agent") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 10v6m11-11h-6M7 12H1"/></svg>`
  }
  if (type === "create") {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
}

function position(el: HTMLDivElement, rect: DOMRect) {
  const gap = 4
  const height = el.offsetHeight || 300
  const below = window.innerHeight - rect.bottom - gap
  const above = rect.top - gap
  el.style.position = "fixed"
  el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
  if (below >= height || below >= above) {
    el.style.top = `${rect.bottom + gap}px`
    el.style.bottom = ""
  } else {
    el.style.bottom = `${window.innerHeight - rect.top + gap}px`
    el.style.top = ""
  }
}

function popup() {
  let el: HTMLDivElement | null = null
  let selected = 0
  let current: MentionItem[] = []
  let cmd: any = null

  function render() {
    if (!el) return
    el.innerHTML = ""
    if (current.length === 0) {
      const empty = document.createElement("div")
      empty.className = "mention-suggestion-empty"
      empty.textContent = "No results"
      el.appendChild(empty)
      return
    }
    let lastGroup: MentionItem["type"] | undefined
    current.forEach((item, idx) => {
      if (item.type !== lastGroup) {
        const header = document.createElement("div")
        header.className = "mention-suggestion-header"
        header.textContent = GROUP_LABEL[item.type] ?? item.type
        el!.appendChild(header)
        lastGroup = item.type
      }
      const row = document.createElement("button")
      row.type = "button"
      row.className = `mention-suggestion-item${idx === selected ? " is-selected" : ""}`

      const icon = document.createElement("span")
      icon.className = "mention-suggestion-icon"
      icon.innerHTML = iconFor(item.type)
      row.appendChild(icon)

      const text = document.createElement("span")
      text.className = "mention-suggestion-text"

      const name = document.createElement("span")
      name.className = "mention-suggestion-name"
      name.textContent = item.label
      text.appendChild(name)

      if (item.detail) {
        const detail = document.createElement("span")
        detail.className = "mention-suggestion-detail"
        detail.textContent = item.detail
        text.appendChild(detail)
      }

      row.appendChild(text)

      row.addEventListener("mouseenter", () => {
        selected = idx
        render()
      })
      row.addEventListener("mousedown", (e) => e.preventDefault())
      row.addEventListener("click", () => {
        cmd?.command({ id: item.id, type: item.type, label: item.label })
      })
      el!.appendChild(row)
    })
    const active = el.querySelector(".is-selected")
    if (active) active.scrollIntoView({ block: "nearest" })
  }

  return {
    onStart(props: SuggestionProps<MentionItem>) {
      cmd = props
      el = document.createElement("div")
      el.className = "mention-suggestion-menu"
      el.addEventListener("mousedown", (e) => e.preventDefault())
      current = props.items
      selected = 0
      render()
      const rect = props.clientRect?.()
      if (rect) position(el, rect)
      document.body.appendChild(el)
    },
    onUpdate(props: SuggestionProps<MentionItem>) {
      cmd = props
      current = props.items
      selected = Math.min(selected, current.length - 1)
      if (selected < 0) selected = 0
      render()
      const rect = props.clientRect?.()
      if (rect && el) position(el, rect)
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (event.key === "ArrowDown") {
        selected = (selected + 1) % Math.max(current.length, 1)
        render()
        return true
      }
      if (event.key === "ArrowUp") {
        selected = (selected - 1 + current.length) % Math.max(current.length, 1)
        render()
        return true
      }
      if (event.key === "Enter") {
        if (current[selected]) {
          cmd?.command({ id: current[selected].id, type: current[selected].type, label: current[selected].label })
        }
        return true
      }
      if (event.key === "Escape") {
        return true
      }
      return false
    },
    onExit() {
      el?.remove()
      el = null
    },
  }
}

export const MentionSuggestion = Extension.create<MentionSuggestionOptions>({
  name: "mentionSuggestion",

  addOptions() {
    return {
      char: "@",
      search: () => [],
    }
  },

  addProseMirrorPlugins() {
    const search = this.options.search
    const onCreate = this.options.onCreate
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("mentionSuggestion"),
        char: this.options.char,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.spec.code) return false
          }
          const marks = state.storedMarks ?? $from.marks()
          if (marks.some((m) => m.type.spec.code)) return false
          return true
        },
        items: async ({ query }) => {
          const results = await search(query)
          const sorted = results.slice().sort((a, b) => GROUP_ORDER[a.type] - GROUP_ORDER[b.type])
          return sorted.slice(0, 20)
        },
        command: async ({ editor, range, props }) => {
          const attrs = props as { id: string; type: MentionItem["type"]; label: string }
          if (attrs.type === "create") {
            editor.chain().focus().deleteRange(range).run()
            const created = await onCreate?.(attrs.id)
            if (!created) return
            const label = created.split("/").pop() || created
            editor
              .chain()
              .focus()
              .insertContent({ type: "mention", attrs: { type: "file", id: created, label } })
              .run()
            return
          }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: "mention", attrs: { type: attrs.type, id: attrs.id, label: attrs.label } })
            .run()
        },
        render: () => popup(),
      }),
    ]
  },
})

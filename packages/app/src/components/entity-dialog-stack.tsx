import { Dialog } from "@opencode-ai/ui/dialog"
import type { useDialog } from "@opencode-ai/ui/context/dialog"
import { batch, createEffect, For, type Accessor, type JSX, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"

const base = { w: 760, h: 620 }

export type EntityDialogMode = "view" | "edit" | "create"

export type EntityDialogEntry = {
  key: string
  id: string
  type: string
  mode: EntityDialogMode
  draft?: unknown
}

export type EntityDialogPush = Omit<EntityDialogEntry, "key" | "mode"> & {
  key?: string
  mode?: EntityDialogMode
}

export type EntityDialogSize = {
  w: number
  h: number
}

export type EntityDialogTransform = {
  scale: number
  offsetY: number
  brightness: number
  interactive: boolean
}

export type EntityDialogStackApi = {
  stack: () => EntityDialogEntry[]
  size: () => EntityDialogSize
  push: (entry: EntityDialogPush) => void
  pop: () => void
  clear: () => void
  reset: () => void
  setSize: (w: number, h: number) => void
  getTransform: (index: number) => EntityDialogTransform
}

type DialogApi = ReturnType<typeof useDialog>

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max))
}

export function createEntityDialogStack(input?: { base?: EntityDialogSize }) {
  const start = input?.base ?? base
  const [state, setState] = createStore({
    stack: [] as EntityDialogEntry[],
    size: start,
    open: false,
    closing: false,
  })

  const reset = () => {
    batch(() => {
      setState("open", false)
      setState("closing", false)
      setState("stack", [])
      setState("size", start)
    })
  }

  const api: EntityDialogStackApi = {
    stack: () => state.stack,
    size: () => state.size,
    push(entry) {
      setState("stack", (items) => {
        if (items[items.length - 1]?.id === entry.id) return items
        return [
          ...items,
          {
            ...entry,
            key: entry.key ?? `${entry.id}:${Date.now()}`,
            mode: entry.mode ?? "view",
          },
        ]
      })
    },
    pop() {
      if (state.stack.length <= 1) {
        setState("stack", [])
        return
      }
      setState("stack", state.stack.slice(0, -1))
    },
    clear() {
      setState("stack", [])
    },
    reset,
    setSize(w, h) {
      setState("size", {
        w: clamp(w, 560, Math.min(920, window.innerWidth - 96)),
        h: clamp(h, 420, Math.min(760, window.innerHeight - 120)),
      })
    },
    getTransform(index) {
      const depth = state.stack.length - 1 - index
      if (depth <= 0) return { scale: 1, offsetY: 16, brightness: 1, interactive: true }
      return {
        scale: Math.max(0.82, 1 - depth * 0.04),
        offsetY: depth * -28,
        brightness: Math.max(0.5, 1 - depth * 0.14),
        interactive: false,
      }
    },
  }

  const mount = (dialog: DialogApi, render: () => JSX.Element) => {
    createEffect(() => {
      if (state.stack.length > 0) {
        if (!state.open && !state.closing) {
          setState("open", true)
          dialog.show(render, reset)
        }
        return
      }
      if (state.open && !state.closing) {
        setState("closing", true)
        dialog.close()
      }
    })
  }

  return { api, mount }
}

export function EntityDialogStackHost(props: {
  stack: () => EntityDialogEntry[]
  render: (entry: EntityDialogEntry, index: Accessor<number>) => JSX.Element
}) {
  return (
    <Dialog size="x-large" transition class="!h-full !bg-transparent !shadow-none !overflow-visible">
      <div
        data-ui-region="overlay"
        data-ui-component="app.entity-dialog.stack"
        class="relative h-full w-full overflow-visible"
      >
        <For each={props.stack()}>{(entry, index) => props.render(entry, index)}</For>
      </div>
    </Dialog>
  )
}

export function EntityDialogStackCard(
  props: ParentProps<{
    index: number
    transform: EntityDialogTransform
    class?: string
  }>,
) {
  return (
    <div
      data-ui-component="app.entity-dialog.stack-card"
      data-stack-index={props.index}
      data-stack-interactive={props.transform.interactive ? "true" : "false"}
      class={`absolute inset-0 rounded-xl border border-border-weaker-base bg-surface-base shadow-xl flex flex-col overflow-hidden ${props.class ?? ""}`}
      style={{
        transform: `translateY(${props.transform.offsetY}px) scale(${props.transform.scale})`,
        "transform-origin": "center center",
        filter: `brightness(${props.transform.brightness})`,
        "pointer-events": props.transform.interactive ? "auto" : "none",
        transition: "transform 200ms ease, filter 200ms ease",
        "z-index": `${100 + props.index}`,
      }}
    >
      {props.children}
    </div>
  )
}

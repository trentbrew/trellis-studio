import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Terminal } from "@/components/terminal"
import { useLanguage } from "@/context/language"
import { useTerminal, type PaneNode } from "@/context/terminal"

interface PaneViewProps {
  node: PaneNode
  opened: boolean
  clearOnConnect?: boolean
  onConnect: (id: string) => void
  onCleanup: (pty: { id: string; [key: string]: unknown }) => void
  onConnectError: (id: string) => void
}

function PaneLeafView(props: PaneViewProps & { node: Extract<PaneNode, { type: "leaf" }> }): JSX.Element {
  const terminal = useTerminal()
  const language = useLanguage()
  const id = props.node.ptyId
  const all = terminal.all
  const focused = () => terminal.focusedPane() === id

  return (
    <Show when={all().find((pty) => pty.id === id)}>
      {(pty) => (
        <div
          id={`terminal-wrapper-${id}`}
          class="group/pane absolute inset-0"
          onClick={() => terminal.focusPane(id)}
        >
          <div
            class="absolute top-2 right-2 z-10 transition-opacity pointer-events-auto"
            classList={{
              "opacity-100": focused(),
              "opacity-0 group-hover/pane:opacity-100": !focused(),
            }}
          >
            <IconButton
              icon="close-small"
              variant="ghost"
              class="size-6 rounded-md bg-background-stronger/90 border border-border-weak-base shadow-sm"
              aria-label={language.t("command.terminal.pane.close")}
              onClick={(e) => {
                e.stopPropagation()
                terminal.unsplit(id)
              }}
            />
          </div>
          <Terminal
            pty={pty()}
            autoFocus={props.opened && terminal.focusedPane() === id}
            clearOnConnect={props.clearOnConnect}
            onConnect={() => props.onConnect(id)}
            onCleanup={props.onCleanup}
            onConnectError={() => props.onConnectError(id)}
          />
        </div>
      )}
    </Show>
  )
}

function PaneSplitView(props: PaneViewProps & { node: Extract<PaneNode, { type: "split" }> }): JSX.Element {
  const terminal = useTerminal()
  const isHorizontal = props.node.direction === "h"

  let containerRef: HTMLDivElement | undefined
  const [containerSize, setContainerSize] = createSignal(0)
  const [splitRatio, setSplitRatio] = createSignal(props.node.ratio)

  onMount(() => {
    if (!containerRef) return
    const getSize = () => (isHorizontal ? containerRef!.offsetWidth : containerRef!.offsetHeight)
    setContainerSize(getSize())
    const observer = new ResizeObserver(() => setContainerSize(getSize()))
    observer.observe(containerRef)
    onCleanup(() => observer.disconnect())
  })

  const aSize = () => Math.floor(containerSize() * splitRatio())

  const firstLeafId = (n: PaneNode): string => {
    if (n.type === "leaf") return n.ptyId
    return firstLeafId(n.a)
  }

  const handleDividerMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    const start = isHorizontal ? e.clientX : e.clientY
    const startRatio = splitRatio()
    const total = containerSize()
    const leafId = firstLeafId(props.node.a)

    document.body.style.userSelect = "none"

    const onMove = (move: MouseEvent) => {
      const pos = isHorizontal ? move.clientX : move.clientY
      const newRatio = Math.min(0.9, Math.max(0.1, startRatio + (pos - start) / total))
      setSplitRatio(newRatio)
      terminal.resizePane(leafId, newRatio)
    }

    const onUp = () => {
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  return (
    <div ref={containerRef} class={`flex ${isHorizontal ? "flex-row" : "flex-col"} size-full`}>
      <div
        class="relative overflow-hidden shrink-0"
        style={isHorizontal ? { width: `${aSize()}px` } : { height: `${aSize()}px` }}
      >
        <PaneView
          node={props.node.a}
          opened={props.opened}
          onConnect={props.onConnect}
          onCleanup={props.onCleanup}
          onConnectError={props.onConnectError}
        />
      </div>

      <div
        class={
          isHorizontal
            ? "w-px shrink-0 bg-border-weak-base hover:bg-border-base cursor-col-resize"
            : "h-px shrink-0 bg-border-weak-base hover:bg-border-base cursor-row-resize"
        }
        onMouseDown={handleDividerMouseDown}
      />

      <div class="relative overflow-hidden flex-1 min-w-0 min-h-0 rounded-md">
        <PaneView
          node={props.node.b}
          opened={props.opened}
          onConnect={props.onConnect}
          onCleanup={props.onCleanup}
          onConnectError={props.onConnectError}
        />
      </div>
    </div>
  )
}

export function PaneView(props: PaneViewProps): JSX.Element {
  return (
    <Show
      when={props.node.type === "split" ? (props.node as Extract<PaneNode, { type: "split" }>) : undefined}
      fallback={<PaneLeafView {...props} node={props.node as Extract<PaneNode, { type: "leaf" }>} />}
    >
      {(splitNode) => <PaneSplitView {...props} node={splitNode()} />}
    </Show>
  )
}

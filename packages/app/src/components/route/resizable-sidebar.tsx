import { Show, createSignal, splitProps, type JSX } from "solid-js"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { RouteSidebar, type RouteSidebarProps } from "./route-shell"
import {
  ResizableSidebarContext,
  useResizableSidebar,
  useResizableSidebarContext,
  type ResizableSidebarLayout as SidebarLayout,
} from "./resizable-sidebar-context"

export {
  ResizableSidebarToggle,
  useResizableSidebar,
  useResizableSidebarContext,
} from "./resizable-sidebar-context"

export function ResizableSidebarLayout(props: {
  id: string
  defaultWidth?: number
  min?: number
  max?: number
  disabled?: boolean
  children: JSX.Element
}) {
  const layout = useResizableSidebar(props.id, {
    defaultWidth: props.defaultWidth,
    min: props.min,
    max: props.max,
  })
  const [resizing, setResizing] = createSignal(false)

  return (
    <ResizableSidebarContext.Provider
      value={{
        layout,
        resizing,
        setResizing,
        disabled: () => props.disabled ?? false,
      }}
    >
      {props.children}
    </ResizableSidebarContext.Provider>
  )
}

export function ResizableSidebarPanel(props: {
  children: (layout: SidebarLayout) => JSX.Element
}) {
  const ctx = useResizableSidebarContext()
  if (!ctx) {
    throw new Error("ResizableSidebarPanel must be used within ResizableSidebarLayout")
  }

  if (ctx.disabled()) {
    return props.children({
      ...ctx.layout,
      width: () => ctx.layout.defaultWidth,
      slotWidth: () => ctx.layout.defaultWidth,
    })
  }

  return (
    <div
      class="resizable-sidebar-slot shrink-0 overflow-hidden relative h-full min-h-0"
      classList={{ "resizable-sidebar-slot--resizing": ctx.resizing() }}
      style={{ width: `${ctx.layout.slotWidth()}px` }}
      aria-hidden={ctx.layout.collapsed()}
    >
      <div
        class="resizable-sidebar-inner absolute top-0 left-0 bottom-0 h-full min-h-0"
        style={{
          width: `${ctx.layout.width()}px`,
          opacity: ctx.layout.collapsed() ? 0 : 1,
        }}
      >
        {props.children(ctx.layout)}
        <Show when={!ctx.layout.collapsed()}>
          <ResizeHandle
            class="resizable-sidebar-handle"
            direction="horizontal"
            size={ctx.layout.width()}
            min={ctx.layout.min}
            max={ctx.layout.max}
            collapseThreshold={ctx.layout.min - 24}
            onResizeStart={() => ctx.setResizing(true)}
            onResizeEnd={() => ctx.setResizing(false)}
            onResize={(next) => ctx.layout.setWidth(next)}
            onCollapse={() => ctx.layout.collapse()}
            onReset={() => ctx.layout.resetWidth()}
          />
        </Show>
      </div>
    </div>
  )
}

/** @deprecated Use ResizableSidebarLayout + ResizableSidebarPanel */
export function ResizableSidebar(props: {
  id: string
  defaultWidth?: number
  min?: number
  max?: number
  disabled?: boolean
  children: (layout: SidebarLayout) => JSX.Element
}) {
  return (
    <ResizableSidebarLayout
      id={props.id}
      defaultWidth={props.defaultWidth}
      min={props.min}
      max={props.max}
      disabled={props.disabled}
    >
      <ResizableSidebarPanel>{props.children}</ResizableSidebarPanel>
    </ResizableSidebarLayout>
  )
}

export type ResizableRouteSidebarProps = Omit<RouteSidebarProps, "width"> & {
  width?: number
}

export function ResizableRouteSidebar(props: ResizableRouteSidebarProps) {
  const [, rest] = splitProps(props, ["width"])

  return (
    <ResizableSidebarPanel>
      {(layout) => <RouteSidebar {...rest} width={layout.width()} />}
    </ResizableSidebarPanel>
  )
}

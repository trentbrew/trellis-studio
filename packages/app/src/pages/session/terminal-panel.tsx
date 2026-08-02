import { For, Show, createEffect, createMemo, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Tabs } from "@opencode-ai/ui/tabs"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"

import { PaneView, SortableTerminalTab, TerminalSplitMenu } from "@/components/session"
import { Terminal } from "@/components/terminal"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useTerminal } from "@/context/terminal"
import { terminalTabLabel } from "@/pages/session/terminal-label"
import { createSizing, focusTerminalById } from "@/pages/session/helpers"
import { isEditableTarget } from "@/lib/editable-target"
import { getTerminalHandoff, setTerminalHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { terminalProbe } from "@/testing/terminal"
import { statusMessage } from "@/utils/status-message"

export function TerminalPanel(props: { fullscreen?: boolean } = {}) {
  const delays = [120, 240]
  const layout = useLayout()
  const terminal = useTerminal()
  const language = useLanguage()
  const command = useCommand()
  const { params } = useSessionLayout()

  const opened = layout.terminal.opened
  const size = createSizing()
  const height = createMemo(() => layout.terminal.height())
  const close = () => layout.terminal.close()
  let root: HTMLDivElement | undefined

  const [store, setStore] = createStore({
    autoCreated: false,
    activeDraggable: undefined as string | undefined,
    view: typeof window === "undefined" ? 1000 : (window.visualViewport?.height ?? window.innerHeight),
  })

  const max = () => store.view * 0.6
  const pane = () => (props.fullscreen ? store.view : Math.min(height(), max()))

  onMount(() => {
    if (typeof window === "undefined") return

    const sync = () => setStore("view", window.visualViewport?.height ?? window.innerHeight)
    const port = window.visualViewport

    sync()
    window.addEventListener("resize", sync)
    port?.addEventListener("resize", sync)
    onCleanup(() => {
      window.removeEventListener("resize", sync)
      port?.removeEventListener("resize", sync)
    })
  })

  createEffect(() => {
    if (!opened()) {
      setStore("autoCreated", false)
      return
    }

    if (!terminal.ready() || terminal.all().length !== 0 || store.autoCreated) return
    terminal.new()
    setStore("autoCreated", true)
  })

  createEffect(
    on(
      () => terminal.all().length,
      (count, prevCount) => {
        if (prevCount === undefined || prevCount <= 0 || count !== 0) return
        if (!opened()) return
        close()
      },
    ),
  )

  const shouldAutoFocusTerminal = () => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return true
    if (active.closest('[data-component="prompt-input"]')) return false
    if (isEditableTarget(active) && !active.closest('[data-component="terminal"]')) return false
    return true
  }

  const focus = (id: string) => {
    if (!shouldAutoFocusTerminal()) return () => {}

    const probe = terminalProbe(id)
    probe.focus(delays.length + 1)
    focusTerminalById(id)

    const frame = requestAnimationFrame(() => {
      if (!shouldAutoFocusTerminal()) return
      probe.step()
      if (!opened()) return
      if (terminal.active() !== id) return
      focusTerminalById(id)
    })

    const timers = delays.map((ms) =>
      window.setTimeout(() => {
        if (!shouldAutoFocusTerminal()) return
        probe.step()
        if (!opened()) return
        if (terminal.active() !== id) return
        focusTerminalById(id)
      }, ms),
    )

    return () => {
      probe.focus(0)
      cancelAnimationFrame(frame)
      for (const timer of timers) clearTimeout(timer)
    }
  }

  createEffect(
    on(
      () => [opened(), tabValue()] as const,
      ([next, id]) => {
        if (!next || !id) return
        const stop = focus(id)
        onCleanup(stop)
      },
    ),
  )

  createEffect(() => {
    if (opened()) return
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return
    if (!root?.contains(active)) return
    active.blur()
  })

  createEffect(() => {
    const dir = params.dir
    if (!dir) return
    if (!terminal.ready()) return
    language.locale()

    setTerminalHandoff(
      dir,
      terminal.all().map((pty) =>
        terminalTabLabel({
          title: pty.title,
          titleNumber: pty.titleNumber,
          t: language.t as (key: string, vars?: Record<string, string | number | boolean>) => string,
        }),
      ),
    )
  })

  const handoff = createMemo(() => {
    const dir = params.dir
    if (!dir) return []
    return getTerminalHandoff(dir) ?? []
  })

  const all = terminal.all
  const ids = createMemo(() => all().map((pty) => pty.id))
  const tabValue = createMemo(() => terminal.focusedPane() ?? terminal.active())
  const selectTab = (id: string) => {
    terminal.open(id)
    terminal.focusPane(id)
  }

  const handleTerminalDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleTerminalDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const terminals = terminal.all()
    const fromIndex = terminals.findIndex((t) => t.id === draggable.id.toString())
    const toIndex = terminals.findIndex((t) => t.id === droppable.id.toString())
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      terminal.move(draggable.id.toString(), toIndex)
    }
  }

  const handleTerminalDragEnd = () => {
    setStore("activeDraggable", undefined)

    const activeId = terminal.active()
    if (!activeId) return
    requestAnimationFrame(() => {
      if (terminal.active() !== activeId) return
      focusTerminalById(activeId)
    })
  }

  return (
    <div
      class="rounded-xl flex flex-col"
      classList={{
        "h-full min-h-0 pt-0": props.fullscreen,
        "pt-3 pb-0": !props.fullscreen && opened(),
        "pt-0": !props.fullscreen && !opened(),
      }}
    >
      {/* When collapsed (and not in fullscreen/mobile), hide the tab bar entirely so the
          affordance rail can sit flush at the bottom. Reopen via the icon rail terminal
          control or the terminal.toggle keybind. */}
      <Show when={props.fullscreen || opened()}>
        <div
          class="flex flex-col overflow-hidden rounded-xl border border-border-weak-base bg-panel"
          classList={{ "shrink-0": !props.fullscreen, "flex-1 min-h-0": props.fullscreen }}
        >
      <div
        id="terminal-tab-bar"
        class="shrink-0 flex items-center bg-panel border-b border-border-weak-base overflow-hidden"
      >
        <Show
          when={terminal.ready()}
          fallback={
            <div class="h-10 flex items-center gap-2 px-2 flex-1 overflow-hidden pointer-events-none">
              <For each={handoff()}>
                {(title) => (
                  <div class="px-2 py-1 rounded-md bg-surface-base text-14-regular text-text-weak truncate max-w-40">
                    {title}
                  </div>
                )}
              </For>
              <div class="flex-1" />
              <div class="text-text-weak pr-2">
                {language.t("common.loading")}
                {language.t("common.loading.ellipsis")}
              </div>
            </div>
          }
        >
          <DragDropProvider
            onDragStart={handleTerminalDragStart}
            onDragEnd={handleTerminalDragEnd}
            onDragOver={handleTerminalDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragYAxis />
            <Tabs value={tabValue()} onChange={selectTab} class="!h-10 flex-1 min-w-0">
              <Tabs.List class="h-10 px-0! gap-0!">
                <SortableProvider ids={ids()}>
                  <For each={all()}>{(pty) => <SortableTerminalTab terminal={pty} onClose={close} />}</For>
                </SortableProvider>
                <div class="h-full flex items-center justify-center">
                  <Show when={terminal.all().length === 0}>
                    <span class="text-text-weak text-[12px] pl-2 pr-1">New terminal</span>
                  </Show>
                  <TooltipKeybind
                    title={language.t("command.terminal.new")}
                    keybind={command.keybind("terminal.new")}
                    class="flex items-center"
                  >
                    <IconButton
                      icon="plus-small"
                      variant="ghost"
                      iconSize="large"
                      onClick={terminal.new}
                      aria-label={language.t("command.terminal.new")}
                    />
                  </TooltipKeybind>
                </div>
              </Tabs.List>
            </Tabs>
            <DragOverlay>
              <Show when={store.activeDraggable} keyed>
                {(id) => (
                  <Show when={all().find((pty) => pty.id === id)}>
                    {(t) => (
                      <div class="relative p-1 h-10 flex items-center bg-panel text-14-regular">
                        {terminalTabLabel({
                          title: t().title,
                          titleNumber: t().titleNumber,
                          t: language.t as (key: string, vars?: Record<string, string | number | boolean>) => string,
                        })}
                      </div>
                    )}
                  </Show>
                )}
              </Show>
            </DragOverlay>
          </DragDropProvider>
        </Show>

        {/* Status message */}
        <Show when={statusMessage()}>
          <div class="flex-1 min-w-0 flex items-center px-2">
            <span class="text-12-regular text-text-weak truncate">{statusMessage()}</span>
          </div>
        </Show>

        <div class="flex items-center shrink-0">
          <TerminalSplitMenu />
        </div>

        {/* Terminal toggle */}
        <TooltipKeybind
          title={language.t("command.terminal.toggle")}
          keybind={command.keybind("terminal.toggle")}
          placement="top"
          class="flex items-center shrink-0 px-2 mr-2"
        >
          <IconButton
            icon={opened() ? "chevron-down" : "chevron-up"}
            variant="ghost"
            onClick={() => layout.terminal.toggle()}
            aria-label={language.t("command.terminal.toggle")}
            aria-expanded={opened()}
            aria-controls="terminal-panel"
          />
        </TooltipKeybind>
      </div>

      {/* Terminal content area — collapses/expands */}
      <div
        ref={root}
        id="terminal-panel"
        role="region"
        aria-label={language.t("terminal.title")}
        aria-hidden={!opened()}
        inert={!opened()}
        class="relative w-full bg-panel overflow-hidden"
        classList={{
          "flex-1 min-h-0": props.fullscreen,
          "shrink-0": !props.fullscreen,
          "transition-[height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] motion-reduce:transition-none":
            !size.active() && !props.fullscreen,
        }}
        style={{ height: props.fullscreen ? "auto" : opened() ? `${pane()}px` : "0px" }}
      >
        <div
          class="absolute inset-0 flex flex-col"
          classList={{
            "pointer-events-none": !opened(),
          }}
        >
          <div class="hidden md:block" onPointerDown={() => size.start()}>
            <ResizeHandle
              direction="vertical"
              size={pane()}
              min={100}
              max={max()}
              collapseThreshold={50}
              onResize={(next) => {
                size.touch()
                layout.terminal.resize(next)
              }}
              onCollapse={close}
            />
          </div>
          <Show
            when={terminal.ready()}
            fallback={
              <div class="flex-1 flex items-center justify-center text-text-weak">{language.t("terminal.loading")}</div>
            }
          >
            <div class="flex-1 min-h-0 relative p-3">
              <Show
                when={terminal.paneTree()}
                fallback={
                  <Show when={terminal.active()} keyed>
                    {(id) => {
                      const ops = terminal.bind()
                      return (
                        <Show when={all().find((pty) => pty.id === id)}>
                          {(pty) => (
                            <div id={`terminal-wrapper-${id}`} class="absolute inset-0">
                              <Terminal
                                pty={pty()}
                                autoFocus={opened()}
                                clearOnConnect
                                onConnect={() => ops.trim(id)}
                                onCleanup={ops.update}
                                onConnectError={() => ops.clone(id)}
                              />
                            </div>
                          )}
                        </Show>
                      )
                    }}
                  </Show>
                }
              >
                {(tree) => {
                  const ops = terminal.bind()
                  return (
                    <div class="absolute inset-0">
                      <PaneView
                        node={tree()}
                        opened={opened()}
                        clearOnConnect
                        onConnect={(id) => ops.trim(id)}
                        onCleanup={ops.update}
                        onConnectError={(id) => ops.clone(id)}
                      />
                    </div>
                  )
                }}
              </Show>
            </div>
          </Show>
        </div>
      </div>
        </div>
      </Show>
    </div>
  )
}

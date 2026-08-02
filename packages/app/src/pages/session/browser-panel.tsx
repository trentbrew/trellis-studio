import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { usePreview, type ConsoleEntry } from "@/context/preview"
import { Persist, persisted } from "@/utils/persist"
import { useSDK } from "@/context/sdk"
import { clean, frame, title } from "@/lib/preview-url"
import { isEditableTarget } from "@/lib/editable-target"
import { PreviewPublishControl } from "@/components/preview-publish-control"
import { ConsolePanel } from "./preview-panel"
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Terminal as TerminalIcon,
} from "lucide-solid"
import { batch, createEffect, createMemo, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"

type Viewport = "mobile" | "tablet" | "desktop"

const MAX_LOGS = 500

const make = (id: string, value = "") => {
  const url = clean(value)
  return {
    id,
    input: url,
    title: title(url),
    name: undefined as string | undefined,
    url,
    stack: url ? [url] : [],
    idx: url ? 0 : -1,
  }
}

const trail = (tab: { stack?: string[]; idx?: number; url?: string }) => {
  const list = Array.isArray(tab.stack)
    ? tab.stack.filter((item): item is string => typeof item === "string" && item.length > 0)
    : tab.url
      ? [tab.url]
      : []
  const idx = !list.length
    ? -1
    : typeof tab.idx === "number"
      ? Math.min(Math.max(tab.idx, 0), list.length - 1)
      : list.length - 1
  return { list, idx }
}

const visit = (tab: ReturnType<typeof make>, url: string, name?: string) => {
  const href = clean(url)
  const next = trail(tab)
  const list = next.list.slice(0, next.idx + 1)
  if (list[list.length - 1] !== href) list.push(href)
  return {
    ...tab,
    input: href,
    title: name ?? tab.name ?? title(href),
    name: name ?? tab.name,
    url: href,
    stack: list,
    idx: list.length - 1,
  }
}

const move = (tab: ReturnType<typeof make>, idx: number) => {
  const next = trail(tab)
  const url = next.list[idx] ?? ""
  return {
    ...tab,
    input: url,
    title: tab.name ?? title(url),
    url,
    stack: next.list,
    idx,
  }
}

const viewport = (mode: Viewport) => {
  if (mode === "mobile") return "preview-web--mobile"
  if (mode === "tablet") return "preview-web--tablet"
  return "preview-web--desktop"
}

export function BrowserPanel() {
  const sdk = useSDK()
  const preview = usePreview()
  const [store, setStore] = persisted(
    Persist.workspace(sdk.directory, "browser"),
    createStore({
      active: "1",
      next: 2,
      tabs: [make("1")],
    }),
  )

  const active = createMemo(() => store.tabs.find((tab) => tab.id === store.active) ?? store.tabs[0])
  const activeId = createMemo(() => active()?.id)
  const tabUrl = createMemo(() => active()?.url)
  const [viewStore, setView] = persisted(
    Persist.global("preview-viewport", ["preview-viewport.v1"]),
    createStore({ mode: "desktop" as Viewport }),
  )
  const [drawer, setDrawer] = createStore({
    show: false,
    logs: [] as ConsoleEntry[],
    next: 0,
  })
  const nav = createMemo(() => {
    const tab = active()
    if (!tab) return { list: [], idx: -1 }
    return trail(tab)
  })
  const source = createMemo(() => {
    const href = tabUrl()
    if (!href) return href
    return frame(href, sdk.url, sdk.directory)
  })
  const [load, setLoad] = createStore({
    pending: false,
    error: "",
  })

  createEffect(() => {
    const src = source()
    if (!src) {
      setLoad({ pending: false, error: "" })
      return
    }
    let cancelled = false
    setLoad({ pending: true, error: "" })
    void (async () => {
      try {
        const res = await sdk.fetch(src, { method: "GET" })
        if (cancelled) return
        const ct = res.headers.get("content-type") ?? ""
        if (!res.ok) {
          let detail: string | undefined
          if (ct.includes("json")) {
            try {
              detail = (JSON.parse(await res.text()) as { error?: string }).error
            } catch {}
          }
          setLoad({
            pending: false,
            error: detail ?? `Browse proxy failed (${res.status})`,
          })
          return
        }
        if (ct.includes("json")) {
          let detail: string | undefined
          try {
            detail = (JSON.parse(await res.text()) as { error?: string }).error
          } catch {}
          setLoad({
            pending: false,
            error: detail ?? "Browse proxy returned JSON instead of a web page",
          })
          return
        }
        setLoad({ pending: false, error: "" })
      } catch {
        if (!cancelled) setLoad({ pending: false, error: "Could not reach the browse proxy" })
      }
    })()
    onCleanup(() => {
      cancelled = true
    })
  })

  const handler = (event: MessageEvent) => {
    if (event.data?.source === "oc-browse") {
      const href = typeof event.data.url === "string" ? clean(event.data.url) : ""
      const id = activeId()
      if (!href || !id) return
      setStore("tabs", (tabs) =>
        tabs.map((item) => (item.id === id ? visit(item as ReturnType<typeof make>, href) : item)),
      )
      return
    }
    if (event.data?.source !== "oc-console") return
    const data = event.data as { level?: unknown; args?: unknown; timestamp?: unknown; url?: unknown }
    const entry: ConsoleEntry = {
      id: drawer.next,
      level: typeof data.level === "string" ? data.level : "log",
      args: Array.isArray(data.args) ? data.args.map(String) : [],
      timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      url: typeof data.url === "string" ? data.url : active()?.url,
      name: active()?.name,
    }
    preview.console.capture({
      level: entry.level,
      args: entry.args,
      timestamp: entry.timestamp,
      url: entry.url,
      name: entry.name,
    })
    setDrawer("logs", (prev) => (prev.length >= MAX_LOGS ? [...prev.slice(1), entry] : [...prev, entry]))
    setDrawer("next", drawer.next + 1)
  }
  window.addEventListener("message", handler)
  onCleanup(() => window.removeEventListener("message", handler))

  createEffect(
    on(activeId, () => {
      setDrawer("logs", [])
      setDrawer("next", 0)
    }),
  )

  createEffect(() => {
    if (store.tabs.length > 0) {
      if (!store.tabs.some((tab) => tab.id === store.active)) {
        setStore("active", store.tabs[0]!.id)
      }
      return
    }

    const id = `${store.next}`
    batch(() => {
      setStore("next", store.next + 1)
      setStore("tabs", [make(id)])
      setStore("active", id)
    })
  })

  createEffect(
    on(
      () => preview.target()?.id,
      () => {
        const next = preview.target()
        const href = clean(next?.url ?? "")
        if (!href) return
        const found = store.tabs.find((tab) => (next?.name && tab.name === next.name) || tab.url === href)
        if (!found) {
          const id = `${store.next}`
          batch(() => {
            setStore("next", store.next + 1)
            setStore("tabs", (tabs) => [
              ...tabs,
              visit({ ...make(id), title: next?.name ?? "New Tab" }, href, next?.name),
            ])
            setStore("active", id)
          })
          return
        }

        batch(() => {
          setStore("active", found.id)
          setStore("tabs", (tabs) =>
            tabs.map((tab) => (tab.id === found.id ? visit(tab as ReturnType<typeof make>, href, next?.name) : tab)),
          )
        })
      },
    ),
  )

  const add = (value = "", name?: string) => {
    const id = `${store.next}`
    const url = clean(value)
    batch(() => {
      setStore("next", store.next + 1)
      setStore("tabs", (tabs) => [
        ...tabs,
        url ? visit({ ...make(id, value), title: name ?? title(url) }, url, name) : make(id),
      ])
      setStore("active", id)
    })
  }

  const pick = (id: string) => {
    setStore("active", id)
  }

  const input = (id: string, value: string) => {
    setStore("tabs", (tabs) =>
      tabs.map((tab) => (tab.id === id ? { ...tab, input: value, title: value.trim() ? tab.title : "New Tab" } : tab)),
    )
  }

  const isGitHubUrl = (url: string) => {
    try {
      const parsed = new URL(url)
      return parsed.hostname === "github.com" || parsed.hostname.endsWith(".github.com")
    } catch {
      return false
    }
  }

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const go = (id: string) => {
    const tab = store.tabs.find((item) => item.id === id)
    if (!tab) return
    const url = clean(tab.input)
    if (!url) return

    if (isGitHubUrl(url)) {
      openExternal(url)
      return
    }

    setStore("tabs", (tabs) =>
      tabs.map((item) => (item.id === id ? visit(item as ReturnType<typeof make>, url) : item)),
    )
  }

  const close = (id: string) => {
    const idx = store.tabs.findIndex((tab) => tab.id === id)
    if (idx === -1) return
    if (store.tabs.length === 1) {
      setStore("tabs", [make(id)])
      return
    }

    const next = store.tabs[idx - 1] ?? store.tabs[idx + 1]
    batch(() => {
      setStore("tabs", (tabs) => tabs.filter((tab) => tab.id !== id))
      if (store.active === id && next) setStore("active", next.id)
    })
  }

  const refresh = () => {
    const tab = active()
    if (!tab?.url) return
    setStore("tabs", (tabs) => tabs.map((item) => (item.id === tab.id ? { ...item, url: `${tab.url}` } : item)))
    const el = document.getElementById(`browser-frame-${tab.id}`) as HTMLIFrameElement | null
    if (el) el.src = source() ?? tab.url
  }

  const back = () => {
    const tab = active()
    const next = nav()
    if (!tab || next.idx < 1) return
    setStore("tabs", (tabs) =>
      tabs.map((item) => (item.id === tab.id ? move(item as ReturnType<typeof make>, next.idx - 1) : item)),
    )
  }

  const forward = () => {
    const tab = active()
    const next = nav()
    if (!tab || next.idx < 0 || next.idx >= next.list.length - 1) return
    setStore("tabs", (tabs) =>
      tabs.map((item) => (item.id === tab.id ? move(item as ReturnType<typeof make>, next.idx + 1) : item)),
    )
  }

  const [focused, setFocused] = createStore({ hasFocus: false })

  const grab = (id: string) => {
    setFocused("hasFocus", true)
    try {
      const el = document.getElementById(`browser-frame-${id}`) as HTMLIFrameElement | null
      el?.contentWindow?.focus()
    } catch {}
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!focused.hasFocus) return
    if (isEditableTarget(document.activeElement)) return

    // Always prevent these keys from reaching the parent when focused
    const captiveKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab", "Enter", "Backspace", "Escape"]
    const captive = captiveKeys.includes(e.key)
    if (captive) {
      // Don't prevent Enter if we're in the location bar (though focus logic should handle that)
      if (e.key === "Enter" && document.activeElement?.tagName === "INPUT") return
    }

    try {
      const tab = active()
      if (!tab) {
        if (captive) e.preventDefault()
        return
      }
      const el = document.getElementById(`browser-frame-${tab.id}`) as HTMLIFrameElement | null
      const win = el?.contentWindow
      if (!win) {
        if (captive) e.preventDefault()
        return
      }

      const doc = win.document
      if (!doc) {
        if (captive) e.preventDefault()
        return
      }

      const event = new KeyboardEvent(e.type, {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
        bubbles: true,
        cancelable: true,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      })
      doc.dispatchEvent(event)

      // If we managed to dispatch, and it was a captive key, prevent default on parent
      if (captive) e.preventDefault()
    } catch {
      // If cross-origin prevented dispatch, we still want to prevent default on parent
      // for these keys to keep them "captive" to the iframe area
      if (captive) e.preventDefault()
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    const container = document.getElementById("browser-content")
    if (container?.contains(e.target as Node)) {
      setFocused("hasFocus", true)
    } else {
      const el = document.activeElement
      if (el?.tagName !== "IFRAME") {
        setFocused("hasFocus", false)
      }
    }
  }

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown, true)
    window.removeEventListener("mousedown", handleMouseDown)
  })

  createEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("mousedown", handleMouseDown)
  })

  return (
    <div class="h-full min-h-0 flex flex-col bg-background-base">
      <div class="shrink-0 flex items-center gap-2 px-3 pt-3 pb-2 border-b border-border-weaker-base">
        <div class="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
          <For each={store.tabs}>
            {(tab) => (
              <button
                class="shrink-0 h-8 max-w-52 px-3 rounded-lg border flex items-center gap-2 transition-colors"
                classList={{
                  "border-border-weak-base bg-surface-raised-base text-text-strong": store.active === tab.id,
                  "border-border-weaker-base bg-background-base text-text-weak hover:text-text-base hover:bg-surface-raised-base/40":
                    store.active !== tab.id,
                }}
                onClick={() => pick(tab.id)}
              >
                <Globe class="size-3.5 shrink-0" />
                <span class="truncate text-12-regular">{tab.title}</span>
                <span
                  class="size-5 shrink-0 rounded-md flex items-center justify-center text-text-weaker hover:text-text-base hover:bg-surface-raised-base/60"
                  onClick={(event) => {
                    event.stopPropagation()
                    close(tab.id)
                  }}
                >
                  ×
                </span>
              </button>
            )}
          </For>
        </div>
        <IconButton
          icon="plus-small"
          variant="ghost"
          class="!rounded-md shrink-0"
          onClick={() => add()}
          aria-label="New tab"
        />
      </div>

      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base bg-surface-raised-base/20">
        <button
          class="size-8 shrink-0 rounded-md border border-border-weaker-base flex items-center justify-center text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={back}
          title="Back"
          disabled={nav().idx < 1}
        >
          <ChevronLeft class="size-4" />
        </button>
        <button
          class="size-8 shrink-0 rounded-md border border-border-weaker-base flex items-center justify-center text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={forward}
          title="Forward"
          disabled={nav().idx < 0 || nav().idx >= nav().list.length - 1}
        >
          <ChevronRight class="size-4" />
        </button>
        <PreviewPublishControl visible={() => Boolean(tabUrl())} />
        <button
          class="size-8 shrink-0 rounded-md border border-border-weaker-base flex items-center justify-center text-text-weak hover:text-text-base hover:bg-surface-raised-base/40"
          onClick={refresh}
          title="Refresh"
        >
          <RefreshCw class="size-4" />
        </button>
        <div class="min-w-0 flex-1 h-9 rounded-lg border border-border-weaker-base bg-background-base flex items-center gap-2 px-3">
          <Globe class="size-4 shrink-0 text-text-weaker" />
          <input
            class="flex-1 bg-transparent outline-none text-13-regular text-text-base placeholder:text-text-weaker"
            value={active()?.input ?? ""}
            onInput={(event) => {
              const id = activeId()
              if (!id) return
              input(id, event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              const id = activeId()
              if (!id) return
              go(id)
            }}
            placeholder="Enter a URL"
            spellcheck={false}
          />
          <Show when={active()?.input && isGitHubUrl(active()?.input)}>
            <div
              class="shrink-0 text-xs text-text-weaker bg-surface-raised-base/60 px-2 py-1 rounded"
              title="GitHub links open externally"
            >
              Opens externally
            </div>
          </Show>
        </div>
        <Button
          variant="secondary"
          size="small"
          class="shrink-0"
          onClick={() => {
            const id = activeId()
            if (!id) return
            go(id)
          }}
        >
          Go
        </Button>
        <Show when={tabUrl()}>
          <div class="preview-viewport-toggle shrink-0">
            <button
              class={`preview-viewport-btn ${viewStore.mode === "mobile" ? "preview-viewport-btn--active" : ""}`}
              onClick={() => setView("mode", "mobile")}
              title="Mobile (375px)"
            >
              <Smartphone class="size-3.5" />
            </button>
            <button
              class={`preview-viewport-btn ${viewStore.mode === "tablet" ? "preview-viewport-btn--active" : ""}`}
              onClick={() => setView("mode", "tablet")}
              title="Tablet (768px)"
            >
              <Tablet class="size-3.5" />
            </button>
            <button
              class={`preview-viewport-btn ${viewStore.mode === "desktop" ? "preview-viewport-btn--active" : ""}`}
              onClick={() => setView("mode", "desktop")}
              title="Desktop"
            >
              <Monitor class="size-3.5" />
            </button>
          </div>
          <button
            class="size-8 shrink-0 rounded-md border border-border-weaker-base flex items-center justify-center text-text-weak hover:text-text-base hover:bg-surface-raised-base/40 relative"
            classList={{ "preview-action-btn--active": drawer.show }}
            onClick={() => setDrawer("show", !drawer.show)}
            title="Toggle console"
          >
            <TerminalIcon class="size-4" />
            <Show when={drawer.logs.length > 0}>
              <span class="preview-console-badge-count absolute -top-1 -right-1">{drawer.logs.length}</span>
            </Show>
          </button>
        </Show>
      </div>

      <div id="browser-content" class="flex-1 min-h-0 overflow-hidden bg-surface-raised-base/20 flex flex-col">
        <Show
          when={active()}
          fallback={
            <div class="h-full flex items-center justify-center text-13-regular text-text-weaker">No tab selected</div>
          }
        >
          {(tab) => (
            <Show
              when={source()}
              fallback={
                <div class="h-full flex flex-col items-center justify-center gap-3 text-center text-text-weaker px-6">
                  <Globe class="size-10 opacity-20" />
                  <div class="text-14-medium text-text-strong">Open a page</div>
                  <div class="text-13-regular max-w-md">
                    Enter a URL in the location bar above. External pages load through Studio's browse proxy; GitHub
                    links still open in your system browser.
                  </div>
                </div>
              }
            >
              {(src) => (
                <div class="preview-web-wrap flex-1 flex flex-col min-h-0">
                  <Show
                    when={!load.error}
                    fallback={
                      <div class="h-full flex flex-col items-center justify-center gap-3 text-center text-text-weaker px-6">
                        <Globe class="size-10 opacity-20" />
                        <div class="text-14-medium text-text-strong">Could not load page</div>
                        <div class="text-13-regular max-w-md text-text-weak">{load.error}</div>
                        <div class="text-12-regular max-w-md text-text-weaker">
                          External pages load through Studio's browse proxy. If this keeps happening, restart the
                          backend (`bun run --hot --conditions=browser ./src/index.ts serve --port 4096`).
                        </div>
                        <button
                          class="preview-stopped-btn"
                          onClick={() => {
                            setLoad("error", "")
                            refresh()
                          }}
                        >
                          <RefreshCw class="size-4" />
                          Retry
                        </button>
                      </div>
                    }
                  >
                    <Show
                      when={!load.pending}
                      fallback={
                        <div class="h-full flex items-center justify-center text-13-regular text-text-weaker">
                          Loading preview…
                        </div>
                      }
                    >
                      <div
                        class={`preview-web ${viewport(viewStore.mode)} flex-1 flex flex-col min-h-0`}
                        onClick={() => grab(tab().id)}
                        classList={{ "preview-web--focused": focused.hasFocus }}
                      >
                        <iframe
                          id={`browser-frame-${tab().id}`}
                          src={src()}
                          class="preview-web-frame flex-1 w-full h-full border-none"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                          allow="accelerometer; gyroscope; magnetometer; clipboard-read; clipboard-write; display-capture"
                          onLoad={() => grab(tab().id)}
                        />
                      </div>
                    </Show>
                  </Show>
                  <ConsolePanel
                    logs={drawer.logs}
                    onClear={() => setDrawer("logs", [])}
                    collapsed={!drawer.show}
                    onToggle={() => setDrawer("show", !drawer.show)}
                  />
                </div>
              )}
            </Show>
          )}
        </Show>
      </div>
    </div>
  )
}

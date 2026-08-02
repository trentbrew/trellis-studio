import { createEffect, createMemo, For, Match, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useSearchParams } from "@solidjs/router"
import { usePreview, type ConsoleEntry, type ServiceInfo } from "@/context/preview"
import { useSDK } from "@/context/sdk"
import { isEditableTarget } from "@/lib/editable-target"
import { PreviewPublishControl } from "@/components/preview-publish-control"
import { PreviewRestClient } from "./preview-rest-client"
import {
  Play,
  RefreshCw,
  ExternalLink,
  MonitorPlay,
  Terminal as TerminalIcon,
  Globe,
  Zap,
  Smartphone,
  Tablet,
  Monitor,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-solid"

function ServiceTab(props: { svc: ServiceInfo; active: boolean; onClick: () => void }) {
  const dot = createMemo(() => {
    if (props.svc.status === "running") return "var(--color-green-500)"
    if (props.svc.status === "starting") return "var(--color-yellow-500)"
    if (props.svc.status === "error") return "var(--color-red-500)"
    return "var(--text-weaker)"
  })

  const icon = createMemo(() => {
    if (props.svc.type === "web") return Globe
    if (props.svc.type === "api") return Zap
    return TerminalIcon
  })

  return (
    <button class="preview-svc-tab" classList={{ "preview-svc-tab--active": props.active }} onClick={props.onClick}>
      <span class="preview-svc-dot" style={{ background: dot() }} />
      {(() => {
        const I = icon()
        return <I class="size-3.5" />
      })()}
      <span>{props.svc.name}</span>
      <Show when={props.svc.port}>
        <span class="preview-svc-port">:{props.svc.port}</span>
      </Show>
    </button>
  )
}

type Viewport = "mobile" | "tablet" | "desktop"

function WebPreview(props: { svc: ServiceInfo; viewport: Viewport; proxy: string }) {
  let frame: HTMLIFrameElement | undefined
  let container: HTMLDivElement | undefined
  const src = createMemo(() => props.svc.url || (props.svc.port ? `http://localhost:${props.svc.port}` : props.proxy))
  const viewportClass = createMemo(() => {
    if (props.viewport === "mobile") return "preview-web--mobile"
    if (props.viewport === "tablet") return "preview-web--tablet"
    return "preview-web--desktop"
  })

  // Track whether the preview has been clicked/focused
  const [focused, setFocused] = createStore({ hasFocus: false })

  // Without this, keyboard events (arrow keys, etc.) never reach apps running
  // inside the iframe — the parent document keeps focus until something inside
  // the frame is explicitly clicked, and any later interaction with the parent
  // silently steals focus back.
  const grab = () => {
    setFocused("hasFocus", true)
    try {
      frame?.contentWindow?.focus()
    } catch {}
  }

  // Redirect keyboard events to the iframe when preview is focused
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!focused.hasFocus) return
    if (isEditableTarget(document.activeElement)) return
    try {
      const win = frame?.contentWindow
      if (!win) return
      const doc = win.document
      if (!doc) return

      // Create and dispatch a copy of the event to the iframe
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

      // Prevent default if the iframe handled it
      if (event.defaultPrevented) e.preventDefault()
    } catch {}
  }

  // Lose focus when clicking outside the preview
  const handleMouseDown = (e: MouseEvent) => {
    if (container && !container.contains(e.target as Node)) {
      setFocused("hasFocus", false)
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
    <div
      ref={container}
      class={`preview-web ${viewportClass()}`}
      onClick={grab}
      classList={{ "preview-web--focused": focused.hasFocus }}
    >
      <iframe
        ref={frame}
        id="preview-iframe"
        class="preview-web-frame"
        src={src()}
        onLoad={grab}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="accelerometer; gyroscope; magnetometer; clipboard-read; clipboard-write; display-capture"
        tabindex="0"
      />
    </div>
  )
}

export function ConsolePanel(props: {
  logs: ConsoleEntry[]
  onClear: () => void
  collapsed?: boolean
  onToggle?: () => void
}) {
  let end: HTMLDivElement | undefined

  createEffect(() => {
    props.logs.length
    end?.scrollIntoView({ behavior: "smooth" })
  })

  const color = (level: string) => {
    if (level === "error") return "var(--color-red-500)"
    if (level === "warn") return "var(--color-yellow-500)"
    if (level === "info") return "var(--color-blue-500)"
    if (level === "debug") return "var(--text-weaker)"
    return "var(--text-base)"
  }

  const badge = (level: string) => {
    if (level === "error") return "ERR"
    if (level === "warn") return "WRN"
    if (level === "info") return "INF"
    if (level === "debug") return "DBG"
    return "LOG"
  }

  const time = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`
  }

  return (
    <div class="preview-console" classList={{ "preview-console--collapsed": props.collapsed }}>
      <div class="preview-console-header">
        <span class="preview-console-title">
          <TerminalIcon class="size-3" />
          Console
        </span>
        <Show when={props.logs.length > 0}>
          <span class="preview-console-count">{props.logs.length}</span>
        </Show>
        <div class="flex-1" />
        <Show when={props.onToggle}>
          <button
            class="preview-console-toggle"
            onClick={props.onToggle}
            title={props.collapsed ? "Expand console" : "Collapse console"}
          >
            <Show when={props.collapsed} fallback={<ChevronUp class="size-3" />}>
              <ChevronDown class="size-3" />
            </Show>
          </button>
        </Show>
        <button class="preview-console-clear" onClick={props.onClear} title="Clear console">
          <Trash2 class="size-3" />
        </button>
      </div>
      <div class="preview-console-entries">
        <Show when={props.logs.length === 0}>
          <div class="preview-console-empty">No console output</div>
        </Show>
        <For each={props.logs}>
          {(entry) => (
            <div class="preview-console-entry" style={{ color: color(entry.level) }}>
              <span class="preview-console-badge" style={{ color: color(entry.level) }}>
                {badge(entry.level)}
              </span>
              <span class="preview-console-time">{time(entry.timestamp)}</span>
              <span class="preview-console-msg">{entry.args.join(" ")}</span>
            </div>
          )}
        </For>
        <div ref={end} />
      </div>
    </div>
  )
}

function TerminalPreview(props: { svc: ServiceInfo }) {
  return (
    <div class="preview-terminal">
      <div class="preview-terminal-info">
        <TerminalIcon class="size-4" />
        <span>
          Terminal output for <strong>{props.svc.name}</strong>
        </span>
        <Show when={props.svc.ptyId}>
          <span class="preview-terminal-pty">PTY: {props.svc.ptyId}</span>
        </Show>
      </div>
      <div class="preview-terminal-hint">Switch to the Terminal tab to interact with this process directly.</div>
    </div>
  )
}

function StoppedView(props: { svc: ServiceInfo; onStart: () => void }) {
  return (
    <div class="preview-stopped">
      <div class="preview-stopped-icon">
        <MonitorPlay class="size-8 opacity-30" />
      </div>
      <div class="preview-stopped-label">
        <strong>{props.svc.name}</strong> is not running
      </div>
      <div class="preview-stopped-cmd">{props.svc.command}</div>
      <button class="preview-stopped-btn" onClick={props.onStart}>
        <Play class="size-4" />
        Start
      </button>
    </div>
  )
}

function ErrorView(props: { svc: ServiceInfo; onRetry: () => void }) {
  return (
    <div class="preview-error">
      <div class="preview-error-msg">{props.svc.error ?? "An error occurred"}</div>
      <button class="preview-stopped-btn" onClick={props.onRetry}>
        <RefreshCw class="size-4" />
        Retry
      </button>
    </div>
  )
}

export function PreviewPanel() {
  const preview = usePreview()
  const dialog = useDialog()
  const sdk = useSDK()
  const [, setSearchParams] = useSearchParams()
  const services = createMemo(() => preview.services())
  const active = createMemo(() => {
    const name = preview.active()
    return services().find((s) => s.name === name) ?? services()[0]
  })
  const url = createMemo(() => {
    const svc = active()
    if (!svc) return ""
    return svc.url ?? (svc.port ? `http://localhost:${svc.port}` : "")
  })
  const proxy = createMemo(() => {
    const svc = active()
    if (!svc?.url && !svc?.port) return ""
    return `${sdk.url}/preview/proxy/${svc.name}?directory=${encodeURIComponent(sdk.directory)}`
  })
  const [viewportStore, setViewport] = persisted(
    Persist.global("preview-viewport", ["preview-viewport.v1"]),
    createStore({ mode: "desktop" as Viewport }),
  )
  const viewport = () => viewportStore.mode
  const [drawer, setDrawer] = createStore({
    show: false,
    logs: [] as ConsoleEntry[],
    next: 0,
  })

  const MAX_LOGS = 500
  const handler = (e: MessageEvent) => {
    if (e.data?.source !== "oc-console") return
    const data = e.data as { level?: unknown; args?: unknown; timestamp?: unknown; url?: unknown }
    const entry: ConsoleEntry = {
      id: drawer.next,
      level: typeof data.level === "string" ? data.level : "log",
      args: Array.isArray(data.args) ? data.args.map(String) : [],
      timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
      url: typeof data.url === "string" ? data.url : url(),
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

  const setup = async () => {
    const result = await preview.setup()
    if (result.ok) {
      showToast({
        title: "Preview configured",
        description: result.file ?? "Added preview services to project config",
        variant: "success",
      })
      return
    }

    showToast({
      title: "Preview setup failed",
      description: "No preview services could be detected automatically.",
      variant: "error",
    })
  }

  const open = () => {
    void import("@/components/dialog-settings").then((x) => {
      dialog.show(() => <x.DialogSettings tab="services" />)
    })
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

  const reload = () => {
    void preview.refresh()
    const frame = document.getElementById("preview-iframe") as HTMLIFrameElement | null
    if (frame) frame.src = url() || proxy()
  }

  return (
    <div class="preview-root">
      <Show
        when={services().length > 0}
        fallback={
          <div class="preview-empty">
            <MonitorPlay class="size-10 opacity-15" />
            <div class="preview-empty-title">No preview services configured</div>
            <div class="preview-empty-desc">
              Add a <code>services</code> section to your <code>.trellis/preview.json</code> to get started.
            </div>
            <div class="flex items-center gap-2 mt-3">
              <button class="preview-stopped-btn" onClick={() => void setup()} disabled={preview.setting()}>
                <Play class="size-4" />
                {preview.setting() ? "Setting up…" : "Quick setup"}
              </button>
              <button class="preview-action-btn" onClick={open} title="Open preview settings">
                <MonitorPlay class="size-3.5" />
              </button>
            </div>
            <pre class="preview-empty-example">{`{
  "services": {
    "client": {
      "port": 48321,
      "type": "web",
      "command": "npm run dev"
    }
  }
}`}</pre>
          </div>
        }
      >
        <div class="preview-header">
          <div class="preview-tabs">
            <For each={services()}>
              {(svc) => (
                <ServiceTab
                  svc={svc}
                  active={active()?.name === svc.name}
                  onClick={() => preview.setActive(svc.name)}
                />
              )}
            </For>
          </div>
          <Show when={active()?.status === "running" && active()?.type === "web" && url()}>
            <input class="preview-web-url" type="text" value={url()} readonly />
          </Show>
          <Show when={active()?.status === "running" && active()?.type === "web"}>
            <div class="preview-viewport-toggle">
              <button
                class={`preview-viewport-btn ${viewport() === "mobile" ? "preview-viewport-btn--active" : ""}`}
                onClick={() => setViewport("mode", "mobile")}
                title="Mobile (375px)"
              >
                <Smartphone class="size-3.5" />
              </button>
              <button
                class={`preview-viewport-btn ${viewport() === "tablet" ? "preview-viewport-btn--active" : ""}`}
                onClick={() => setViewport("mode", "tablet")}
                title="Tablet (768px)"
              >
                <Tablet class="size-3.5" />
              </button>
              <button
                class={`preview-viewport-btn ${viewport() === "desktop" ? "preview-viewport-btn--active" : ""}`}
                onClick={() => setViewport("mode", "desktop")}
                title="Desktop (100%)"
              >
                <Monitor class="size-3.5" />
              </button>
            </div>
          </Show>
          <Show when={active()?.status === "running" && active()?.type === "web"}>
            <button
              class={`preview-action-btn ${drawer.show ? "preview-action-btn--active" : ""}`}
              onClick={() => setDrawer("show", !drawer.show)}
              title="Toggle console"
            >
              <TerminalIcon class="size-3.5" />
              <Show when={drawer.logs.length > 0}>
                <span class="preview-console-badge-count">{drawer.logs.length}</span>
              </Show>
            </button>
          </Show>
          <div class="preview-actions">
            <PreviewPublishControl
              visible={() => active()?.status === "running" && active()?.type === "web"}
            />
            <button
              class="preview-action-btn"
              onClick={() => {
                if (active()?.status === "running" && active()?.type === "web") {
                  reload()
                  return
                }
                void preview.refresh()
              }}
              title={active()?.status === "running" && active()?.type === "web" ? "Refresh preview" : "Refresh status"}
            >
              <RefreshCw class="size-3.5" />
            </button>
            <Show when={active()?.status === "running" && active()?.type === "web" && url()}>
              <button
                class="preview-action-btn"
                onClick={() => {
                  if (isGitHubUrl(url())) {
                    openExternal(url())
                  } else {
                    preview.browse(url(), active()?.name)
                    setSearchParams({ view: "browser" })
                  }
                }}
                title={isGitHubUrl(url()) ? "Open GitHub in new tab" : "Open in browser"}
              >
                <ExternalLink class="size-3.5" />
              </button>
            </Show>
          </div>
        </div>

        <div class="preview-content">
          <Show when={active()}>
            {(svc) => (
              <Switch>
                <Match when={svc().status === "stopped"}>
                  <StoppedView svc={svc()} onStart={() => void preview.start(svc().name)} />
                </Match>
                <Match when={svc().status === "starting"}>
                  <div class="preview-starting">
                    <div class="preview-starting-spinner" />
                    <span>Starting {svc().name}…</span>
                  </div>
                </Match>
                <Match when={svc().status === "error"}>
                  <ErrorView svc={svc()} onRetry={() => void preview.start(svc().name)} />
                </Match>
                <Match when={svc().status === "running" && svc().type === "web"}>
                  <div class="preview-web-wrap">
                    <WebPreview svc={svc()} viewport={viewport()} proxy={proxy()} />
                    <ConsolePanel
                      logs={drawer.logs}
                      onClear={() => {
                        setDrawer("logs", [])
                        preview.console.clear()
                      }}
                      collapsed={!drawer.show}
                      onToggle={() => setDrawer("show", !drawer.show)}
                    />
                  </div>
                </Match>
                <Match when={svc().status === "running" && svc().type === "api"}>
                  <PreviewRestClient url={svc().url ?? `http://localhost:${svc().port}`} />
                </Match>
                <Match when={svc().status === "running" && svc().type === "terminal"}>
                  <TerminalPreview svc={svc()} />
                </Match>
              </Switch>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

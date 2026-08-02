import { createSimpleContext } from "@opencode-ai/ui/context"
import { useParams } from "@solidjs/router"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "./sdk"
import { clean, EVENT, type PreviewDetail } from "@/lib/preview-url"
import { autofollow } from "@/lib/agent-nav"

export type ServiceStatus = "stopped" | "starting" | "running" | "error"

export type ServiceInfo = {
  name: string
  port?: number
  type: "web" | "api" | "terminal"
  command: string
  url?: string
  status: ServiceStatus
  ptyId?: string
  pid?: number
  error?: string
}

export type ConsoleEntry = {
  id: number
  level: string
  args: string[]
  timestamp: number
  url?: string
  name?: string
}

export const { use: usePreview, provider: PreviewProvider } = createSimpleContext({
  name: "Preview",
  gate: false,
  init: () => {
    const params = useParams()
    const sdk = useSDK()

    const [store, setStore] = createStore<{
      services: ServiceInfo[]
      active?: string
      target?: {
        id: number
        name?: string
        url: string
      }
      console: {
        logs: ConsoleEntry[]
        next: number
      }
      loading: boolean
      setting: boolean
    }>({
      services: [],
      console: {
        logs: [],
        next: 0,
      },
      loading: false,
      setting: false,
    })

    const qs = createMemo(() => `?directory=${encodeURIComponent(sdk.directory)}`)
    const MAX_CONSOLE = 500

    const capture = (input: Omit<ConsoleEntry, "id">) => {
      const entry: ConsoleEntry = {
        id: store.console.next,
        level: input.level,
        args: input.args.map(String),
        timestamp: input.timestamp,
        url: input.url,
        name: input.name,
      }
      batch(() => {
        setStore("console", "logs", (prev) =>
          prev.length >= MAX_CONSOLE ? [...prev.slice(1), entry] : [...prev, entry],
        )
        setStore("console", "next", store.console.next + 1)
      })
      void sdk
        .fetch(`${sdk.url}/preview/console${qs()}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            level: entry.level,
            args: entry.args,
            timestamp: entry.timestamp,
            url: entry.url,
            name: entry.name,
          }),
        })
        .catch(() => undefined)
      return entry
    }

    const clear = () => {
      batch(() => {
        setStore("console", "logs", [])
        setStore("console", "next", 0)
      })
      void sdk.fetch(`${sdk.url}/preview/console${qs()}`, { method: "DELETE" }).catch(() => undefined)
    }

    const refresh = async () => {
      setStore("loading", true)
      try {
        const res = await sdk.fetch(`${sdk.url}/preview/services${qs()}`)
        if (res.ok) {
          const data: ServiceInfo[] = await res.json()
          batch(() => {
            setStore("services", data)
            setStore("loading", false)
          })
        } else {
          setStore("loading", false)
        }
      } catch {
        setStore("loading", false)
      }
    }

    const start = async (name: string) => {
      const idx = store.services.findIndex((s) => s.name === name)
      if (idx >= 0) setStore("services", idx, "status", "starting")
      try {
        const res = await sdk.fetch(`${sdk.url}/preview/services/${name}/start${qs()}`, { method: "POST" })
        if (res.ok) {
          const info: ServiceInfo = await res.json()
          if (idx >= 0) setStore("services", idx, info)
          else setStore("services", store.services.length, info)
        }
      } catch (err) {
        if (idx >= 0) setStore("services", idx, "status", "error")
      }
    }

    const stop = async (name: string) => {
      try {
        await sdk.fetch(`${sdk.url}/preview/services/${name}/stop${qs()}`, { method: "POST" })
        const idx = store.services.findIndex((s) => s.name === name)
        if (idx >= 0) setStore("services", idx, "status", "stopped")
      } catch {}
    }

    const startAll = async () => {
      for (const svc of store.services) {
        if (svc.status === "stopped") await start(svc.name)
      }
    }

    const stopAll = async () => {
      for (const svc of store.services) {
        if (svc.status === "running" || svc.status === "starting") await stop(svc.name)
      }
    }

    const infer = async () => {
      try {
        const res = await sdk.fetch(`${sdk.url}/preview/infer${qs()}`, { method: "POST" })
        if (res.ok) return (await res.json()) as { name: string; port: number; type: string; command: string }[]
      } catch {}
      return []
    }

    const setup = async () => {
      setStore("setting", true)
      try {
        const res = await sdk.fetch(`${sdk.url}/preview/setup${qs()}`, { method: "POST" })
        if (!res.ok) return { ok: false as const }
        const data = (await res.json()) as { file?: string; services: ServiceInfo[] }
        const ok = data.services.length > 0
        batch(() => {
          setStore("services", data.services)
          setStore("active", data.services[0]?.name)
        })
        await startAll()
        await refresh()
        return { ok, file: data.file, services: data.services }
      } catch {
        return { ok: false as const }
      } finally {
        setStore("setting", false)
      }
    }

    const setActive = (name: string) => setStore("active", name)
    const browse = (value: string, name?: string) => {
      const url = clean(value)
      if (!url) return
      batch(() => {
        if (name) setStore("active", name)
        setStore("target", { id: Date.now(), name, url })
      })
    }

    const running = createMemo(() => store.services.filter((s) => s.status === "running"))
    const configured = createMemo(() => store.services.length > 0)

    createEffect(() => {
      void (async () => {
        await refresh()
        await startAll()
      })()
    })

    const unsub = sdk.event.on("pty.exited", () => {
      void refresh()
    })
    onCleanup(unsub)

    const nav = sdk.event.on("ui.navigate", (event) => {
      const props = event.properties as typeof event.properties & {
        preview?: {
          name?: string
          url?: string
        }
      }
      if (props.sessionID && props.sessionID !== params.id) return
      if (!autofollow()) return
      if (!props.preview?.name) return
      void (async () => {
        await refresh()
        setStore("active", props.preview!.name)
        browse(props.preview!.url, props.preview!.name)
      })()
    })
    onCleanup(nav)

    const links = (event: Event) => {
      const detail = (event as CustomEvent<PreviewDetail>).detail
      if (!detail?.url) return
      browse(detail.url, detail.name)
    }
    window.addEventListener(EVENT, links)
    onCleanup(() => window.removeEventListener(EVENT, links))

    let poll: ReturnType<typeof setInterval> | undefined
    createEffect(() => {
      if (running().length > 0) {
        if (!poll) poll = setInterval(() => void refresh(), 5000)
      } else {
        if (poll) {
          clearInterval(poll)
          poll = undefined
        }
      }
    })
    onCleanup(() => {
      if (poll) clearInterval(poll)
    })

    return {
      services: () => store.services,
      active: () => store.active ?? store.services[0]?.name,
      target: () => store.target,
      loading: () => store.loading,
      setting: () => store.setting,
      running,
      configured,
      console: {
        logs: () => store.console.logs,
        capture,
        clear,
      },
      browse,
      start,
      stop,
      startAll,
      stopAll,
      refresh,
      infer,
      setup,
      setActive,
    }
  },
})

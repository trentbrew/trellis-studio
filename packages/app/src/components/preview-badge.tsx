import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useSDK } from "@/context/sdk"
import { useSearchParams } from "@solidjs/router"
import type { ServiceInfo } from "@/context/preview"

export function PreviewBadge() {
  const sdk = useSDK()
  const [, setSearchParams] = useSearchParams()
  const [services, setServices] = createSignal<ServiceInfo[]>([])

  const qs = createMemo(() => `?directory=${encodeURIComponent(sdk.directory)}`)
  const running = createMemo(() => services().filter((s) => s.status === "running"))
  const mount = createMemo(() => document.getElementById("opencode-titlebar-right"))

  const refresh = async () => {
    try {
      const res = await sdk.fetch(`${sdk.url}/preview/services${qs()}`)
      if (res.ok) setServices(await res.json())
    } catch {}
  }

  createEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 8000)
    onCleanup(() => clearInterval(id))
  })

  const label = createMemo(() => {
    const r = running()
    if (r.length === 0) return undefined
    if (r.length === 1) return `Running on :${r[0].port ?? "?"}`
    return `${r.length} services running`
  })

  return (
    <Show when={mount() && label()}>
      <Portal mount={mount()!}>
        <button class="preview-badge" onClick={() => setSearchParams({ view: "browser" })} title="Open Preview tab">
          <span class="preview-badge-dot" />
          <span class="preview-badge-label">{label()}</span>
        </button>
      </Portal>
    </Show>
  )
}

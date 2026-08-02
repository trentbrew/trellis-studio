import { createEffect, onCleanup } from "solid-js"
import { useTrellis } from "@/context/trellis"
import { useTrellisStore } from "@/context/trellis-store"
import { preload } from "@/lib/graph-preloader"

export function GraphPreloadTrigger() {
  const trellis = useTrellis()
  const store = useTrellisStore()

  createEffect(() => {
    if (!trellis.ready) return
    if (!store.stats) return
    if (store.large) return
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(() => preload(trellis.fetchGraph), { timeout: 5000 })
      onCleanup(() => (window as any).cancelIdleCallback(id))
    } else {
      const t = setTimeout(() => preload(trellis.fetchGraph), 3000)
      onCleanup(() => clearTimeout(t))
    }
  })

  return null
}

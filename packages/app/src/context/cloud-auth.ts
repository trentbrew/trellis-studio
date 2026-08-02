import { createSignal, onCleanup, onMount } from "solid-js"
import { isCloudMode } from "@/lib/cloud-mode"

/** Broker auth token supplied by the trellis-cloud parent frame. */
export function createCloudAuth() {
  const [token, setToken] = createSignal<string | undefined>()
  const active = isCloudMode()

  function requestAuth() {
    if (!active) return
    try {
      window.parent.postMessage({ type: "trellis-cloud:request-auth" }, "*")
    } catch {
      // cross-origin parent
    }
  }

  onMount(() => {
    if (!active) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "trellis-cloud:auth") return
      setToken(typeof event.data.token === "string" ? event.data.token : undefined)
    }
    window.addEventListener("message", handler)
    requestAuth()
    onCleanup(() => window.removeEventListener("message", handler))
  })

  return { active, token, requestAuth }
}

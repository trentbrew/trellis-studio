import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { isCloudMode } from "@/lib/cloud-mode"
import { useServer } from "@/context/server"

export type SandboxWarmth = "cold" | "warm" | "hot"
export type SandboxRuntime = "running" | "paused" | "stopped" | "unknown"

export type CloudSandboxStatus = {
  lifecycle: string
  runtime: SandboxRuntime
  warmth: SandboxWarmth
  studioReachable: boolean
  updatedAt: number
  lastVisitedAt?: number
}

const EMPTY: CloudSandboxStatus = {
  lifecycle: "unknown",
  runtime: "unknown",
  warmth: "cold",
  studioReachable: false,
  updatedAt: 0,
}

export function createCloudSandbox() {
  const [remote, setRemote] = createSignal<CloudSandboxStatus | null>(null)
  const server = useServer()
  const active = isCloudMode()

  onMount(() => {
    if (!active) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "trellis-cloud:sandbox-status") return
      const status = event.data.status as CloudSandboxStatus | undefined
      if (status) setRemote(status)
    }
    window.addEventListener("message", handler)
    onCleanup(() => window.removeEventListener("message", handler))
  })

  const status = createMemo<CloudSandboxStatus>(() => {
    const r = remote()
    const localHot = server.healthy() === true
    if (!r) {
      if (!localHot) return EMPTY
      return {
        ...EMPTY,
        lifecycle: "ready",
        runtime: "running",
        warmth: "hot",
        studioReachable: true,
        updatedAt: Date.now(),
      }
    }
    if (localHot && r.lifecycle === "ready" && r.runtime === "running") {
      return { ...r, warmth: "hot", studioReachable: true }
    }
    return r
  })

  return { active, status }
}

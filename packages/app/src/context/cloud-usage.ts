// Cloud usage context — polls /ai/usage from the trellis-cloud broker
// when the IDE is running in cloud mode (iframed by the cloud dashboard).
//
// Provides reactive signals for the daily token budget gauge in the status bar.

import { createSignal, createEffect, onCleanup } from "solid-js"
import { isCloudMode, cloudBrokerUrl } from "@/lib/cloud-mode"
import { createCloudAuth } from "@/context/cloud-auth"

export interface CloudUsageData {
  dailyBudget: number
  usedTokens: number
  remainingTokens: number
  percentRemaining: number
  requestCount: number
  resetsAt: string
  tier: string
  model: string
  fallbackModel: string
}

const POLL_INTERVAL_MS = 30_000 // 30 seconds
const EMPTY: CloudUsageData = {
  dailyBudget: 0,
  usedTokens: 0,
  remainingTokens: 0,
  percentRemaining: 100,
  requestCount: 0,
  resetsAt: "",
  tier: "free",
  model: "",
  fallbackModel: "",
}

/**
 * Creates reactive cloud usage signals.
 * Only polls when the IDE is in cloud mode.
 */
export function createCloudUsage() {
  const cloudAuth = createCloudAuth()
  const [data, setData] = createSignal<CloudUsageData>(EMPTY)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const active = isCloudMode()

  async function fetchUsage() {
    const token = cloudAuth.token()
    const brokerUrl = cloudBrokerUrl()
    if (!active || !token || !brokerUrl) return

    setLoading(true)
    try {
      const res = await fetch(`${brokerUrl}/ai/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json as CloudUsageData)
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Start polling when in cloud mode and auth token is available
  if (active) {
    createEffect(() => {
      if (!cloudAuth.token()) return
      void fetchUsage()
      const interval = setInterval(() => void fetchUsage(), POLL_INTERVAL_MS)
      onCleanup(() => clearInterval(interval))
    })
  }

  return {
    /** Whether the IDE is in cloud mode */
    active,
    /** Current daily usage data */
    data,
    /** Whether a fetch is in-flight */
    loading,
    /** Last fetch error, if any */
    error,
    /** Manually refresh the usage data */
    refresh: fetchUsage,
  }
}

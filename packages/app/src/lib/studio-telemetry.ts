import { isCloudMode } from "@/lib/cloud-mode"

export type StudioTelemetryPayload = {
  name: string
  source?: "turtlecode" | "studio" | "web"
  properties?: Record<string, unknown>
}

const THROTTLE_MS = 60_000
const lastSent = new Map<string, number>()

export function emitStudioTelemetry(
  name: string,
  properties?: Record<string, unknown>,
  opts?: { throttleKey?: string; source?: StudioTelemetryPayload["source"] },
) {
  const payload: StudioTelemetryPayload = {
    name,
    source: opts?.source ?? "turtlecode",
    properties,
  }

  const throttleKey = opts?.throttleKey ?? name
  const now = Date.now()
  const last = lastSent.get(throttleKey) ?? 0
  if (now - last < THROTTLE_MS) return
  lastSent.set(throttleKey, now)

  if (!isCloudMode()) return

  try {
    window.parent.postMessage({ type: "trellis-cloud:track", ...payload }, "*")
  } catch {
    // best effort
  }
}

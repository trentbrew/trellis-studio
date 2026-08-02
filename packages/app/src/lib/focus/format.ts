import type { FocusContext } from "./types"

export const FOCUS_STALE_MS = 5 * 60 * 1000
export const FOCUS_MAX_BYTES = 4 * 1024

export function formatFocusBlock(focus: FocusContext): string {
  const payload = JSON.stringify(focus.payload)
  const lines = [
    "[FOCUS v1]",
    `surface: ${focus.surface}`,
    `key: ${focus.key}`,
    `label: ${focus.label}`,
  ]
  if (focus.summary) lines.push(`summary: ${focus.summary}`)
  lines.push(`payload: ${payload}`, "[/FOCUS]")
  return lines.join("\n")
}

export function isFocusStale(focus: FocusContext, now = Date.now()): boolean {
  const captured = Date.parse(focus.capturedAt)
  if (Number.isNaN(captured)) return true
  return now - captured > FOCUS_STALE_MS
}

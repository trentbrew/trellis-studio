import { Persist } from "@/utils/persist"
import { DEFAULT_PROJECTION_PINS, MAX_PROJECTION_PINS } from "./types"

export { DEFAULT_PROJECTION_PINS, MAX_PROJECTION_PINS }

export function normalizeProjectionPins(ids: string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(id)
    if (next.length >= MAX_PROJECTION_PINS) break
  }
  if (next.length === 0) return [...DEFAULT_PROJECTION_PINS]
  return next
}

export function projectionPinsTarget(projectDir: string) {
  return Persist.workspace(projectDir, "session.projections.pinned", ["session.projections.pinned.v1"])
}

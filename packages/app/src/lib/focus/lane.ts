import type { FocusLanePayload, FocusSessionRef } from "./types"

export function buildLanePayload(session: FocusSessionRef | undefined): FocusLanePayload | undefined {
  if (!session?.laneID) return undefined
  return {
    id: session.laneID,
    parentLaneId: session.parentLaneID,
    forkKind: session.laneForkKind,
    unpromotedParent: session.laneUnpromotedParent,
  }
}

export function laneSummaryHint(lane: FocusLanePayload | undefined): string | undefined {
  if (!lane) return undefined
  if (lane.forkKind === "child") return "Child lane"
  if (lane.forkKind === "sibling") return "Forked lane"
  return undefined
}

export function mergeFocusSummary(base: string | undefined, lane: FocusLanePayload | undefined): string | undefined {
  const hint = laneSummaryHint(lane)
  if (!hint) return base
  if (!base) return hint
  return `${hint} · ${base}`
}

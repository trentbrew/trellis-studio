import type { TopTab } from "@/pages/session/helpers"
import type { FocusContext, FocusSessionRef } from "../types"
import { buildLanePayload, mergeFocusSummary } from "../lane"
import {
  parseRailRoute,
  railFocusKey,
  railFocusLabel,
  railFocusSummary,
  type RailSearchParams,
} from "../rail-params"
import { applyFocusRailHints, readFocusRailHints } from "../rail-labels"

export function resolveRailFocus(input: {
  view: TopTab
  searchParams?: RailSearchParams
  session?: FocusSessionRef
}): FocusContext | null {
  const parsed = parseRailRoute(input.view, input.searchParams ?? {})
  if (!parsed) return null
  const route = applyFocusRailHints(parsed, readFocusRailHints())

  const lane = buildLanePayload(input.session)
  if (!lane && input.view === "code") return null

  const summary = mergeFocusSummary(railFocusSummary(route), lane)

  return {
    version: 1,
    surface: route.surface,
    label: railFocusLabel(route),
    key: railFocusKey(route),
    summary,
    payload: {
      ...route.payload,
      route: route.routeSlug,
      ...(route.itemSlug ? { item: route.itemSlug } : {}),
      ...(lane ? { lane } : {}),
    },
    capturedAt: new Date().toISOString(),
  }
}

import { createSignal } from "solid-js"
import type { ParsedRailRoute } from "./rail-params"

export type FocusRailHints = {
  surface: ParsedRailRoute["surface"]
  routeSlug?: string
  itemSlug?: string
  routeLabel?: string
  itemLabel?: string
}

const [hints, setHints] = createSignal<FocusRailHints | null>(null)

export function publishFocusRailHints(next: FocusRailHints | null) {
  setHints(next)
}

export function readFocusRailHints() {
  return hints()
}

export function applyFocusRailHints(route: ParsedRailRoute, live: FocusRailHints | null | undefined): ParsedRailRoute {
  if (!live) return route
  if (live.surface !== route.surface) return route
  if (live.routeSlug && live.routeSlug !== route.routeSlug) return route
  if (live.itemSlug && live.itemSlug !== route.itemSlug) return route

  const routeLabel = live.routeLabel?.trim() || route.routeLabel
  const itemLabel = live.itemLabel?.trim() || route.itemLabel

  return {
    ...route,
    routeLabel,
    itemLabel,
    payload: {
      ...route.payload,
      ...(routeLabel ? { routeTitle: routeLabel } : {}),
      ...(itemLabel ? { itemTitle: itemLabel } : {}),
    },
  }
}

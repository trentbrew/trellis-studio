import type { TopTab } from "@/pages/session/helpers"
import { resolveFileFocus } from "./providers/file"
import { resolveRailFocus } from "./providers/rail"
import { resolveShellFocus } from "./providers/shell"
import { resolveWhiteboardFocus } from "./providers/whiteboard"
import { buildLanePayload, mergeFocusSummary } from "./lane"
import type { FocusContext, FocusSessionRef } from "./types"
import type { RailSearchParams } from "./rail-params"

export type FocusResolveInput = {
  view: TopTab
  activeFileTab?: string
  session?: FocusSessionRef
  searchParams?: RailSearchParams
}

const RAIL_VIEWS = new Set<TopTab>([
  "cms",
  "graph",
  "plan",
  "preview",
  "browser",
  "design",
  "assets",
  "review",
  "projection",
  "logs",
])

function resolveLaneOnlyFocus(session: FocusSessionRef | undefined): FocusContext | null {
  const lane = buildLanePayload(session)
  if (!lane || !session?.id) return null
  return {
    version: 1,
    surface: "shell",
    label: "Session",
    key: session.id,
    summary: mergeFocusSummary(undefined, lane),
    payload: { lane },
    capturedAt: new Date().toISOString(),
  }
}

export function resolveFocus(input: FocusResolveInput): FocusContext | null {
  const rail = () => resolveRailFocus(input)
  const shell = () => resolveShellFocus(input)
  const providers = [
    () => resolveWhiteboardFocus(input),
    () => (RAIL_VIEWS.has(input.view) ? rail() : null),
    () => resolveFileFocus(input),
    () => (!RAIL_VIEWS.has(input.view) ? shell() : null),
    () => resolveLaneOnlyFocus(input.session),
  ]

  for (const provider of providers) {
    const focus = provider()
    if (focus) return focus
  }
  return null
}

export function withLanePayload(focus: FocusContext, session: FocusSessionRef | undefined): FocusContext {
  const lane = buildLanePayload(session)
  if (!lane) return focus
  const baseSummary = focus.summary?.replace(/^(Child lane|Forked lane)( · )?/, "")
  return {
    ...focus,
    summary: mergeFocusSummary(baseSummary || undefined, lane),
    payload: {
      ...focus.payload,
      lane,
    },
  }
}

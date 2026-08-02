import { getFilename } from "@opencode-ai/util/path"
import { projectionWhiteboard } from "@/lib/whiteboard/active-projection"
import { searchParamOne, type RailSearchParams } from "../rail-params"
import type { TopTab } from "@/pages/session/helpers"
import type { FocusContext, FocusSessionRef } from "../types"
import { buildLanePayload, mergeFocusSummary } from "../lane"

function isWhiteboardPath(path: string) {
  return path.endsWith(".whiteboard") || path.includes(".whiteboard/")
}

function onWhiteboardSurface(view: TopTab, activeFileTab?: string, searchParams?: RailSearchParams) {
  if (view === "projection") return searchParamOne(searchParams?.lens) === "whiteboards"
  if (activeFileTab && isWhiteboardPath(activeFileTab)) return true
  return false
}

export function resolveWhiteboardFocus(input: {
  view: TopTab
  activeFileTab?: string
  searchParams?: RailSearchParams
  session?: FocusSessionRef
}): FocusContext | null {
  if (!onWhiteboardSurface(input.view, input.activeFileTab, input.searchParams)) return null

  const urlPath =
    input.view === "projection" && searchParamOne(input.searchParams?.lens) === "whiteboards"
      ? searchParamOne(input.searchParams?.whiteboard)
      : undefined
  const projectionPath = input.view === "projection" ? projectionWhiteboard.path() : null
  const tabPath =
    input.activeFileTab && isWhiteboardPath(input.activeFileTab) ? input.activeFileTab : undefined
  const path = urlPath ?? projectionPath ?? tabPath
  if (!path || !isWhiteboardPath(path)) return null

  const lane = buildLanePayload(input.session)
  const name = getFilename(path).replace(/\.whiteboard$/, "")
  return {
    version: 1,
    surface: "whiteboard",
    label: `Whiteboard · ${name}`,
    key: path,
    summary: mergeFocusSummary(undefined, lane),
    payload: {
      path,
      ...(lane ? { lane } : {}),
    },
    capturedAt: new Date().toISOString(),
  }
}

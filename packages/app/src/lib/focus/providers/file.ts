import { getFilename } from "@opencode-ai/util/path"
import type { FocusContext, FocusSessionRef } from "../types"
import { buildLanePayload, mergeFocusSummary } from "../lane"

export function resolveFileFocus(input: {
  activeFileTab?: string
  session?: FocusSessionRef
}): FocusContext | null {
  const path = input.activeFileTab
  if (!path || path === "home" || path === "empty") return null

  const lane = buildLanePayload(input.session)
  const filename = getFilename(path)
  return {
    version: 1,
    surface: "file",
    label: `File · ${filename}`,
    key: path,
    summary: mergeFocusSummary(undefined, lane),
    payload: {
      path,
      ...(lane ? { lane } : {}),
    },
    capturedAt: new Date().toISOString(),
  }
}

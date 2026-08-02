import type { TopTab } from "@/pages/session/helpers"
import type { FocusContext, FocusSessionRef } from "../types"
import { buildLanePayload, mergeFocusSummary } from "../lane"

const VIEW_LABELS: Partial<Record<TopTab, { surface: FocusContext["surface"]; label: string; key: string }>> = {
  cms: { surface: "cms", label: "CMS", key: "cms" },
  graph: { surface: "graph", label: "Graph", key: "graph" },
  plan: { surface: "plan", label: "Plan", key: "plan" },
  preview: { surface: "preview", label: "Preview", key: "preview" },
  browser: { surface: "preview", label: "Browser", key: "browser" },
  design: { surface: "design", label: "Design", key: "design" },
  assets: { surface: "assets", label: "Assets", key: "assets" },
  review: { surface: "review", label: "Review", key: "review" },
  projection: { surface: "projection", label: "Projection", key: "projection" },
  logs: { surface: "shell", label: "Logs", key: "logs" },
  code: { surface: "shell", label: "Editor", key: "code" },
  home: { surface: "shell", label: "Home", key: "home" },
}

export function resolveShellFocus(input: {
  view: TopTab
  session?: FocusSessionRef
}): FocusContext | null {
  const mapped = VIEW_LABELS[input.view]
  if (!mapped) return null

  const lane = buildLanePayload(input.session)
  if (!lane && input.view === "code") return null

  return {
    version: 1,
    surface: mapped.surface,
    label: mapped.label,
    key: mapped.key,
    summary: mergeFocusSummary(undefined, lane),
    payload: {
      view: input.view,
      ...(lane ? { lane } : {}),
    },
    capturedAt: new Date().toISOString(),
  }
}

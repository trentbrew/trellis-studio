/** Deep-link into an open projection lens (select a note, whiteboard, calendar event, …). */
export const PROJECTION_FOCUS_EVENT = "trellis-projection-focus"

export type ProjectionFocusDetail = {
  lens: string
  entityId?: string
  path?: string
}

export function dispatchProjectionFocus(detail: ProjectionFocusDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PROJECTION_FOCUS_EVENT, { detail }))
}

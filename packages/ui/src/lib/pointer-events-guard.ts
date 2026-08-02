// Kobalte modal layers (dialog, dropdown, select, …) set `document.body.style.pointerEvents = "none"`.
// Drag/resize handlers also temporarily set body interaction styles such as `user-select: none`.
// If cleanup is missed, the IDE can become unclickable or text fields can stop placing a caret until refresh.
// This guard restores those body-level styles when no overlay should still be blocking.

const OPEN_LAYER_SELECTOR = [
  '[data-component="dialog-overlay"]:not([data-closing])',
  '[data-component="dropdown-menu-content"][data-expanded]',
  '[data-component="select-content"][data-expanded]',
  '[data-component="popover-content"][data-expanded]',
  '[data-component="context-menu-content"][data-expanded]',
].join(", ")

export function hasBlockingOverlay(): boolean {
  if (typeof document === "undefined") return false
  return !!document.querySelector(OPEN_LAYER_SELECTOR)
}

export function ensureBodyPointerEvents(): boolean {
  if (typeof document === "undefined") return false
  const { body } = document
  if (body.style.pointerEvents !== "none") return false
  if (hasBlockingOverlay()) return false

  body.style.pointerEvents = ""
  removeEmptyBodyStyleAttribute()
  return true
}

const STALE_BODY_CURSORS = new Set(["col-resize", "row-resize", "ew-resize", "ns-resize"])

function removeEmptyBodyStyleAttribute() {
  if (document.body.style.length === 0) document.body.removeAttribute("style")
}

export function ensureBodyInteractionStyles(): boolean {
  if (typeof document === "undefined") return false
  const { body } = document
  let restored = false

  if (body.style.userSelect === "none") {
    body.style.userSelect = ""
    restored = true
  }

  if (STALE_BODY_CURSORS.has(body.style.cursor)) {
    body.style.cursor = ""
    restored = true
  }

  if (body.style.overflow === "hidden" && !hasBlockingOverlay()) {
    body.style.overflow = ""
    restored = true
  }

  if (restored) removeEmptyBodyStyleAttribute()
  return restored
}

export function ensureBodyInteractionState(): boolean {
  const restoredPointerEvents = ensureBodyPointerEvents()
  const restoredInteractionStyles = ensureBodyInteractionStyles()
  return restoredPointerEvents || restoredInteractionStyles
}

/** Restore body interaction when a modal layer or drag handler missed cleanup. */
export function restoreBodyPointerEventsOnInteraction() {
  if (typeof document === "undefined") return
  const handler = () => {
    ensureBodyInteractionState()
  }
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") handler()
  }
  queueMicrotask(handler)
  window.addEventListener("pointerdown", handler, true)
  window.addEventListener("pointerup", handler, true)
  window.addEventListener("pointercancel", handler, true)
  window.addEventListener("blur", handler, true)
  document.addEventListener("visibilitychange", handleVisibility, true)

  return () => {
    window.removeEventListener("pointerdown", handler, true)
    window.removeEventListener("pointerup", handler, true)
    window.removeEventListener("pointercancel", handler, true)
    window.removeEventListener("blur", handler, true)
    document.removeEventListener("visibilitychange", handleVisibility, true)
  }
}

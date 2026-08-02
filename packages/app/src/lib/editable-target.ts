export function isEditableTarget(target: EventTarget | null | undefined) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest("[contenteditable='true']")) return true
  if (target.closest("input, textarea, select")) return true
  return false
}

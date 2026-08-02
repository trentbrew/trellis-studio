// Verbose input/focus tracing for investigating focus traps and stolen focus.
//
// Enable:  localStorage.setItem("trellis_debug_focus", "true") then refresh.
// Disable: localStorage.removeItem("trellis_debug_focus") then refresh.
//
// Logs focusin/focusout (capture) and patched HTMLElement.prototype.focus calls.
// Filter DevTools console with "[focus]".

const STORAGE_KEY = "trellis_debug_focus"

export function isFocusDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

type ElementDescriptor = {
  tag: string
  id?: string
  class?: string
  role?: string
  type?: string
  name?: string
  placeholder?: string
  contentEditable?: boolean
  preventAutofocus?: boolean
  testId?: string
  ariaLabel?: string
  component?: string
}

const inertAncestor = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement)) return null
  let current: HTMLElement | null = el
  while (current) {
    if (current.inert) return describeElement(current)
    current = current.parentElement
  }
  return null
}

export const focusInputAtPoint = (x: number, y: number) => {
  const field = recoverableInputAtPoint(x, y)
  if (!field) return false
  field.focus()
  const active = deepActiveElement()
  return active === field || (active instanceof Node && field.contains(active))
}

const describeElement = (el: Element | null | undefined): ElementDescriptor | null => {
  if (!el) return null
  if (!(el instanceof HTMLElement)) return { tag: el.tagName }

  const preventAutofocus = el.closest("[data-prevent-autofocus]") !== null

  const descriptor: ElementDescriptor = {
    tag: el.tagName,
    preventAutofocus: preventAutofocus || undefined,
  }

  if (el.id) descriptor.id = el.id
  if (typeof el.className === "string" && el.className) descriptor.class = el.className.slice(0, 120)
  const role = el.getAttribute("role")
  if (role) descriptor.role = role
  const testId = el.getAttribute("data-testid")
  if (testId) descriptor.testId = testId
  const component = el.getAttribute("data-component")
  if (component) descriptor.component = component
  const ariaLabel = el.getAttribute("aria-label")
  if (ariaLabel) descriptor.ariaLabel = ariaLabel.slice(0, 80)

  if (el instanceof HTMLInputElement) {
    descriptor.type = el.type
    if (el.name) descriptor.name = el.name
    if (el.placeholder) descriptor.placeholder = el.placeholder.slice(0, 80)
  } else if (el instanceof HTMLTextAreaElement) {
    if (el.name) descriptor.name = el.name
    if (el.placeholder) descriptor.placeholder = el.placeholder.slice(0, 80)
  } else if (el instanceof HTMLSelectElement) {
    if (el.name) descriptor.name = el.name
  }

  if (el.isContentEditable) descriptor.contentEditable = true

  return descriptor
}

const isEditableTarget = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement)) return false
  return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.isContentEditable
}

const isInputFieldTarget = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement)) return false
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable
}

const inputFieldTarget = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement)) return null
  const field = el.closest('input, textarea, select, [contenteditable="true"]')
  return field instanceof HTMLElement && isInputFieldTarget(field) ? field : null
}

const elementsAtPoint = (x: number, y: number) => {
  if (typeof document.elementsFromPoint === "function") {
    return document.elementsFromPoint(x, y).filter((el): el is HTMLElement => el instanceof HTMLElement)
  }
  const hit = document.elementFromPoint(x, y)
  return hit instanceof HTMLElement ? [hit] : []
}

const inputFieldFromStack = (x: number, y: number) => {
  for (const el of elementsAtPoint(x, y)) {
    const field = inputFieldTarget(el)
    if (field) return field
  }
  return null
}

const containsPoint = (el: HTMLElement, x: number, y: number) => {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

const promptEditorAtPoint = (x: number, y: number) => {
  const editors = Array.from(
    document.querySelectorAll<HTMLElement>('[data-component="prompt-input"][contenteditable="true"]'),
  )
  for (let index = editors.length - 1; index >= 0; index -= 1) {
    const editor = editors[index]
    if (!containsPoint(editor, x, y)) continue
    return editor
  }
  return null
}

const isInteractiveHit = (el: Element | null | undefined) => {
  if (!(el instanceof HTMLElement)) return false
  if (inputFieldTarget(el)) return true
  return el.closest('button, a, summary, [role="button"], [role="menuitem"], [role="checkbox"], [data-action]') !== null
}

const recoverableInputAtPoint = (x: number, y: number) => {
  const hit = document.elementFromPoint(x, y)
  const direct = inputFieldTarget(hit)
  if (direct) return direct

  const stacked = inputFieldFromStack(x, y)
  if (stacked) return stacked

  if (isInteractiveHit(hit)) return null
  return promptEditorAtPoint(x, y)
}

const deepActiveElement = (): Element | null => {
  let current: Element | null = document.activeElement
  while (current instanceof HTMLElement && current.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement
  }
  return current
}

export const logFocusEvent = (kind: string, detail: Record<string, unknown>) => {
  if (!isFocusDebugEnabled()) return
  console.debug("[focus]", kind, detail)
}

const logFocus = logFocusEvent

let installed = false
let restoreFocus: (() => void) | undefined

export function installFocusDebug() {
  if (installed || typeof window === "undefined" || !isFocusDebugEnabled()) return
  installed = true

  const handleFocusIn = (event: FocusEvent) => {
    logFocus("focusin", {
      target: describeElement(event.target instanceof Element ? event.target : null),
      relatedTarget: describeElement(event.relatedTarget instanceof Element ? event.relatedTarget : null),
      activeElement: describeElement(deepActiveElement()),
      editable: isEditableTarget(event.target instanceof Element ? event.target : null),
    })
  }

  const handleFocusOut = (event: FocusEvent) => {
    logFocus("focusout", {
      target: describeElement(event.target instanceof Element ? event.target : null),
      relatedTarget: describeElement(event.relatedTarget instanceof Element ? event.relatedTarget : null),
      activeElement: describeElement(deepActiveElement()),
      editable: isEditableTarget(event.target instanceof Element ? event.target : null),
    })
  }

  const handleMouseDown = (event: MouseEvent) => {
    const bodyStyle = typeof document !== "undefined" ? document.body.style : undefined
    const hit =
      typeof document !== "undefined" ? describeElement(document.elementFromPoint(event.clientX, event.clientY)) : null

    logFocus("mousedown", {
      target: describeElement(event.target instanceof Element ? event.target : null),
      hit,
      bodyPointerEvents: bodyStyle?.pointerEvents || undefined,
      bodyUserSelect: bodyStyle?.userSelect || undefined,
      bodyCursor: bodyStyle?.cursor || undefined,
      bodyOverflow: bodyStyle?.overflow || undefined,
      defaultPrevented: event.defaultPrevented,
      path: event
        .composedPath()
        .slice(0, 8)
        .map((el) => (el instanceof HTMLElement ? describeElement(el) : null))
        .filter(Boolean),
    })
  }

  window.addEventListener("focusin", handleFocusIn, true)
  window.addEventListener("focusout", handleFocusOut, true)
  window.addEventListener("mousedown", handleMouseDown, true)

  const nativeFocus = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function focus(this: HTMLElement, options?: FocusOptions) {
    const before = deepActiveElement()
    nativeFocus.call(this, options)
    const after = deepActiveElement()
    logFocus("programmatic", {
      target: describeElement(this),
      options,
      activeBefore: describeElement(before),
      activeAfter: describeElement(after),
      succeeded: after === this,
      stack: new Error().stack?.split("\n").slice(2, 8).join("\n"),
    })
  }

  restoreFocus = () => {
    window.removeEventListener("focusin", handleFocusIn, true)
    window.removeEventListener("focusout", handleFocusOut, true)
    window.removeEventListener("mousedown", handleMouseDown, true)
    HTMLElement.prototype.focus = nativeFocus
    installed = false
    restoreFocus = undefined
  }

  logFocus("enabled", { hint: 'localStorage.removeItem("trellis_debug_focus") to disable' })
}

export function uninstallFocusDebug() {
  restoreFocus?.()
}

let inputFocusLogInstalled = false
let removeInputFocusLog: (() => void) | undefined

/** Logs to the console whenever an input field gains or loses focus (always on). */
export function installInputFocusLog() {
  if (inputFocusLogInstalled || typeof window === "undefined") return
  inputFocusLogInstalled = true

  const logInputFocus = (kind: "focus" | "blur", event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!isInputFieldTarget(target)) return
    const related = event.relatedTarget instanceof Element ? event.relatedTarget : null
    // console.log("[input-focus]", {
    //   at: new Date().toISOString(),
    //   event: kind,
    //   target: describeElement(target),
    //   relatedTarget: describeElement(related),
    // })
  }

  const handleFocusIn = (event: FocusEvent) => logInputFocus("focus", event)
  const handleFocusOut = (event: FocusEvent) => logInputFocus("blur", event)

  const handlePointerDown = (event: PointerEvent) => {
    const bodyStyle = document.body.style
    const hitEl = document.elementFromPoint(event.clientX, event.clientY)
    const directField = inputFieldTarget(hitEl)
    const stackedField = inputFieldFromStack(event.clientX, event.clientY)
    const recoveryField = recoverableInputAtPoint(event.clientX, event.clientY)
    const hit = describeElement(hitEl)
    const hitIsInput = !!directField
    // console.log("[input-focus]", {
    //   at: new Date().toISOString(),
    //   event: "pointerdown",
    //   bodyPointerEvents: bodyStyle.pointerEvents || undefined,
    //   bodyUserSelect: bodyStyle.userSelect || undefined,
    //   bodyCursor: bodyStyle.cursor || undefined,
    //   bodyOverflow: bodyStyle.overflow || undefined,
    //   target: describeElement(event.target instanceof Element ? event.target : null),
    //   hit,
    //   hitIsInput,
    //   stackedInput: describeElement(stackedField),
    //   recoveryInput: describeElement(recoveryField),
    //   inertAncestor: inertAncestor(hitEl),
    //   activeElement: describeElement(deepActiveElement()),
    //   defaultPrevented: event.defaultPrevented,
    //   stack: elementsAtPoint(event.clientX, event.clientY)
    //     .slice(0, 8)
    //     .map((el) => describeElement(el)),
    // })
    if (recoveryField) {
      requestAnimationFrame(() => {
        const active = deepActiveElement()
        if (active === recoveryField || (active instanceof Node && recoveryField.contains(active))) return
        focusInputAtPoint(event.clientX, event.clientY)
      })
    }
  }

  window.addEventListener("focusin", handleFocusIn, true)
  window.addEventListener("focusout", handleFocusOut, true)
  window.addEventListener("pointerdown", handlePointerDown, true)
  removeInputFocusLog = () => {
    window.removeEventListener("focusin", handleFocusIn, true)
    window.removeEventListener("focusout", handleFocusOut, true)
    window.removeEventListener("pointerdown", handlePointerDown, true)
    inputFocusLogInstalled = false
    removeInputFocusLog = undefined
  }
}

export function uninstallInputFocusLog() {
  removeInputFocusLog?.()
}

import { describe, expect, test } from "bun:test"
import { ensureBodyInteractionStyles, ensureBodyPointerEvents, hasBlockingOverlay } from "./pointer-events-guard"

describe("pointer-events-guard", () => {
  test("restores body pointer events when no overlay is open", () => {
    document.body.style.pointerEvents = "none"
    expect(ensureBodyPointerEvents()).toBe(true)
    expect(document.body.style.pointerEvents).toBe("")
  })

  test("does not restore while a dialog overlay is expanded", () => {
    const overlay = document.createElement("div")
    overlay.setAttribute("data-component", "dialog-overlay")
    overlay.setAttribute("data-expanded", "")
    document.body.appendChild(overlay)
    document.body.style.pointerEvents = "none"

    expect(hasBlockingOverlay()).toBe(true)
    expect(ensureBodyPointerEvents()).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")

    overlay.remove()
    document.body.style.pointerEvents = ""
  })

  test("restores stale drag interaction styles", () => {
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    document.body.style.overflow = "hidden"

    expect(ensureBodyInteractionStyles()).toBe(true)
    expect(document.body.style.userSelect).toBe("")
    expect(document.body.style.cursor).toBe("")
    expect(document.body.style.overflow).toBe("")
  })

  test("keeps body overflow while a blocking overlay is open", () => {
    const overlay = document.createElement("div")
    overlay.setAttribute("data-component", "dialog-overlay")
    document.body.appendChild(overlay)
    document.body.style.overflow = "hidden"

    expect(ensureBodyInteractionStyles()).toBe(false)
    expect(document.body.style.overflow).toBe("hidden")

    overlay.remove()
    document.body.style.overflow = ""
  })
})

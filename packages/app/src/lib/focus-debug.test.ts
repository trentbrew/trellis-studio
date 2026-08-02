import { afterEach, describe, expect, test } from "bun:test"
import { focusInputAtPoint } from "./focus-debug"

const originalElementFromPoint = document.elementFromPoint
const originalElementsFromPoint = document.elementsFromPoint

const setPointElements = (hit: Element | null, stack: Element[]) => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => hit,
  })
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => stack,
  })
}

afterEach(() => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: originalElementFromPoint,
  })
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: originalElementsFromPoint,
  })
  document.body.replaceChildren()
})

describe("focusInputAtPoint", () => {
  test("focuses an input hidden below a non-interactive overlay in the hit-test stack", () => {
    const input = document.createElement("input")
    const overlay = document.createElement("div")
    document.body.append(input, overlay)
    setPointElements(overlay, [overlay, input])

    expect(focusInputAtPoint(10, 10)).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  test("focuses the prompt editor when a non-interactive overlay covers its rectangle", () => {
    const editor = document.createElement("div")
    const overlay = document.createElement("div")
    editor.setAttribute("data-component", "prompt-input")
    editor.setAttribute("contenteditable", "true")
    editor.tabIndex = 0
    editor.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.append(editor, overlay)
    setPointElements(overlay, [overlay])

    expect(focusInputAtPoint(10, 10)).toBe(true)
    expect(document.activeElement).toBe(editor)
  })

  test("does not bypass an interactive hit target", () => {
    const editor = document.createElement("div")
    const button = document.createElement("button")
    editor.setAttribute("data-component", "prompt-input")
    editor.setAttribute("contenteditable", "true")
    editor.tabIndex = 0
    editor.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.append(editor, button)
    setPointElements(button, [button])

    expect(focusInputAtPoint(10, 10)).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })
})

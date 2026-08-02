import { describe, expect, test } from "bun:test"
import { fitTextElement, measureExcalidrawText, normalizeTextElements } from "./text-layout"

describe("text-layout", () => {
  test("measureExcalidrawText grows with line count", () => {
    const one = measureExcalidrawText("hello", 20, 5, 1.25)
    const three = measureExcalidrawText(
      "a longer first line\nsecond line here\nthird line here",
      20,
      5,
      1.25,
    )
    expect(three.height).toBeGreaterThan(one.height)
    expect(three.width).toBeGreaterThan(one.width)
  })

  test("fitTextElement expands undersized autoResize text", () => {
    const haiku = "Code flows in the night,\nLogic blooms in silent screens,\nBuilding worlds with light."
    const el = fitTextElement({
      id: "t1",
      type: "text",
      text: haiku,
      fontSize: 20,
      lineHeight: 1.25,
      autoResize: true,
      width: 80,
      height: 30,
      x: 0,
      y: 0,
    })
    expect(el.width as number).toBeGreaterThan(80)
    expect(el.height as number).toBeGreaterThan(30)
  })

  test("fitTextElement skips fixed-size text", () => {
    const el = fitTextElement({
      type: "text",
      autoResize: false,
      text: "long text that should not resize",
      width: 40,
      height: 20,
    })
    expect(el.width).toBe(40)
    expect(el.height).toBe(20)
  })

  test("normalizeTextElements maps all elements", () => {
    const out = normalizeTextElements([
      { type: "rectangle", width: 10, height: 10 },
      {
        type: "text",
        text: "two\nlines",
        autoResize: true,
        width: 10,
        height: 10,
        fontSize: 20,
      },
    ])
    expect(out[0]?.type).toBe("rectangle")
    expect(out[1]?.height as number).toBeGreaterThan(10)
  })
})

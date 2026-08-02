import { describe, expect, test } from "bun:test"
import {
  boundsForElements,
  resolveMermaidPlacement,
  suggestNextMermaidPosition,
  suggestReadabilityScale,
} from "./layout"

describe("layout", () => {
  test("suggestNextMermaidPosition stacks below existing content", () => {
    const existing = boundsForElements([
      { type: "rectangle", x: 0, y: 0, width: 400, height: 300, isDeleted: false },
    ])
    const slot = suggestNextMermaidPosition(existing)
    expect(slot.y).toBeGreaterThan(300)
    expect(slot.x).toBe(80)
  })

  test("resolveMermaidPlacement moves default-origin groups below occupied area", () => {
    const occupied = boundsForElements([
      { type: "rectangle", x: 100, y: 100, width: 200, height: 100, isDeleted: false },
    ])
    const placeholder = { type: "rectangle", x: 0, y: 0, width: 360, height: 220 }
    const group = [
      { type: "rectangle", x: 0, y: 0, width: 80, height: 40, isDeleted: false },
      { type: "rectangle", x: 0, y: 60, width: 80, height: 40, isDeleted: false },
    ]
    const { elements } = resolveMermaidPlacement(placeholder, group, occupied)
    const placed = boundsForElements(elements)
    expect(placed!.minY).toBeGreaterThan(occupied!.maxY)
  })

  test("suggestReadabilityScale increases with element count", () => {
    expect(suggestReadabilityScale(10)).toBe(1)
    expect(suggestReadabilityScale(20)).toBeGreaterThan(1)
    expect(suggestReadabilityScale(50)).toBeGreaterThan(suggestReadabilityScale(20))
  })
})

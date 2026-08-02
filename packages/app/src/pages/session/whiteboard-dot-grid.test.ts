import { describe, expect, test } from "bun:test"
import { resolveDotGridLod } from "./whiteboard-dot-grid"

describe("resolveDotGridLod", () => {
  const gridSize = 20

  test("full density at 100% zoom", () => {
    const lod = resolveDotGridLod(1, gridSize)
    expect(lod.visible).toBe(true)
    expect(lod.drawStep).toBe(20)
    expect(lod.opacity).toBe(1)
  })

  test("coarsens spacing at 19% zoom", () => {
    const lod = resolveDotGridLod(0.19, gridSize)
    expect(lod.visible).toBe(true)
    expect(lod.drawStep).toBeGreaterThan(20)
    expect(lod.drawStep * 0.19).toBeGreaterThanOrEqual(28)
  })

  test("hides at extreme zoom out", () => {
    const lod = resolveDotGridLod(0.03, gridSize)
    expect(lod.visible).toBe(false)
  })
})

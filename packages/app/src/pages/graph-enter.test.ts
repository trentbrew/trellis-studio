import { describe, expect, test } from "bun:test"
import { graphDiff, mergeSimNodes, spawnScale, type SimNode } from "./graph-shared"

describe("graphDiff", () => {
  test("classifies enter update exit", () => {
    const d = graphDiff(["a", "b"], ["b", "c"])
    expect(d.enter).toEqual(["c"])
    expect(d.update).toEqual(["b"])
    expect(d.exit).toEqual(["a"])
  })

  test("empty prev treats all as enter", () => {
    const d = graphDiff([], ["x", "y"])
    expect(d.enter).toEqual(["x", "y"])
    expect(d.update).toEqual([])
    expect(d.exit).toEqual([])
  })
})

describe("mergeSimNodes", () => {
  test("keeps sim x y for surviving ids", () => {
    const prev = [{ id: "a", type: "issue", label: "A", x: 10, y: 20, vx: 1, vy: 2 }] as SimNode[]
    const next = [
      { id: "a", type: "issue", label: "A2", fresh: true },
      { id: "b", type: "file", label: "B" },
    ] as SimNode[]
    const m = mergeSimNodes(prev, next)
    expect(m.enter).toEqual(["b"])
    expect(m.exit).toEqual([])
    expect(m.update).toEqual(["a"])
    expect(m.nodes[0].x).toBe(10)
    expect(m.nodes[0].y).toBe(20)
    expect(m.nodes[0].vx).toBe(1)
    expect(m.nodes[0].label).toBe("A2")
    expect(m.nodes[0].fresh).toBe(true)
    expect(m.nodes[1].id).toBe("b")
  })
})

describe("spawnScale", () => {
  test("reduced motion is identity", () => {
    expect(spawnScale(0, true)).toBe(1)
    expect(spawnScale(300, true)).toBe(1)
  })

  test("eases from 0.18 to 1", () => {
    expect(spawnScale(0, false)).toBeCloseTo(0.18)
    expect(spawnScale(300, false)).toBeCloseTo(1)
  })
})

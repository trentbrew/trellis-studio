import { describe, expect, test } from "bun:test"
import { repairElementIndices } from "./indices"

describe("repairElementIndices", () => {
  test("places bound table text after its row container and re-keys", () => {
    const row = { id: "row0", type: "rectangle", index: "aP" }
    const cell = {
      id: "cell0",
      type: "text",
      containerId: "row0",
      index: "aM",
      text: "A",
    }
    const repaired = repairElementIndices([cell, row])
    expect(repaired.find((el) => el.id === "row0")?.index).toBe("a0")
    expect(repaired.find((el) => el.id === "cell0")?.index).toBe("a1")
    const rowIdx = repaired.findIndex((el) => el.id === "row0")
    const cellIdx = repaired.findIndex((el) => el.id === "cell0")
    expect(cellIdx).toBeGreaterThan(rowIdx)
  })

  test("keeps deleted elements at the end", () => {
    const live = { id: "a", type: "rectangle", index: "a0" }
    const dead = { id: "b", type: "rectangle", index: "a1", isDeleted: true }
    const repaired = repairElementIndices([live, dead])
    expect(repaired).toHaveLength(2)
    expect(repaired[1]?.isDeleted).toBe(true)
  })

  test("re-keys deleted elements with invalid indices", () => {
    const live = { id: "a", type: "rectangle", index: "a0" }
    const dead = { id: "b", type: "rectangle", index: "be", isDeleted: true }
    const repaired = repairElementIndices([live, dead])
    expect(repaired[0]?.index).toBe("a0")
    expect(repaired[1]?.index).toBe("a1")
    expect(repaired[1]?.isDeleted).toBe(true)
  })
})

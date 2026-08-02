import { describe, expect, test } from "bun:test"
import { typeDeleteImpact } from "./type-delete-dialog"

describe("typeDeleteImpact", () => {
  test("counts entities, facts, and links for a type", () => {
    const store = {
      entities: [
        { id: "a:1", type: "Asset" },
        { id: "a:2", type: "Asset" },
        { id: "b:1", type: "Book" },
      ],
      facts: [
        { e: "a:1", a: "title", v: "One" },
        { e: "a:1", a: "color", v: "#fff" },
        { e: "a:2", a: "title", v: "Two" },
        { e: "b:1", a: "title", v: "Other" },
      ],
      links: [
        { e1: "a:1", e2: "b:1", a: "relates" },
        { e1: "c:9", e2: "a:2", a: "relates" },
      ],
    }

    const impact = typeDeleteImpact("Asset", { label: "Asset", color: "#000", icon: "box" }, true, store as never)

    expect(impact.entities).toBe(2)
    expect(impact.facts).toBe(3)
    expect(impact.outbound).toBe(1)
    expect(impact.inbound).toBe(1)
    expect(impact.links).toBe(2)
    expect(impact.hasSchema).toBe(true)
  })
})

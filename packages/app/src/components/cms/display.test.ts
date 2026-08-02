import { describe, expect, test } from "bun:test"
import { buildEntityLabelIndex, resolveEntityLabel } from "./display"

describe("entity display labels", () => {
  test("buildEntityLabelIndex prefers name over title", () => {
    const index = buildEntityLabelIndex([
      { e: "person:1", a: "title", v: "Dr. Smith" },
      { e: "person:1", a: "name", v: "Matthew Manning" },
    ])
    expect(index.get("person:1")).toBe("Matthew Manning")
  })

  test("resolveEntityLabel uses explicit label then index then id suffix", () => {
    const labels = new Map([["person:1", "From facts"]])
    expect(resolveEntityLabel("person:1", { label: "Matthew Manning" })).toBe("Matthew Manning")
    expect(resolveEntityLabel("person:1", { labels })).toBe("From facts")
    expect(resolveEntityLabel("person:abc")).toBe("abc")
  })
})

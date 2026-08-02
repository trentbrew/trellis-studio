import { describe, expect, test } from "bun:test"
import { resolveSchemaId } from "./schema-id"

describe("resolveSchemaId", () => {
  test("prefers TypeSchema entity id from entities list", () => {
    const id = resolveSchemaId(
      "projectbrandconfig",
      [{ id: "schema:ProjectBrandConfig", type: "TypeSchema" }],
      [],
    )
    expect(id).toBe("schema:ProjectBrandConfig")
  })

  test("falls back to schema:key when no TypeSchema exists", () => {
    const id = resolveSchemaId("notes", [], [])
    expect(id).toBe("schema:notes")
  })

  test("finds schema from facts when entities list is stale", () => {
    const id = resolveSchemaId(
      "bookmark",
      [],
      [{ e: "schema:bookmark", a: "type", v: "TypeSchema" }],
    )
    expect(id).toBe("schema:bookmark")
  })
})

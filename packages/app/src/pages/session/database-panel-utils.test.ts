import { describe, expect, test } from "bun:test"
import {
  SYSTEM_TYPES,
  customProps,
  customSchema,
  entityTypeKey,
  graphTypeKey,
  lockedProp,
  matchesType,
  mergeOntologies,
  sortPropDefs,
  systemSchema,
  typeKey,
  visibleEntity,
} from "./database-panel-utils"

describe("database-panel-utils", () => {
  test("lockedProp marks audit and identity fields", () => {
    expect(lockedProp("type")).toBe(true)
    expect(lockedProp("createdAt")).toBe(true)
    expect(lockedProp("updatedAt")).toBe(true)
    expect(lockedProp("id")).toBe(true)
    expect(lockedProp("title")).toBe(false)
  })

  test("sortPropDefs puts locked fields first", () => {
    const sorted = sortPropDefs([
      { key: "title", label: "Title", type: "text" },
      { key: "updatedAt", label: "Updated", type: "date" },
      { key: "type", label: "Type", type: "text", required: true },
      { key: "createdAt", label: "Created", type: "date" },
    ])
    expect(sorted.map((d) => d.key)).toEqual(["type", "createdAt", "updatedAt", "title"])
  })

  test("merges inferred entity types with explicit schemas", () => {
    const result = mergeOntologies(
      [
        { id: "character:naruto", type: "Character" },
        { id: "village:leaf", type: "Village" },
      ],
      {
        village: [{ key: "region", label: "Region", type: "text" }],
        team: [{ key: "lead", label: "Lead", type: "text" }],
      },
    )

    expect(result).toEqual({
      character: [],
      village: [{ key: "region", label: "Region", type: "text" }],
      team: [{ key: "lead", label: "Lead", type: "text" }],
    })
  })

  test("filters hidden trellis entities from inferred ontologies", () => {
    const result = mergeOntologies(
      [
        { id: "schema:character", type: "TypeSchema" },
        { id: "issue:TRL-1", type: "Issue" },
        { id: "character:naruto", type: "Character" },
      ],
      {},
    )

    expect(result).toEqual({ character: [] })
    expect(visibleEntity({ id: "character:naruto", type: "Character" })).toBe(true)
    expect(visibleEntity({ id: "issue:TRL-1", type: "Issue" })).toBe(false)
  })

  test("normalizes type keys consistently", () => {
    expect(typeKey(" Character ")).toBe("character")
  })

  test("matches normalized sidebar type keys to raw store and graph types", () => {
    expect(entityTypeKey("Phase")).toBe("phase")
    expect(entityTypeKey("FileNode")).toBe("file")
    expect(entityTypeKey("FileNode", "file:notes/plan.whiteboard")).toBe("whiteboard")
    expect(entityTypeKey("Whiteboard")).toBe("whiteboard")
    expect(matchesType("Phase", "phase")).toBe(true)
    expect(matchesType("FileNode", "file")).toBe(true)
    expect(graphTypeKey("Phase")).toBe("Phase")
    expect(graphTypeKey("WorkUnit")).toBe("workunit")
    expect(graphTypeKey("FileNode", "file:notes/plan.whiteboard")).toBe("whiteboard")
  })

  test("keeps project ontology templates editable and themed", () => {
    expect(systemSchema("Phase")).toBeUndefined()
    expect(SYSTEM_TYPES).not.toContain("phase")
    expect(customSchema("Phase")?.map((prop) => prop.key)).toEqual([
      "type",
      "color",
      "icon",
      "body",
      "title",
      "description",
      "context",
    ])
  })

  test("adds color and icon fields to inferred custom schemas", () => {
    expect(customProps("Character", [{ key: "name", label: "Name", type: "text" }]).map((prop) => prop.key)).toEqual([
      "color",
      "icon",
      "body",
      "name",
    ])
  })
})

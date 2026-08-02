import { describe, expect, test } from "bun:test"
import { configuredCustomProjections, parseCustomProjection } from "./custom"
import { defaultProjectionPins, normalizeProjectionWorkspaceType, projectionWorkspaceTypeFromConfig } from "./defaults"
import { allProjections, getProjection, listProjections } from "./registry"
import { normalizeProjectionPins } from "./pins"

const sampleCustom = {
  id: "my-tickets",
  label: "My tickets",
  description: "Support tickets for this workspace.",
  layout: "table",
  icon: "records",
  query: { kind: "cms", collections: ["tickets"], match: "exact" },
  create: { label: "New ticket", collection: "tickets" },
} as const

describe("custom projections", () => {
  test("parses workspace custom affordance", () => {
    const parsed = parseCustomProjection(sampleCustom)
    expect(parsed?.id).toBe("my-tickets")
    expect(parsed?.source).toBe("workspace")
    expect(parsed?.layout).toBe("table")
  })

  test("rejects builtin id collisions", () => {
    expect(parseCustomProjection({ ...sampleCustom, id: "notes" })).toBeUndefined()
  })

  test("rejects bespoke-only layouts for workspace source", () => {
    expect(parseCustomProjection({ ...sampleCustom, id: "my-clock", layout: "utility" })).toBeUndefined()
  })

  test("reads projections.custom from config", () => {
    const custom = configuredCustomProjections({
      projections: { custom: [sampleCustom, { id: "notes", label: "Bad", layout: "table", icon: "notes", query: {} }] },
    })
    expect(custom).toHaveLength(1)
    expect(custom[0]?.id).toBe("my-tickets")
  })
})

describe("projection registry", () => {
  test("resolves notes projection", () => {
    const notes = getProjection("notes")
    expect(notes?.id).toBe("notes")
    expect(notes?.layout).toBe("cards")
    expect(notes?.source).toBe("builtin")
  })

  test("resolves whiteboards projection", () => {
    const whiteboards = getProjection("whiteboards")
    expect(whiteboards?.layout).toBe("canvas")
    expect(whiteboards?.query).toEqual({ kind: "files", extensions: [".whiteboard"] })
  })

  test("resolves calendar projection", () => {
    const calendar = getProjection("calendar")
    expect(calendar?.layout).toBe("calendar")
    expect(calendar?.query).toEqual({ kind: "trellis", view: "calendar" })
  })

  test("resolves clock utility projection", () => {
    const clock = getProjection("clock")
    expect(clock?.layout).toBe("utility")
    expect(clock?.query).toEqual({ kind: "store", type: "clock" })
  })

  test("ignores unknown pin ids", () => {
    expect(listProjections(["notes", "missing"])).toHaveLength(1)
  })

  test("includes domain projection stubs", () => {
    expect(getProjection("levels")?.stub).toBe(true)
    expect(getProjection("scenes")?.layout).toBe("list")
    expect(getProjection("audio")?.domain).toBe("audio")
    expect(allProjections().length).toBeGreaterThan(10)
  })

  test("merges workspace custom affordances", () => {
    const custom = configuredCustomProjections({ projections: { custom: [sampleCustom] } })
    expect(getProjection("my-tickets", custom)?.source).toBe("workspace")
    expect(allProjections(custom).some((entry) => entry.id === "my-tickets")).toBe(true)
    expect(listProjections(["notes", "my-tickets"], custom).map((entry) => entry.id)).toEqual([
      "notes",
      "my-tickets",
    ])
  })
})

describe("projection pins", () => {
  test("defaults to whiteboards when empty", () => {
    expect(normalizeProjectionPins([])).toEqual(["whiteboards"])
  })

  test("caps pin count", () => {
    expect(normalizeProjectionPins(["a", "b", "c", "d", "e", "f", "g", "h", "i"])).toHaveLength(8)
  })
})

describe("projection defaults", () => {
  test("resolves canonical workspace defaults", () => {
    expect(defaultProjectionPins("app")).toEqual(["whiteboards", "calendar", "journal", "cron", "records", "content"])
    expect(defaultProjectionPins("all")).toEqual(["whiteboards", "calendar", "journal", "cron"])
    expect(defaultProjectionPins("game")).toEqual([
      "whiteboards",
      "calendar",
      "journal",
      "cron",
      "levels",
      "entities",
      "media",
    ])
    expect(defaultProjectionPins("video")).toEqual([
      "whiteboards",
      "calendar",
      "journal",
      "cron",
      "scenes",
      "scripts",
      "media",
    ])
  })

  test("normalizes workspace aliases", () => {
    expect(normalizeProjectionWorkspaceType("game dev")).toBe("game")
    expect(normalizeProjectionWorkspaceType("DAW")).toBe("audio")
    expect(normalizeProjectionWorkspaceType("video_editing")).toBe("video")
  })

  test("reads workspace type from config", () => {
    expect(projectionWorkspaceTypeFromConfig({ projections: { workspaceType: "productivity" } })).toBe("productivity")
  })
})

import { describe, expect, test } from "bun:test"
import {
  defaultTab,
  entityAdapter,
  inspectorSections,
  registerEntityAdapter,
  resolveMeta,
  resolveSubtitle,
  resolveTitle,
  tabItems,
  TAB_ITEMS,
} from "./adapters"

describe("entityAdapter", () => {
  test("file and directory lead with preview", () => {
    expect(entityAdapter("file").defaultTab).toBe("preview")
    expect(entityAdapter("directory").inspector).toEqual(["preview", "details", "activity"])
  })

  test("unknown and undefined types use the default adapter", () => {
    expect(entityAdapter("issue").defaultTab).toBe("details")
    expect(entityAdapter(undefined).inspector).toEqual(["details", "activity"])
  })
})

describe("inspectorSections", () => {
  test("split layout strips the preview section", () => {
    expect(inspectorSections("file", "split")).toEqual(["details", "activity"])
    expect(inspectorSections("file", "panel")).toEqual(["preview", "details", "activity"])
  })

  test("generic types are unchanged across layouts", () => {
    expect(inspectorSections("issue", "split")).toEqual(["details", "activity"])
    expect(inspectorSections("issue", "panel")).toEqual(["details", "activity"])
  })
})

describe("defaultTab", () => {
  test("falls back to the first available section when the preferred is stripped", () => {
    expect(defaultTab("file", "panel")).toBe("preview")
    expect(defaultTab("file", "split")).toBe("details")
  })

  test("generic types default to details", () => {
    expect(defaultTab("person", "split")).toBe("details")
  })
})

describe("tabItems", () => {
  test("resolves section ids to canonical tab metadata", () => {
    expect(tabItems(["details", "activity"])).toEqual([TAB_ITEMS.details, TAB_ITEMS.activity])
  })
})

describe("registerEntityAdapter", () => {
  test("registers and overrides per-type behavior", () => {
    registerEntityAdapter("widget", { inspector: ["details", "decisions"], defaultTab: "decisions" })
    expect(entityAdapter("widget").defaultTab).toBe("decisions")
    expect(inspectorSections("widget", "panel")).toEqual(["details", "decisions"])
  })
})

describe("resolveTitle", () => {
  test("generic types fall through the title key priority", () => {
    expect(resolveTitle({ id: "issue:1", type: "issue", facts: [{ a: "title", v: "Fix bug" }] })).toBe("Fix bug")
    expect(resolveTitle({ id: "person:jane", type: "person", facts: [{ a: "name", v: "Jane" }] })).toBe("Jane")
  })

  test("file/directory titles use the path leaf regardless of facts", () => {
    expect(resolveTitle({ id: "file:src/a/b.ts", type: "file", facts: [{ a: "title", v: "ignored" }] })).toBe("b.ts")
    expect(resolveTitle({ id: "directory:src/a", type: "directory", facts: [] })).toBe("a")
  })

  test("falls back to the id leaf when no title fact exists", () => {
    expect(resolveTitle({ id: "thing:42", type: "thing", facts: [] })).toBe("42")
  })

  test("skips empty/whitespace title facts", () => {
    expect(
      resolveTitle({
        id: "x:1",
        type: "x",
        facts: [
          { a: "title", v: "  " },
          { a: "name", v: "Real" },
        ],
      }),
    ).toBe("Real")
  })
})

describe("resolveSubtitle / resolveMeta", () => {
  test("subtitle uses the description key priority", () => {
    expect(resolveSubtitle({ id: "x:1", type: "x", facts: [{ a: "summary", v: "A summary" }] })).toBe("A summary")
  })

  test("subtitle and meta are undefined without matching facts", () => {
    expect(resolveSubtitle({ id: "x:1", type: "x", facts: [] })).toBeUndefined()
    expect(resolveMeta({ id: "x:1", type: "x", facts: [{ a: "title", v: "T" }] })).toBeUndefined()
  })
})

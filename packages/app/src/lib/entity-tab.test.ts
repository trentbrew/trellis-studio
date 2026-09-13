import { describe, expect, test } from "bun:test"
import {
  entityTab,
  idFromEntityTab,
  isEntityTab,
  shellOpensAsTab,
  typeFromEntityId,
} from "./entity-tab"

describe("entityTab", () => {
  test("round-trips ids with colons", () => {
    const tab = entityTab("project:rox-interview")
    expect(tab).toBe("entity://project%3Arox-interview")
    expect(isEntityTab(tab)).toBe(true)
    expect(idFromEntityTab(tab)).toBe("project:rox-interview")
  })

  test("rejects file tabs", () => {
    expect(isEntityTab("file://README.md")).toBe(false)
    expect(idFromEntityTab("file://README.md")).toBeUndefined()
  })

  test("typeFromEntityId uses namespace", () => {
    expect(typeFromEntityId("artifact:jd")).toBe("artifact")
    expect(typeFromEntityId("orphan")).toBe("entity")
  })

  test("shellOpensAsTab for document and container only", () => {
    expect(shellOpensAsTab("project")).toBe(true)
    expect(shellOpensAsTab("artifact")).toBe(true)
    expect(shellOpensAsTab("person")).toBe(false)
    expect(shellOpensAsTab("issue")).toBe(false)
    expect(shellOpensAsTab("note")).toBe(false)
  })
})

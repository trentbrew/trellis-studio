import { describe, expect, test } from "bun:test"
import { entityShellClass, SHELL_SIZE } from "./entity-shell"

describe("entityShellClass", () => {
  test("maps known families", () => {
    expect(entityShellClass("person")).toBe("actor")
    expect(entityShellClass("project")).toBe("container")
    expect(entityShellClass("issue")).toBe("temporal")
    expect(entityShellClass("artifact")).toBe("document")
  })

  test("has sizes for each shell", () => {
    for (const shell of ["actor", "container", "temporal", "document"] as const) {
      expect(SHELL_SIZE[shell].w).toBeGreaterThan(500)
    }
  })
})

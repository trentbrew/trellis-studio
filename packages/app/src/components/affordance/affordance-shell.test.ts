import { describe, expect, test } from "bun:test"

describe("AffordanceShell", () => {
  test("exports compositor from affordance module", async () => {
    const mod = await import("@/components/affordance")
    expect(typeof mod.AffordanceShell).toBe("function")
    expect(typeof mod.ComingSoonAffordance).toBe("function")
  })
})

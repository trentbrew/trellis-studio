import { describe, expect, test } from "bun:test"
import z from "zod"
import { SchemaKit } from "../../src/tool/schema-kit"

describe("SchemaKit", () => {
  test("boolish coerces string/number forms", () => {
    for (const v of ["true", "1", "yes", "on", 1, true]) expect(SchemaKit.boolish.parse(v)).toBe(true)
    for (const v of ["false", "0", "no", "off", 0, false]) expect(SchemaKit.boolish.parse(v)).toBe(false)
  })

  test("boolishOptional treats null/empty as omitted", () => {
    expect(SchemaKit.boolishOptional.parse(null)).toBeUndefined()
    expect(SchemaKit.boolishOptional.parse("")).toBeUndefined()
    expect(SchemaKit.boolishOptional.parse("YES")).toBe(true)
  })

  test("intish coerces numeric strings, rejects junk", () => {
    expect(SchemaKit.intish.parse("42")).toBe(42)
    expect(SchemaKit.intish.parse(7)).toBe(7)
    expect(() => SchemaKit.intish.parse("not a number")).toThrow()
  })

  test("looseEnum maps case-insensitively and keeps the allowed set on failure", () => {
    const e = SchemaKit.looseEnum(["event", "meeting", "deadline"] as const)
    expect(e.parse("Meeting")).toBe("meeting")
    expect(e.parse("  DEADLINE ")).toBe("deadline")
    try {
      e.parse("party")
      throw new Error("should have thrown")
    } catch (err) {
      const issue = (err as z.ZodError).issues[0] as any
      expect(issue.values).toEqual(["event", "meeting", "deadline"])
    }
  })

  test("optionalNullSafe turns null into undefined", () => {
    const s = SchemaKit.optionalNullSafe(z.string().min(1))
    expect(s.parse(null)).toBeUndefined()
    expect(s.parse(undefined)).toBeUndefined()
    expect(s.parse("hi")).toBe("hi")
  })

  test("dateish accepts YYYY-MM-DD and ISO, rejects garbage", () => {
    expect(SchemaKit.dateish.parse("2026-06-20")).toBe("2026-06-20")
    expect(SchemaKit.dateish.parse("2026-05-27T15:00:00.000Z")).toBe("2026-05-27T15:00:00.000Z")
    expect(() => SchemaKit.dateish.parse("someday")).toThrow()
  })

  test("jsonRule parses strings and validates shape", () => {
    const rule = SchemaKit.jsonRule(z.object({ frequency: z.string() }))
    expect(rule.parse('{"frequency":"weekly"}')).toEqual({ frequency: "weekly" })
    expect(rule.parse({ frequency: "daily" })).toEqual({ frequency: "daily" })
    expect(rule.parse("null")).toBeUndefined()
    expect(rule.parse(undefined)).toBeUndefined()
  })
})

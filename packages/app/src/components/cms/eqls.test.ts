import { describe, expect, test } from "bun:test"
import { buildEqlSuggestions, matchEqlClause, parseEql } from "./eqls"

describe("parseEql", () => {
  test("parses full find/where syntax", () => {
    const parsed = parseEql('find ?e where points >= 200 and difficulty = "easy"')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.clauses).toEqual([
      { attr: "points", op: ">=", val: 200 },
      { attr: "difficulty", op: "=", val: "easy" },
    ])
  })

  test("parses bare clauses without find prefix", () => {
    const parsed = parseEql("cms_status = \"published\"")
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.clauses).toEqual([{ attr: "cms_status", op: "=", val: "published" }])
  })

  test("returns empty clauses for blank input", () => {
    expect(parseEql("")).toEqual({ ok: true, clauses: [] })
    expect(parseEql("find ?e where")).toEqual({ ok: true, clauses: [] })
  })

  test("reports invalid clauses", () => {
    const parsed = parseEql("find ?e where not valid")
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain("Invalid clause")
  })
})

describe("matchEqlClause", () => {
  test("matches numeric comparisons with string values", () => {
    expect(matchEqlClause("250", { attr: "points", op: ">=", val: 200 })).toBe(true)
    expect(matchEqlClause("150", { attr: "points", op: ">=", val: 200 })).toBe(false)
  })

  test("matches contains and booleans", () => {
    expect(matchEqlClause("Hello World", { attr: "name", op: "contains", val: "world" })).toBe(true)
    expect(matchEqlClause(true, { attr: "done", op: "=", val: true })).toBe(true)
    expect(matchEqlClause(false, { attr: "done", op: "=", val: false })).toBe(true)
  })
})

describe("buildEqlSuggestions", () => {
  test("derives suggestions from schema fields", () => {
    const suggestions = buildEqlSuggestions({
      fields: [
        { key: "name", type: "text", label: "Title" },
        { key: "points", type: "number", label: "Points" },
        { key: "difficulty", type: "select", label: "Difficulty", options: ["easy", "hard"] },
      ],
      enumCols: new Map(),
      colKinds: new Map([["points", "number"]]),
      sample: (key) => (key === "name" ? "Example bookmark" : key === "points" ? 120 : undefined),
    })

    expect(suggestions.some((s) => s.query.includes('cms_status = "published"'))).toBe(true)
    expect(suggestions.some((s) => s.query.includes('difficulty = "easy"'))).toBe(true)
    expect(suggestions.some((s) => s.query.includes("points >="))).toBe(true)
    expect(suggestions.some((s) => s.query.includes('name contains "Example bookmark"'))).toBe(true)
  })
})

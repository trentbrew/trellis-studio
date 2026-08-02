import { describe, expect, test } from "bun:test"
import { parseExpr, tokenize } from "./expr"

describe("tokenize", () => {
  test("splits identifiers, dots, and parens", () => {
    const tokens = tokenize("file.name.contains(\"x\")")
    expect(tokens.map((t) => t.value)).toEqual(["file", ".", "name", ".", "contains", "(", "x", ")"])
  })

  test("handles quoted strings with escapes", () => {
    const tokens = tokenize('"a\\"b"')
    expect(tokens).toEqual([{ type: "str", value: 'a"b' }])
  })

  test("recognizes multi-char operators", () => {
    const tokens = tokenize("a == b && c != d")
    const ops = tokens.filter((t) => t.type === "op").map((t) => t.value)
    expect(ops).toEqual(["==", "&&", "!="])
  })

  test("negation prefix !x", () => {
    const tokens = tokenize("!file.name.contains(\"x\")")
    expect(tokens[0]).toEqual({ type: "op", value: "!" })
  })
})

describe("parseExpr", () => {
  test("dotted access becomes nested members", () => {
    const ast = parseExpr("file.name.contains(\"x\")")
    expect(ast.kind).toBe("call")
  })

  test("logical operator precedence", () => {
    const ast = parseExpr("a && b || c")
    // (a && b) || c
    expect(ast.kind).toBe("binary")
    if (ast.kind === "binary") {
      expect(ast.op).toBe("||")
      expect(ast.left.kind).toBe("binary")
    }
  })

  test("parenthesized grouping", () => {
    const ast = parseExpr("(a || b) && c")
    expect(ast.kind).toBe("binary")
    if (ast.kind === "binary") expect(ast.op).toBe("&&")
  })
})

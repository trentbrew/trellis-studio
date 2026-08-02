import { describe, expect, test } from "bun:test"
import { formula } from "./formula"

describe("formula", () => {
  test("evaluates numeric fields and arithmetic precedence", () => {
    expect(formula("{price} * {quantity} + 2", { price: 10, quantity: "3" })).toBe(32)
  })

  test("evaluates bare field identifiers", () => {
    expect(formula("price * quantity + tax", { price: 15, quantity: 4, tax: 6 })).toBe(66)
  })

  test("supports parentheses and unary operators", () => {
    expect(formula("-({a} + {b}) / 2", { a: 4, b: 6 })).toBe(-5)
  })

  test("returns undefined for missing fields and unsafe expressions", () => {
    expect(formula("{missing} + 1", {})).toBeUndefined()
    expect(formula("process.exit()", {})).toBeUndefined()
    expect(formula("1 / 0", {})).toBeUndefined()
  })
})

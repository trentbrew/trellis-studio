import { test, expect } from "bun:test"
import { Cron } from "./expr"

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0)

test("parses five fields, rejects wrong arity", () => {
  expect(Cron.valid("0 9 * * *")).toBe(true)
  expect(Cron.valid("*/5 * * * *")).toBe(true)
  expect(Cron.valid("0 9 * *")).toBe(false)
  expect(Cron.valid("60 9 * * *")).toBe(false)
  expect(Cron.valid("0 9 * * 8")).toBe(false)
})

test("matches: daily at 09:00", () => {
  expect(Cron.matches("0 9 * * *", at(2026, 6, 2, 9, 0))).toBe(true)
  expect(Cron.matches("0 9 * * *", at(2026, 6, 2, 9, 1))).toBe(false)
  expect(Cron.matches("0 9 * * *", at(2026, 6, 2, 8, 0))).toBe(false)
})

test("matches: every 5 minutes", () => {
  expect(Cron.matches("*/5 * * * *", at(2026, 6, 2, 10, 0))).toBe(true)
  expect(Cron.matches("*/5 * * * *", at(2026, 6, 2, 10, 5))).toBe(true)
  expect(Cron.matches("*/5 * * * *", at(2026, 6, 2, 10, 7))).toBe(false)
})

test("matches: ranges and lists", () => {
  expect(Cron.matches("0 9-17 * * *", at(2026, 6, 2, 13, 0))).toBe(true)
  expect(Cron.matches("0 9-17 * * *", at(2026, 6, 2, 18, 0))).toBe(false)
  expect(Cron.matches("0 0 * * 1,3,5", at(2026, 6, 1, 0, 0))).toBe(true) // Monday
  expect(Cron.matches("0 0 * * 1,3,5", at(2026, 6, 2, 0, 0))).toBe(false) // Tuesday
})

test("matches: dom OR dow when both restricted", () => {
  // June 1 2026 is a Monday. Fires on the 15th OR any Monday.
  const expr = "0 0 15 * 1"
  expect(Cron.matches(expr, at(2026, 6, 15, 0, 0))).toBe(true) // the 15th
  expect(Cron.matches(expr, at(2026, 6, 8, 0, 0))).toBe(true) // a Monday
  expect(Cron.matches(expr, at(2026, 6, 9, 0, 0))).toBe(false) // neither
})

test("due: crosses a boundary in the window", () => {
  const from = at(2026, 6, 2, 8, 59)
  const to = at(2026, 6, 2, 9, 0)
  expect(Cron.due("0 9 * * *", from, to)).toBe(true)
  // window before the boundary
  expect(Cron.due("0 9 * * *", at(2026, 6, 2, 8, 30), at(2026, 6, 2, 8, 58))).toBe(false)
})

test("due: is half-open on the left (does not refire the same minute)", () => {
  const exact = at(2026, 6, 2, 9, 0)
  expect(Cron.due("0 9 * * *", exact, exact)).toBe(false)
})

test("next: computes the upcoming fire", () => {
  const n = Cron.next("0 9 * * *", at(2026, 6, 2, 10, 0))
  expect(n?.getDate()).toBe(3)
  expect(n?.getHours()).toBe(9)
  expect(n?.getMinutes()).toBe(0)
})

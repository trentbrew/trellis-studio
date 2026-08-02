import { describe, expect, test } from "bun:test"
import { droppedStoreFactsMessage, sanitizeStoreFacts } from "./store-facts"

describe("sanitizeStoreFacts", () => {
  test("keeps primitive facts", () => {
    expect(
      sanitizeStoreFacts([
        { e: "schema:x", a: "label", v: "Name" },
        { e: "schema:x", a: "cms", v: true },
        { e: "field:x.y", a: "order", v: 0 },
      ]),
    ).toEqual([
      { e: "schema:x", a: "label", v: "Name" },
      { e: "schema:x", a: "cms", v: true },
      { e: "field:x.y", a: "order", v: 0 },
    ])
  })

  test("drops facts with missing or invalid values", () => {
    expect(
      sanitizeStoreFacts([
        { e: "schema:x", a: "label", v: undefined as unknown as string },
        { e: "schema:x", a: "props", v: null as unknown as string },
        { e: "schema:x", a: "bad", v: { x: 1 } as unknown as string },
        { e: "schema:x", a: "nan", v: Number.NaN },
      ]),
    ).toEqual([])
  })

  test("droppedStoreFactsMessage explains when all facts were removed", () => {
    expect(droppedStoreFactsMessage(2, 0)).toMatch(/invalid/)
    expect(droppedStoreFactsMessage(0, 0)).toBeUndefined()
    expect(droppedStoreFactsMessage(2, 2)).toBeUndefined()
  })
})

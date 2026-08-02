import { describe, expect, test } from "bun:test"
import { sessionTabListScrollLeft } from "./session-tab-scroll"

describe("sessionTabListScrollLeft", () => {
  test("returns overflow width", () => {
    const el = {
      scrollWidth: 800,
      clientWidth: 300,
      scrollLeft: 0,
    } as HTMLDivElement

    expect(sessionTabListScrollLeft(el)).toBe(500)
  })
})

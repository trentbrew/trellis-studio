import { describe, expect, test } from "bun:test"
import { detect } from "../../src/capture/personal-events"

describe("capture.personal-events.detect", () => {
  test("derives an annual fact from an all-day birthday", () => {
    const fact = detect({ title: "Birthday", startAt: "2026-10-23", allDay: true })
    expect(fact).toBeDefined()
    expect(fact?.title).toBe("Birthday")
    expect(fact?.content).toBe("Birthday is October 23 (annual).")
    expect(fact?.key).toBe("event:Birthday")
  })

  test("keeps the subject from a descriptive title (no collision across people)", () => {
    const mom = detect({ title: "Mom's Birthday", startAt: "2026-03-04", allDay: true })
    const me = detect({ title: "Birthday", startAt: "2026-10-23", allDay: true })
    expect(mom?.key).toBe("event:Mom's Birthday")
    expect(me?.key).toBe("event:Birthday")
    expect(mom?.key).not.toBe(me?.key)
  })

  test("treats a date-only start as all-day even without the flag", () => {
    const fact = detect({ title: "Anniversary", startAt: "2026-06-15" })
    expect(fact?.content).toBe("Anniversary is June 15 (annual).")
  })

  test("strips the year from an ISO datetime", () => {
    const fact = detect({ title: "Birthday", startAt: "2026-10-23T00:00:00.000Z", allDay: true })
    expect(fact?.content).toBe("Birthday is October 23 (annual).")
  })

  test("ignores timed events (one-off, not the durable fact)", () => {
    expect(detect({ title: "Birthday party", startAt: "2026-10-23T18:00:00.000Z" })).toBeUndefined()
  })

  test("ignores non-personal titles", () => {
    expect(detect({ title: "Team offsite", startAt: "2026-10-23", allDay: true })).toBeUndefined()
  })

  test("ignores empty or unparseable dates", () => {
    expect(detect({ title: "Birthday", startAt: "", allDay: true })).toBeUndefined()
    expect(detect({ title: "Birthday", startAt: "not-a-date", allDay: true })).toBeUndefined()
  })
})

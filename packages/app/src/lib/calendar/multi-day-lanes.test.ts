import { describe, expect, test } from "bun:test"
import type { CalendarEventRecord } from "@/lib/calendar/event-model"
import type { CalendarOccurrence } from "@/lib/calendar/event-model"
import {
  daysBetween,
  getMultiDayLanes,
  isMultiDayOccurrence,
  laneSlotsForWeek,
  occurrenceLaneKey,
} from "@/lib/calendar/multi-day-lanes"

function event(id: string): CalendarEventRecord {
  return {
    id,
    title: id,
    description: "",
    startAt: "2026-06-01",
    endAt: "2026-06-01",
    allDay: true,
    color: "default",
    eventType: "event",
    recurrence: "",
    createdAt: "",
    updatedAt: "",
  }
}

function occ(id: string, start: Date, end: Date): CalendarOccurrence {
  return { event: event(id), start, end }
}

function weekStartingJune1(): Date[] {
  // June 2026: Sun May 31 .. Sat Jun 6 if week starts Sunday
  return Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 1 + i))
}

describe("multi-day-lanes", () => {
  test("isMultiDayOccurrence when end calendar day after start", () => {
    const single = occ("a", new Date(2026, 5, 10), new Date(2026, 5, 10, 23, 59))
    const multi = occ("b", new Date(2026, 5, 10), new Date(2026, 5, 12))
    expect(isMultiDayOccurrence(single)).toBe(false)
    expect(isMultiDayOccurrence(multi)).toBe(true)
  })

  test("daysBetween is DST-safe", () => {
    const a = new Date(2026, 5, 1)
    const b = new Date(2026, 5, 8)
    expect(daysBetween(a, b)).toBe(7)
  })

  test("packs non-overlapping events into same lane", () => {
    const days = weekStartingJune1()
    const map = new Map<string, number>()
    const o1 = occ("e1", new Date(2026, 5, 2), new Date(2026, 5, 3))
    const o2 = occ("e2", new Date(2026, 5, 5), new Date(2026, 5, 6))
    const { lanes } = getMultiDayLanes(days, [o1, o2], map, 4)
    expect(lanes).toHaveLength(2)
    expect(lanes[0]!.laneIndex).toBe(0)
    expect(lanes[1]!.laneIndex).toBe(0)
  })

  test("overlapping events use separate lanes", () => {
    const days = weekStartingJune1()
    const map = new Map<string, number>()
    const o1 = occ("e1", new Date(2026, 5, 1), new Date(2026, 5, 4))
    const o2 = occ("e2", new Date(2026, 5, 3), new Date(2026, 5, 5))
    const { lanes } = getMultiDayLanes(days, [o1, o2], map, 4)
    expect(lanes[0]!.laneIndex).not.toBe(lanes[1]!.laneIndex)
  })

  test("globalLaneMap keeps lane across two week rows", () => {
    const week1 = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 1 + i))
    const week2 = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 8 + i))
    const map = new Map<string, number>()
    const span = occ("long", new Date(2026, 5, 1), new Date(2026, 5, 14))
    const { lanes: w1 } = getMultiDayLanes(week1, [span], map, 4)
    const { lanes: w2 } = getMultiDayLanes(week2, [span], map, 4)
    expect(w1[0]!.continuesToNext).toBe(true)
    expect(w2[0]!.continuesFromPrev).toBe(true)
    expect(w1[0]!.laneIndex).toBe(w2[0]!.laneIndex)
  })

  test("laneSlotsForWeek sets wrap flags at week boundaries", () => {
    const days = weekStartingJune1()
    const map = new Map<string, number>()
    const span = occ("long", new Date(2026, 4, 28), new Date(2026, 5, 10))
    const { lanes } = getMultiDayLanes(days, [span], map, 4)
    const byKey = new Map([[occurrenceLaneKey(span), span]])
    const cols = laneSlotsForWeek(days, lanes, byKey)
    const firstCol = cols[0]!.find(Boolean)
    expect(firstCol?.isWrapStart).toBe(true)
    expect(firstCol?.isStart).toBe(false)
  })

  test("overflow lanes increment overflowPerCol", () => {
    const days = weekStartingJune1()
    const map = new Map<string, number>()
    const events = [
      occ("a", new Date(2026, 5, 1), new Date(2026, 5, 7)),
      occ("b", new Date(2026, 5, 1), new Date(2026, 5, 7)),
      occ("c", new Date(2026, 5, 1), new Date(2026, 5, 7)),
    ]
    const { lanes, overflowPerCol } = getMultiDayLanes(days, events, map, 1)
    expect(lanes.length).toBeLessThanOrEqual(1)
    expect(overflowPerCol.some((n) => n > 0)).toBe(true)
  })
})

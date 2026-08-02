import { describe, expect, test } from "bun:test"
import type { CalendarEventRecord, CalendarOccurrence } from "@/lib/calendar/event-model"
import {
  axisTicks,
  buildLanes,
  clampMin,
  DAY_MINUTES,
  formatClock,
  hourWidth,
  labelStep,
  minuteOfDay,
  snap,
  tickMinutes,
} from "@/lib/calendar/epg-timeline"

function event(id: string, type: CalendarEventRecord["eventType"]): CalendarEventRecord {
  return {
    id,
    title: id,
    description: "",
    startAt: "",
    endAt: "",
    allDay: false,
    color: "default",
    eventType: type,
    recurrence: "",
    createdAt: "",
    updatedAt: "",
  }
}

function occ(
  id: string,
  type: CalendarEventRecord["eventType"],
  start: Date,
  end: Date,
  allDay = false,
): CalendarOccurrence {
  return { event: { ...event(id, type), allDay }, start, end }
}

const DAY = new Date(2026, 5, 1)

describe("epg-timeline", () => {
  test("tickMinutes gets finer as zoom increases", () => {
    expect(tickMinutes(100)).toBe(60)
    expect(tickMinutes(160)).toBe(30)
    expect(tickMinutes(260)).toBe(10)
    expect(tickMinutes(400)).toBe(5)
    expect(tickMinutes(800)).toBe(2)
    expect(tickMinutes(2000)).toBe(1)
  })

  test("hourWidth scales linearly with zoom", () => {
    expect(hourWidth(100)).toBe(60)
    expect(hourWidth(200)).toBe(120)
  })

  test("labelStep never produces sub-44px label spacing", () => {
    const step = labelStep(100)
    const tickPx = (hourWidth(100) * step) / 60
    expect(tickPx).toBeGreaterThanOrEqual(44)
  })

  test("minuteOfDay measures minutes from local midnight", () => {
    expect(minuteOfDay(new Date(2026, 5, 1, 9, 30), DAY)).toBe(570)
    expect(minuteOfDay(new Date(2026, 5, 1, 0, 0), DAY)).toBe(0)
  })

  test("clampMin and snap behave", () => {
    expect(clampMin(-10)).toBe(0)
    expect(clampMin(9999)).toBe(DAY_MINUTES)
    expect(snap(67, 15)).toBe(60)
    expect(snap(68, 15)).toBe(75)
  })

  test("formatClock renders 12h labels", () => {
    expect(formatClock(0)).toBe("12AM")
    expect(formatClock(720)).toBe("12PM")
    expect(formatClock(810)).toBe("1:30PM")
    expect(formatClock(DAY_MINUTES)).toBe("12AM")
  })

  test("axisTicks span the day and start at midnight", () => {
    const ticks = axisTicks(100)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks[0]).toMatchObject({ min: 0, left: 0, label: "12AM" })
    expect(ticks.every((t) => t.min < DAY_MINUTES)).toBe(true)
  })

  test("buildLanes groups by type and skips all-day", () => {
    const occurrences = [
      occ("a", "meeting", new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 10)),
      occ("b", "task", new Date(2026, 5, 1, 9, 30), new Date(2026, 5, 1, 11)),
      occ("c", "meeting", new Date(2026, 5, 1, 14), new Date(2026, 5, 1, 15)),
      occ("d", "event", new Date(2026, 5, 1), new Date(2026, 5, 1, 23, 59), true),
    ]
    const lanes = buildLanes(occurrences, DAY)
    const types = lanes.map((l) => l.type)
    expect(types).toContain("meeting")
    expect(types).toContain("task")
    expect(types).not.toContain("event") // all-day excluded
    const meeting = lanes.find((l) => l.type === "meeting")!
    expect(meeting.items.length).toBe(2)
    expect(meeting.subCount).toBe(1) // 9-10 and 14-15 don't overlap
  })

  test("buildLanes stacks overlapping items into sub-rows", () => {
    const occurrences = [
      occ("a", "meeting", new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 11)),
      occ("b", "meeting", new Date(2026, 5, 1, 10), new Date(2026, 5, 1, 12)),
      occ("c", "meeting", new Date(2026, 5, 1, 10, 30), new Date(2026, 5, 1, 11, 30)),
    ]
    const lanes = buildLanes(occurrences, DAY)
    const meeting = lanes.find((l) => l.type === "meeting")!
    expect(meeting.subCount).toBe(3)
    expect(meeting.items.map((i) => i.sub).sort()).toEqual([0, 1, 2])
  })

  test("buildLanes gives zero-length items a minimum span", () => {
    const occurrences = [occ("a", "reminder", new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 9))]
    const lanes = buildLanes(occurrences, DAY)
    const it = lanes[0]!.items[0]!
    expect(it.endMin - it.startMin).toBe(30)
  })
})

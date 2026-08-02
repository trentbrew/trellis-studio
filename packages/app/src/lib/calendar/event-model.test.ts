import { describe, expect, test } from "bun:test"
import {
  calendarEventFromFacts,
  eventOccursOnDay,
  formatEventTime,
  listCalendarEvents,
} from "./event-model"

describe("calendar event model", () => {
  test("lists calendar_event entities from store facts", () => {
    const entities = [{ id: "calendar_event:1", type: "calendar_event" }]
    const facts = [
      { e: "calendar_event:1", a: "type", v: "calendar_event" },
      { e: "calendar_event:1", a: "title", v: "Demo" },
      { e: "calendar_event:1", a: "startAt", v: "2026-05-27" },
      { e: "calendar_event:1", a: "endAt", v: "2026-05-27" },
      { e: "calendar_event:1", a: "allDay", v: "true" },
      { e: "calendar_event:1", a: "color", v: "high" },
    ]
    const items = listCalendarEvents(entities, facts)
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe("Demo")
    expect(eventOccursOnDay(items[0]!, 2026, 4, 27)).toBe(true)
  })

  test("parses timed events", () => {
    const event = calendarEventFromFacts("calendar_event:2", [
      { e: "calendar_event:2", a: "title", v: "Sync" },
      { e: "calendar_event:2", a: "startAt", v: "2026-05-15T10:00:00.000Z" },
      { e: "calendar_event:2", a: "endAt", v: "2026-05-15T11:00:00.000Z" },
      { e: "calendar_event:2", a: "allDay", v: "false" },
    ])
    expect(event.allDay).toBe(false)
    expect(event.title).toBe("Sync")
    expect(formatEventTime(event)).toContain("–")
  })

  test("multi-day all-day events span days", () => {
    const event = {
      startAt: "2026-05-27",
      endAt: "2026-05-29",
      allDay: true,
    }
    expect(eventOccursOnDay(event, 2026, 4, 27)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 28)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 29)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 26)).toBe(false)
    expect(formatEventTime(event)).toContain("–")
  })

  test("reads event type and recurrence from facts", () => {
    const event = calendarEventFromFacts("calendar_event:3", [
      { e: "calendar_event:3", a: "title", v: "Rent" },
      { e: "calendar_event:3", a: "startAt", v: "2026-05-01" },
      { e: "calendar_event:3", a: "allDay", v: "true" },
      { e: "calendar_event:3", a: "eventType", v: "payment" },
      { e: "calendar_event:3", a: "recurrence", v: '{"frequency":"monthly"}' },
    ])
    expect(event.eventType).toBe("payment")
    expect(event.recurrence).toBe('{"frequency":"monthly"}')
  })

  test("weekly recurrence occurs on later weeks", () => {
    const event = {
      startAt: "2026-05-04",
      endAt: "2026-05-04",
      allDay: true,
      recurrence: '{"frequency":"weekly"}',
    }
    expect(eventOccursOnDay(event, 2026, 4, 4)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 11)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 18)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 5)).toBe(false)
  })

  test("recurrence stops at endDate", () => {
    const event = {
      startAt: "2026-05-04",
      endAt: "2026-05-04",
      allDay: true,
      recurrence: '{"frequency":"weekly","endDate":"2026-05-12"}',
    }
    expect(eventOccursOnDay(event, 2026, 4, 11)).toBe(true)
    expect(eventOccursOnDay(event, 2026, 4, 18)).toBe(false)
  })

  test("unknown event type falls back to event", () => {
    const event = calendarEventFromFacts("calendar_event:4", [
      { e: "calendar_event:4", a: "title", v: "X" },
      { e: "calendar_event:4", a: "startAt", v: "2026-05-01" },
      { e: "calendar_event:4", a: "eventType", v: "nonsense" },
    ])
    expect(event.eventType).toBe("event")
  })
})

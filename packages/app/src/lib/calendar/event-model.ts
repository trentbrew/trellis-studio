import type { StoreFact } from "@/context/trellis-store"
import {
  type CalendarEventType,
  DEFAULT_CALENDAR_EVENT_TYPE,
  normalizeEventType,
} from "@/lib/calendar/event-types"
import {
  expandOccurrences,
  type OccurrenceSpan,
  parseRecurrence,
  type RecurrenceRule,
} from "@/lib/calendar/recurrence"

export const CALENDAR_EVENT_COLORS = ["default", "critical", "high", "medium", "low"] as const
export type CalendarEventColor = (typeof CALENDAR_EVENT_COLORS)[number]

export type CalendarEventRecord = {
  id: string
  title: string
  description: string
  startAt: string
  endAt: string
  allDay: boolean
  color: CalendarEventColor
  eventType: CalendarEventType
  /** Raw recurrence JSON string ("" when the event does not repeat). */
  recurrence: string
  createdAt: string
  updatedAt: string
}

function normalizeColor(value: unknown): CalendarEventColor {
  const raw = String(value ?? "default").toLowerCase()
  if ((CALENDAR_EVENT_COLORS as readonly string[]).includes(raw)) return raw as CalendarEventColor
  return "default"
}

export function calendarEventFromFacts(id: string, facts: StoreFact[]): CalendarEventRecord {
  const read = (attr: string) => {
    const fact = facts.find((item) => item.e === id && item.a === attr)
    if (!fact) return undefined
    return String(fact.v)
  }
  const now = new Date().toISOString()
  const startAt = read("startAt") ?? now
  return {
    id,
    title: read("title") ?? "Untitled event",
    description: read("description") ?? "",
    startAt,
    endAt: read("endAt") ?? startAt,
    allDay: read("allDay") === "true",
    color: normalizeColor(read("color")),
    eventType: normalizeEventType(read("eventType")),
    recurrence: read("recurrence") ?? "",
    createdAt: read("createdAt") ?? now,
    updatedAt: read("updatedAt") ?? read("createdAt") ?? now,
  }
}

export function eventRecurrenceRule(
  item: Pick<CalendarEventRecord, "recurrence">,
): RecurrenceRule | null {
  return parseRecurrence(item.recurrence)
}

export function listCalendarEvents(
  entities: { id: string; type: string }[],
  facts: StoreFact[],
): CalendarEventRecord[] {
  const ids = new Set(entities.filter((entity) => entity.type === "calendar_event").map((entity) => entity.id))
  return [...ids]
    .map((id) => calendarEventFromFacts(id, facts))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
}

export function instantLocalDayParts(value: string, allDay: boolean) {
  if (!value) return undefined
  const date =
    allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? (() => {
          const [y, m, d] = value.split("-").map(Number)
          return new Date(y, m - 1, d)
        })()
      : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
}

export function eventLocalDayParts(item: Pick<CalendarEventRecord, "startAt" | "allDay">) {
  return instantLocalDayParts(item.startAt, item.allDay)
}

function localDayTimestamp(year: number, month: number, day: number) {
  return new Date(year, month, day, 0, 0, 0, 0).getTime()
}

function instantToLocalDate(value: string, allDay: boolean): Date | undefined {
  const parts = instantLocalDayParts(value, allDay)
  if (allDay && parts) return new Date(parts.year, parts.month, parts.day, 0, 0, 0, 0)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Resolve the base [start, end] span of an event as local Date objects. */
export function eventLocalSpan(
  item: Pick<CalendarEventRecord, "startAt" | "endAt" | "allDay">,
): OccurrenceSpan | undefined {
  const start = instantToLocalDate(item.startAt, item.allDay)
  if (!start) return undefined
  const end = instantToLocalDate(item.endAt ?? item.startAt, item.allDay) ?? start
  return { start, end: end.getTime() < start.getTime() ? start : end }
}

export function eventOccursOnDay(
  item: Pick<CalendarEventRecord, "startAt" | "endAt" | "allDay"> & Partial<Pick<CalendarEventRecord, "recurrence">>,
  year: number,
  month: number,
  day: number,
) {
  const span = eventLocalSpan(item)
  if (!span) return false

  const rule = parseRecurrence(item.recurrence)
  if (!rule) {
    const start = eventLocalDayParts(item)
    if (!start) return false
    const end = instantLocalDayParts(item.endAt ?? item.startAt, item.allDay) ?? start
    const target = localDayTimestamp(year, month, day)
    const from = localDayTimestamp(start.year, start.month, start.day)
    const to = localDayTimestamp(end.year, end.month, end.day)
    return target >= from && target <= to
  }

  const dayStart = new Date(year, month, day, 0, 0, 0, 0)
  const dayEnd = new Date(year, month, day, 23, 59, 59, 999)
  return expandOccurrences(span, rule, dayStart, dayEnd).length > 0
}

export type CalendarOccurrence = { event: CalendarEventRecord; start: Date; end: Date }

/** Concrete occurrences of an event (recurrence-expanded) within a window. */
export function eventOccurrencesInRange(
  event: CalendarEventRecord,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  const span = eventLocalSpan(event)
  if (!span) return []
  const rule = parseRecurrence(event.recurrence)
  return expandOccurrences(span, rule, rangeStart, rangeEnd).map((occ) => ({
    event,
    start: occ.start,
    end: occ.end,
  }))
}

export function formatEventTime(
  item: Pick<CalendarEventRecord, "startAt" | "endAt" | "allDay">,
) {
  const start = eventLocalDayParts(item)
  const end = instantLocalDayParts(item.endAt ?? item.startAt, item.allDay)
  if (!start) return ""

  if (item.allDay) {
    if (!end || (start.year === end.year && start.month === end.month && start.day === end.day)) {
      return "All day"
    }
    const fmt = (p: { year: number; month: number; day: number }) =>
      new Date(p.year, p.month, p.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    return `${fmt(start)} – ${fmt(end)}`
  }

  const startDate = new Date(item.startAt)
  const endDate = new Date(item.endAt ?? item.startAt)
  if (Number.isNaN(startDate.getTime())) return ""
  const timeFmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (
    end &&
    (start.year !== end.year || start.month !== end.month || start.day !== end.day)
  ) {
    const dayFmt = (d: Date) =>
      d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    return `${dayFmt(startDate)} – ${dayFmt(endDate)}`
  }
  if (item.endAt && item.endAt !== item.startAt && !Number.isNaN(endDate.getTime())) {
    return `${timeFmt(startDate)} – ${timeFmt(endDate)}`
  }
  return timeFmt(startDate)
}

export function localTimeInputValue(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "09:00"
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function combineLocalDateTime(
  year: number,
  month: number,
  day: number,
  time: string,
  allDay: boolean,
) {
  if (allDay) return localDateInputValue(year, month, day)
  const [hours, minutes] = time.split(":").map((part) => Number(part))
  return new Date(year, month, day, hours || 0, minutes || 0, 0, 0).toISOString()
}

export function parseDateInputValue(value: string) {
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return { year: y, month: m - 1, day: d }
}

export function localDateInputValue(year: number, month: number, day: number) {
  const y = String(year)
  const m = String(month + 1).padStart(2, "0")
  const d = String(day).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function defaultEventStartAt(year: number, month: number, day: number, allDay: boolean) {
  if (allDay) return localDateInputValue(year, month, day)
  const date = new Date(year, month, day, 9, 0, 0, 0)
  return date.toISOString()
}

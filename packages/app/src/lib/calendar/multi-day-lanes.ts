import type { CalendarEventRecord } from "@/lib/calendar/event-model"
import type { CalendarOccurrence } from "@/lib/calendar/event-model"

/** Calendar-day start (midnight local). */
export function calendarDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Inclusive calendar-day end (midnight local). */
export function calendarDayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** DST-safe day difference between two calendar dates. */
export function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / 86400000)
}

export function occurrenceSpanDays(occ: CalendarOccurrence): { start: Date; end: Date } {
  const start = calendarDayStart(occ.start)
  const end = calendarDayEnd(occ.end)
  return { start, end }
}

export function isMultiDayOccurrence(occ: CalendarOccurrence): boolean {
  const { start, end } = occurrenceSpanDays(occ)
  return end.getTime() > start.getTime()
}

export function occurrenceLaneKey(occ: CalendarOccurrence): string {
  return `${occ.event.id}:${occ.start.getTime()}`
}

export interface MultiDayLane {
  key: string
  event: CalendarEventRecord
  startCol: number
  endCol: number
  continuesFromPrev: boolean
  continuesToNext: boolean
  laneIndex: number
}

export interface LaneSlot {
  key: string
  event: CalendarEventRecord
  occurrenceStart: Date
  isStart: boolean
  isEnd: boolean
  isWrapStart: boolean
  isWrapEnd: boolean
}

export function getMultiDayLanes(
  weekDayDates: Date[],
  occurrences: CalendarOccurrence[],
  globalLaneMap: Map<string, number>,
  maxLanes: number,
): { lanes: MultiDayLane[]; overflowPerCol: number[] } {
  const colCount = weekDayDates.length
  const emptyOverflow = () => Array.from({ length: colCount }, () => 0)
  if (!colCount) return { lanes: [], overflowPerCol: emptyOverflow() }

  const weekStart = calendarDayStart(weekDayDates[0]!)
  const weekEnd = calendarDayStart(weekDayDates[colCount - 1]!)

  const multiDay = occurrences.filter(isMultiDayOccurrence)
  const relevant = multiDay.filter((occ) => {
    const { start, end } = occurrenceSpanDays(occ)
    return end >= weekStart && start <= weekEnd
  })

  if (!relevant.length) return { lanes: [], overflowPerCol: emptyOverflow() }

  const sorted = [...relevant].sort((a, b) => {
    const aSpan = occurrenceSpanDays(a)
    const bSpan = occurrenceSpanDays(b)
    const aStart = aSpan.start.getTime()
    const bStart = bSpan.start.getTime()
    if (aStart !== bStart) return aStart - bStart
    const aLen = daysBetween(aSpan.start, aSpan.end)
    const bLen = daysBetween(bSpan.start, bSpan.end)
    return bLen - aLen
  })

  const reserved = sorted.filter((occ) => globalLaneMap.has(occurrenceLaneKey(occ)))
  const fresh = sorted.filter((occ) => !globalLaneMap.has(occurrenceLaneKey(occ)))
  const processingOrder = [...reserved, ...fresh]

  const laneOccupancy: number[][] = []
  const allLanes: MultiDayLane[] = []

  for (const occ of processingOrder) {
    const { start: evStart, end: evEnd } = occurrenceSpanDays(occ)
    const startCol = Math.max(0, daysBetween(weekStart, evStart))
    const endCol = Math.min(colCount - 1, daysBetween(weekStart, evEnd))
    const continuesFromPrev = evStart < weekStart
    const continuesToNext = evEnd > weekEnd
    const key = occurrenceLaneKey(occ)

    let assignedLane = -1

    if (globalLaneMap.has(key)) {
      const preferred = globalLaneMap.get(key)!
      while (laneOccupancy.length <= preferred) laneOccupancy.push([])
      const conflict = laneOccupancy[preferred]!.some((c) => c >= startCol && c <= endCol)
      if (!conflict) assignedLane = preferred
    }

    if (assignedLane === -1) {
      for (let l = 0; l < laneOccupancy.length; l++) {
        const conflict = laneOccupancy[l]!.some((c) => c >= startCol && c <= endCol)
        if (!conflict) {
          assignedLane = l
          break
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneOccupancy.length
        laneOccupancy.push([])
      }
    }

    globalLaneMap.set(key, assignedLane)
    for (let c = startCol; c <= endCol; c++) {
      laneOccupancy[assignedLane]!.push(c)
    }

    allLanes.push({
      key,
      event: occ.event,
      startCol,
      endCol,
      continuesFromPrev,
      continuesToNext,
      laneIndex: assignedLane,
    })
  }

  const visible = allLanes.filter((l) => l.laneIndex < maxLanes)
  const overflowLanes = allLanes.filter((l) => l.laneIndex >= maxLanes)
  const overflowPerCol = emptyOverflow()
  for (const lane of overflowLanes) {
    for (let c = lane.startCol; c <= lane.endCol; c++) {
      overflowPerCol[c] = (overflowPerCol[c] ?? 0) + 1
    }
  }

  return { lanes: visible, overflowPerCol }
}

/** Per-column lane slots for one week row (null = empty lane row). */
export function laneSlotsForWeek(
  weekDayDates: Date[],
  lanes: MultiDayLane[],
  occurrenceByKey: Map<string, CalendarOccurrence>,
): (LaneSlot | null)[][] {
  const colCount = weekDayDates.length
  if (!colCount) return []

  const maxLane = lanes.length ? Math.max(...lanes.map((l) => l.laneIndex)) : -1
  const slotCount = maxLane + 1

  return weekDayDates.map((_, colIdx) => {
    const slots: Array<LaneSlot | null> = slotCount > 0 ? Array(slotCount).fill(null) : []
    for (const lane of lanes) {
      if (colIdx < lane.startCol || colIdx > lane.endCol) continue
      const occ = occurrenceByKey.get(lane.key)
      slots[lane.laneIndex] = {
        key: lane.key,
        event: lane.event,
        occurrenceStart: occ?.start ?? new Date(),
        isStart: colIdx === lane.startCol && !lane.continuesFromPrev,
        isEnd: colIdx === lane.endCol && !lane.continuesToNext,
        isWrapStart: colIdx === lane.startCol && lane.continuesFromPrev,
        isWrapEnd: colIdx === lane.endCol && lane.continuesToNext,
      }
    }
    while (slots.length > 0 && slots[slots.length - 1] === null) slots.pop()
    return slots
  })
}

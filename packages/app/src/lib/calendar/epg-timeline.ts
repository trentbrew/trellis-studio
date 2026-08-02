import type { CalendarOccurrence } from "@/lib/calendar/event-model"
import type { CalendarEventType } from "@/lib/calendar/event-types"

// NOTE: keep this module free of runtime imports from event-types — that file
// pulls in lucide-solid (client-only), which breaks server-side unit tests.
// Colors/labels are resolved by the component layer; lanes are ordered here by
// earliest start so the math stays pure and testable.

/**
 * Horizontal EPG-style day timeline math, borrowed from the raster.tv schedule
 * gantt. Time flows left → right across a single 24-hour day. Events are grouped
 * into "channel" lanes by event type; overlaps within a lane stack into sub-rows.
 */

export const ZOOM_MIN = 100
export const ZOOM_MAX = 20000
/** Pixels per hour at zoom 100. */
export const BASE_HOUR_WIDTH = 60
/** Height of one stacked event row inside a lane. */
export const EPG_ITEM_HEIGHT = 30
export const DAY_MINUTES = 1440

/** Tick granularity (minutes) for a given zoom — finer as you zoom in. */
export function tickMinutes(zoom: number): number {
  if (zoom < 140) return 60
  if (zoom < 200) return 30
  if (zoom < 280) return 10
  if (zoom < 500) return 5
  if (zoom < 900) return 2
  return 1
}

/** Width of one hour column in px at the given zoom. */
export function hourWidth(zoom: number): number {
  return (BASE_HOUR_WIDTH * zoom) / 100
}

/** Minute step between axis labels, kept from getting denser than ~44px apart. */
export function labelStep(zoom: number): number {
  const tick = tickMinutes(zoom)
  const tickPx = (hourWidth(zoom) * tick) / 60
  if (!Number.isFinite(tickPx) || tickPx <= 0) return Math.max(tick, 60)
  const per = Math.max(1, Math.ceil(44 / tickPx))
  return per * tick
}

/** Minutes from local midnight of `day` for the given instant. */
export function minuteOfDay(date: Date, day: Date): number {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  return (date.getTime() - start) / 60000
}

export function clampMin(min: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, min))
}

export function snap(min: number, step: number): number {
  if (step <= 0) return min
  return Math.round(min / step) * step
}

/** 12-hour clock label for a minute-of-day; `12AM` / `1:30PM` etc. */
export function formatClock(min: number): string {
  const total = ((Math.round(min) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const h24 = Math.floor(total / 60)
  const m = total % 60
  const period = h24 < 12 ? "AM" : "PM"
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h}${period}` : `${h}:${String(m).padStart(2, "0")}${period}`
}

export type AxisTick = { min: number; left: number; label: string }

/** Labeled tick positions across the 24h axis for the current zoom. */
export function axisTicks(zoom: number): AxisTick[] {
  const step = labelStep(zoom)
  const w = hourWidth(zoom)
  const out: AxisTick[] = []
  for (let m = 0; m < DAY_MINUTES; m += step) {
    out.push({ min: m, left: (m / 60) * w, label: formatClock(m) })
  }
  return out
}

export type EpgItem = { occ: CalendarOccurrence; startMin: number; endMin: number; sub: number }
export type EpgLane = {
  type: CalendarEventType
  items: EpgItem[]
  subCount: number
}

/**
 * Group timed occurrences into per-type lanes, ordered by each lane's earliest
 * start. Within a lane, overlapping items are packed into stacked sub-rows
 * (greedy interval partition).
 */
export function buildLanes(occurrences: CalendarOccurrence[], day: Date): EpgLane[] {
  const byType = new Map<CalendarEventType, EpgItem[]>()
  for (const occ of occurrences) {
    if (occ.event.allDay) continue
    const startMin = clampMin(minuteOfDay(occ.start, day))
    let endMin = clampMin(minuteOfDay(occ.end, day))
    if (endMin <= startMin) endMin = Math.min(DAY_MINUTES, startMin + 30)
    const arr = byType.get(occ.event.eventType) ?? []
    arr.push({ occ, startMin, endMin, sub: 0 })
    byType.set(occ.event.eventType, arr)
  }

  const lanes: EpgLane[] = []
  for (const [type, items] of byType) {
    items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    const subEnds: number[] = []
    for (const it of items) {
      let placed = false
      for (let i = 0; i < subEnds.length; i++) {
        if (it.startMin >= subEnds[i]) {
          it.sub = i
          subEnds[i] = it.endMin
          placed = true
          break
        }
      }
      if (!placed) {
        it.sub = subEnds.length
        subEnds.push(it.endMin)
      }
    }
    lanes.push({ type, items, subCount: Math.max(1, subEnds.length) })
  }

  lanes.sort((a, b) => (a.items[0]?.startMin ?? 0) - (b.items[0]?.startMin ?? 0) || a.type.localeCompare(b.type))
  return lanes
}

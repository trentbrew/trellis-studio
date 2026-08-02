import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { ArrowLeft, ArrowRight, Plus, ZoomIn, ZoomOut } from "lucide-solid"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { type Cycle, type TrellisMilestone, useTrellis } from "@/context/trellis"
import { TrellisStoreScope, useTrellisStore } from "@/context/trellis-store"
import { useEntityDialog } from "@/components/entity-dialog"
import { ENTITY_COLORS, EntityIcon } from "@/lib/entity-theme"
import {
  type CalendarEventRecord,
  type CalendarOccurrence,
  eventOccurrencesInRange,
  formatEventTime,
  listCalendarEvents,
  localDateInputValue,
} from "@/lib/calendar/event-model"
import { apiSaveCalendarEvent } from "@/lib/calendar/event-api"
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_META,
  type CalendarEventType,
  eventTypeColor,
  eventTypeLabel,
} from "@/lib/calendar/event-types"
import { aggregateCronJobsByDay, createAggregatedCronEvent, cronJobsToCalendarEvents } from "@/lib/cron/calendar"
import { apiListCronJobs } from "@/lib/cron/api"
import {
  axisTicks,
  buildLanes,
  clampMin,
  DAY_MINUTES,
  EPG_ITEM_HEIGHT,
  type EpgItem,
  type EpgLane,
  formatClock,
  hourWidth,
  snap,
  tickMinutes,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@/lib/calendar/epg-timeline"
import { formatRecurrence, parseRecurrence } from "@/lib/calendar/recurrence"
import { isEditableTarget } from "@/lib/editable-target"
import {
  getMultiDayLanes,
  isMultiDayOccurrence,
  laneSlotsForWeek,
  occurrenceLaneKey,
  type LaneSlot,
} from "@/lib/calendar/multi-day-lanes"
import { CalendarEventDialog } from "@/pages/session/calendar-event-dialog"
import { PROJECTION_FOCUS_EVENT, type ProjectionFocusDetail } from "@/lib/projection-focus"
import { ResizableRouteSidebar, ResizableSidebarLayout } from "@/components/route"
import { AffordanceShell } from "@/components/affordance"
import "./calendar-projection.css"

const PRIORITY_COLOR: Record<string, string> = {
  critical: "var(--icon-error)",
  high: "var(--icon-warning)",
  medium: "var(--icon-info)",
  low: "var(--text-weaker)",
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const WEEKDAY_MINI = ["S", "M", "T", "W", "T", "F", "S"]

type ViewMode = "day" | "week" | "month" | "year"

const VIEW_OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: "day", label: "Today" },
  { mode: "week", label: "Week" },
  { mode: "month", label: "Month" },
  { mode: "year", label: "Year" },
]

const MAX_VISIBLE_DAY_EVENTS = 5
const MAX_VISIBLE_MULTI_DAY_LANES = 3
/** Width of the sticky lane-label / corner column in the day timeline. */
const EPG_LABEL_W = 132
const EPG_HEADER_H = 36
const EPG_LANE_PAD = 8

function formatNowLabel(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

type WorkEntry = {
  kind: "issue" | "workunit"
  id: string
  title: string
  priority: string
  date: string
}

function stamp(...vals: (string | undefined)[]) {
  return vals.find((v) => v && !Number.isNaN(new Date(v).getTime())) ?? new Date().toISOString()
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}
function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
function keyOf(d: Date) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate())
}
function sameYMD(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfViewPeriod(date: Date, mode: ViewMode): Date {
  switch (mode) {
    case "month":
      return new Date(date.getFullYear(), date.getMonth(), 1)
    case "year":
      return new Date(date.getFullYear(), 0, 1)
    default:
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }
}

function startOfDayLocal(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

type DayStatus = "past" | "today" | "future"
function dayStatus(date: Date): DayStatus {
  const today = startOfDayLocal(new Date()).getTime()
  const cur = startOfDayLocal(date).getTime()
  if (cur === today) return "today"
  return cur < today ? "past" : "future"
}

type MonthStatus = "past" | "current" | "future"
function monthStatus(year: number, month: number): MonthStatus {
  const now = new Date()
  const cur = new Date(year, month, 1).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (cur === today) return "current"
  return cur < today ? "past" : "future"
}

function currentQuarterIndex(date = new Date()) {
  return Math.floor(date.getMonth() / 3)
}

export function CalendarViewInner() {
  const trellis = useTrellis()
  const store = useTrellisStore()
  const dialog = useDialog()
  const entityDialog = useEntityDialog()
  const sdk = useSDK()

  const handleMoveEventToDay = async (id: string, targetDate: Date) => {
    const match = allEvents().find((item) => item.id === id)
    if (!match) return

    try {
      let newStartAt = ""
      let newEndAt = ""

      if (match.allDay) {
        const oldStart = new Date(match.startAt + "T00:00:00")
        const oldEnd = new Date((match.endAt || match.startAt) + "T00:00:00")
        const diffDays = Math.round((oldEnd.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24))

        newStartAt = localDateInputValue(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
        const targetEnd = addDays(targetDate, diffDays)
        newEndAt = localDateInputValue(targetEnd.getFullYear(), targetEnd.getMonth(), targetEnd.getDate())
      } else {
        const oldStart = new Date(match.startAt)
        const oldEnd = new Date(match.endAt || match.startAt)
        const durationMs = oldEnd.getTime() - oldStart.getTime()

        const hours = oldStart.getHours()
        const minutes = oldStart.getMinutes()
        const combinedStart = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          hours,
          minutes,
          0,
          0,
        )
        newStartAt = combinedStart.toISOString()
        newEndAt = new Date(combinedStart.getTime() + durationMs).toISOString()
      }

      await apiSaveCalendarEvent(sdk.fetch, sdk.url, sdk.directory, {
        id,
        startAt: newStartAt,
        endAt: newEndAt,
      })
      await store.refresh(false)
      showToast({
        variant: "success",
        title: "Event moved",
        description: `Successfully rescheduled "${match.title}".`,
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to move event",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleSetEventTimes = async (id: string, day: Date, startMin: number, endMin: number) => {
    const match = allEvents().find((item) => item.id === id)
    if (!match) return

    const at = (min: number) => {
      const h = Math.floor(min / 60)
      const m = Math.round(min % 60)
      return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0)
    }

    try {
      const start = at(startMin)
      const end = at(Math.max(startMin + 5, endMin))
      await apiSaveCalendarEvent(sdk.fetch, sdk.url, sdk.directory, {
        id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: false,
      })
      await store.refresh(false)
      showToast({
        variant: "success",
        title: "Event rescheduled",
        description: `Updated "${match.title}" to ${formatClock(startMin)} \u2013 ${formatClock(endMin)}.`,
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to reschedule event",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const now = new Date()
  const [anchor, setAnchor] = createSignal(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [viewMode, setViewMode] = createSignal<ViewMode>("month")
  const [activeEventId, setActiveEventId] = createSignal<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = createSignal<Set<CalendarEventType>>(new Set())
  type TrellisKind = "issue" | "workunit" | "milestone" | "cycle"
  const TRELLIS_KINDS: TrellisKind[] = ["issue", "workunit", "milestone", "cycle"]
  const TRELLIS_KIND_META: Record<TrellisKind, { label: string; color: string }> = {
    issue: { label: "Issues", color: ENTITY_COLORS.issue },
    workunit: { label: "Work units", color: ENTITY_COLORS.workunit },
    milestone: { label: "Milestones", color: ENTITY_COLORS.milestone },
    cycle: { label: "Cycles", color: ENTITY_COLORS.cycle },
  }
  const [hiddenKinds, setHiddenKinds] = createSignal<Set<TrellisKind>>(new Set())

  const [milestones] = createResource(
    () => trellis.revision,
    () => trellis.fetchMilestones(),
    { initialValue: [] as TrellisMilestone[] },
  )

  const [cronJobs] = createResource(
    () => store.revision,
    () => apiListCronJobs(sdk.fetch, sdk.url, sdk.directory),
    { initialValue: [] },
  )

  const isToday = (d: Date) => {
    const today = new Date()
    return sameYMD(d, today)
  }

  const allEvents = createMemo(() => {
    const calendarEvents = listCalendarEvents(store.entities, store.facts)
    const cronEvents = cronJobsToCalendarEvents(cronJobs())
    const aggregatedByDay = aggregateCronJobsByDay(cronEvents)
    const aggregatedEvents: CalendarEventRecord[] = []
    for (const [day, jobs] of aggregatedByDay) {
      if (jobs.length > 1) {
        aggregatedEvents.push(createAggregatedCronEvent(day, jobs))
      } else {
        aggregatedEvents.push(...jobs)
      }
    }
    return [...calendarEvents, ...aggregatedEvents].sort((a, b) => a.startAt.localeCompare(b.startAt))
  })

  const typeCounts = createMemo(() => {
    const counts = new Map<CalendarEventType, number>()
    for (const e of allEvents()) counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1)
    return counts
  })

  const visibleEvents = createMemo(() => {
    const hidden = hiddenTypes()
    if (hidden.size === 0) return allEvents()
    return allEvents().filter((e) => !hidden.has(e.eventType))
  })

  // ── Visible window per view mode ───────────────────────────────────────
  const viewRange = createMemo<{ start: Date; end: Date }>(() => {
    const a = anchor()
    switch (viewMode()) {
      case "day":
        return {
          start: new Date(a.getFullYear(), a.getMonth(), a.getDate(), 0, 0, 0, 0),
          end: new Date(a.getFullYear(), a.getMonth(), a.getDate(), 23, 59, 59, 999),
        }
      case "week": {
        const s = startOfWeek(a)
        const e = addDays(s, 6)
        return { start: s, end: new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999) }
      }
      case "month": {
        const s = new Date(a.getFullYear(), a.getMonth(), 1)
        const e = new Date(a.getFullYear(), a.getMonth() + 1, 0, 23, 59, 59, 999)
        return { start: s, end: e }
      }
      case "year":
        return { start: new Date(a.getFullYear(), 0, 1), end: new Date(a.getFullYear(), 11, 31, 23, 59, 59, 999) }
    }
  })

  // ── Occurrences (recurrence-expanded) bucketed per day ─────────────────
  const occurrencesByDay = createMemo(() => {
    const range = viewRange()
    const map = new Map<string, CalendarOccurrence[]>()
    for (const event of visibleEvents()) {
      for (const occ of eventOccurrencesInRange(event, range.start, range.end)) {
        const spanStart = new Date(occ.start.getFullYear(), occ.start.getMonth(), occ.start.getDate())
        const spanEnd = new Date(occ.end.getFullYear(), occ.end.getMonth(), occ.end.getDate())
        let cursor =
          spanStart < range.start
            ? new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate())
            : spanStart
        const last =
          spanEnd > range.end ? new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()) : spanEnd
        let guard = 0
        while (cursor.getTime() <= last.getTime() && guard < 400) {
          const k = keyOf(cursor)
          const arr = map.get(k) ?? []
          arr.push(occ)
          map.set(k, arr)
          cursor = addDays(cursor, 1)
          guard++
        }
      }
    }
    for (const [, list] of map) list.sort((a, b) => a.start.getTime() - b.start.getTime())
    return map
  })

  const eventsOnDay = (d: Date) => occurrencesByDay().get(keyOf(d)) ?? []

  // ── Work entries (issues / work units) ─────────────────────────────────
  const workByKey = createMemo(() => {
    const map = new Map<string, WorkEntry[]>()
    const entries: WorkEntry[] = [
      ...trellis.issues.map((item) => ({
        kind: "issue" as const,
        id: item.id,
        title: item.title,
        priority: item.priority,
        date: stamp(item.createdAt),
      })),
      ...trellis.workUnits.map((item) => ({
        kind: "workunit" as const,
        id: item.id,
        title: item.title,
        priority: item.priority,
        date: stamp(item.createdAt, item.updatedAt),
      })),
    ]
    for (const entry of entries) {
      const d = new Date(entry.date)
      if (Number.isNaN(d.getTime())) continue
      const k = keyOf(d)
      const arr = map.get(k) ?? []
      arr.push(entry)
      map.set(k, arr)
    }
    return map
  })

  const milestonesByKey = createMemo(() => {
    const map = new Map<string, TrellisMilestone[]>()
    for (const m of milestones.latest ?? []) {
      const stamp = m.dueAt ?? m.createdAt
      if (!stamp) continue
      const d = new Date(stamp)
      if (Number.isNaN(d.getTime())) continue
      const k = keyOf(d)
      const arr = map.get(k) ?? []
      arr.push(m)
      map.set(k, arr)
    }
    return map
  })

  const cyclesByKey = createMemo(() => {
    const map = new Map<string, Cycle[]>()
    for (const c of trellis.cycles ?? []) {
      if (!c.createdAt) continue
      const d = new Date(c.createdAt)
      if (Number.isNaN(d.getTime())) continue
      const k = keyOf(d)
      const arr = map.get(k) ?? []
      arr.push(c)
      map.set(k, arr)
    }
    return map
  })

  // Unified day items: events + trellis entries (issues, work units, milestones, cycles)
  type DayItem =
    | { kind: "event"; occ: CalendarOccurrence }
    | { kind: "issue" | "workunit"; id: string; title: string; priority: string }
    | { kind: "milestone"; id: string; title: string }
    | { kind: "cycle"; id: string; title: string; horizon: Cycle["horizon"] }

  const trellisItemsOnDay = (d: Date): DayItem[] => {
    const items: DayItem[] = []
    const hidden = hiddenKinds()
    if (!hidden.has("milestone")) {
      for (const m of milestonesByKey().get(keyOf(d)) ?? []) {
        items.push({ kind: "milestone", id: m.id, title: m.message ?? m.id })
      }
    }
    if (!hidden.has("cycle")) {
      for (const c of cyclesByKey().get(keyOf(d)) ?? []) {
        items.push({ kind: "cycle", id: c.id, title: c.title, horizon: c.horizon })
      }
    }
    for (const w of workByKey().get(keyOf(d)) ?? []) {
      if (hidden.has(w.kind)) continue
      items.push({ kind: w.kind, id: w.id, title: w.title, priority: w.priority })
    }
    return items
  }

  const dayItems = (d: Date, events: CalendarOccurrence[]): DayItem[] => {
    const items: DayItem[] = events.map((occ) => ({ kind: "event" as const, occ }))
    items.push(...trellisItemsOnDay(d))
    return items
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  const step = (dir: number) => {
    const a = anchor()
    const mode = viewMode()
    switch (mode) {
      case "day":
        setAnchor(addDays(a, dir))
        break
      case "week":
        setAnchor(addDays(a, dir * 7))
        break
      case "month":
        setAnchor(addMonths(startOfViewPeriod(a, mode), dir))
        break
      case "year":
        setAnchor(addMonths(startOfViewPeriod(a, mode), dir * 12))
        break
    }
    setActiveEventId(null)
  }

  const goToday = () => {
    setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    setActiveEventId(null)
  }

  const switchMode = (mode: ViewMode) => {
    if (mode === "day" && viewMode() !== "day") {
      setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    }
    setViewMode(mode)
    setActiveEventId(null)
  }

  const periodLabel = createMemo(() => {
    const a = anchor()
    switch (viewMode()) {
      case "day":
        return a.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      case "week": {
        const s = startOfWeek(a)
        const e = addDays(s, 6)
        return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      }
      case "month":
        return `${MONTH_NAMES[a.getMonth()].slice(0, 3)} ${a.getFullYear()}`
      case "year":
        return `${a.getFullYear()}`
    }
  })

  // ── Dialog ───────────────────────────────────────────────────────────
  const openEventDialog = (eventId: string, onDay?: Date) => {
    const day = onDay ?? anchor()
    setActiveEventId(eventId)
    dialog.show(() => (
      <CalendarEventDialog
        year={day.getFullYear()}
        month={day.getMonth()}
        day={day.getDate()}
        eventId={eventId}
        events={allEvents()}
        onSaved={(id) => setActiveEventId(id)}
      />
    ))
  }
  const openNewEvent = (onDay?: Date) => openEventDialog("__new__", onDay)

  let focusRoot: HTMLDivElement | undefined

  onMount(() => {
    void store.hydrate({ toast: false })

    const focus = (event: Event) => {
      const detail = (event as CustomEvent<ProjectionFocusDetail>).detail
      if (detail?.lens !== "calendar" || !detail.entityId) return
      const match = allEvents().find((item) => item.id === detail.entityId)
      if (!match) return
      const start = new Date(match.startAt)
      if (!Number.isNaN(start.getTime())) {
        setAnchor(new Date(start.getFullYear(), start.getMonth(), start.getDate()))
      }
      openEventDialog(detail.entityId)
    }
    window.addEventListener(PROJECTION_FOCUS_EVENT, focus)

    const inCalendar = (node: EventTarget | Element | null | undefined) => {
      if (!focusRoot || !(node instanceof Node)) return false
      return focusRoot.contains(node)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      if (isEditableTarget(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      if (!inCalendar(e.target) && !inCalendar(document.activeElement)) return

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        step(-1)
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        step(1)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    onCleanup(() => {
      window.removeEventListener(PROJECTION_FOCUS_EVENT, focus)
      window.removeEventListener("keydown", onKeyDown)
    })
  })

  const toggleType = (type: CalendarEventType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }
  const allTypesShown = createMemo(() => hiddenTypes().size === 0)
  const toggleAllTypes = () => {
    setHiddenTypes((prev) => (prev.size === 0 ? new Set(CALENDAR_EVENT_TYPES) : new Set<CalendarEventType>()))
  }

  const toggleKind = (kind: TrellisKind) => {
    setHiddenKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }
  const kindCounts = createMemo(() => {
    const counts: Record<TrellisKind, number> = { issue: 0, workunit: 0, milestone: 0, cycle: 0 }
    counts.issue = trellis.issues.length
    counts.workunit = trellis.workUnits.length
    counts.milestone = (milestones.latest ?? []).length
    counts.cycle = (trellis.cycles ?? []).length
    return counts
  })

  // ── Mini calendar (sidebar) ────────────────────────────────────────────
  const [miniDate, setMiniDate] = createSignal(new Date(now.getFullYear(), now.getMonth(), 1))
  const miniEventDays = createMemo(() => {
    const md = miniDate()
    const start = new Date(md.getFullYear(), md.getMonth(), 1)
    const end = new Date(md.getFullYear(), md.getMonth() + 1, 0, 23, 59, 59, 999)
    const set = new Set<string>()
    for (const event of visibleEvents()) {
      for (const occ of eventOccurrencesInRange(event, start, end)) {
        let cursor = new Date(occ.start.getFullYear(), occ.start.getMonth(), occ.start.getDate())
        const last = new Date(occ.end.getFullYear(), occ.end.getMonth(), occ.end.getDate())
        let guard = 0
        while (cursor.getTime() <= last.getTime() && guard < 400) {
          if (cursor.getMonth() === md.getMonth()) set.add(keyOf(cursor))
          cursor = addDays(cursor, 1)
          guard++
        }
      }
    }
    return set
  })
  const miniCells = createMemo(() => {
    const md = miniDate()
    const first = new Date(md.getFullYear(), md.getMonth(), 1).getDay()
    const total = new Date(md.getFullYear(), md.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = Array(first).fill(null)
    for (let i = 1; i <= total; i++) cells.push(new Date(md.getFullYear(), md.getMonth(), i))
    return cells
  })
  const pickDay = (d: Date) => {
    setAnchor(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    setMiniDate(new Date(d.getFullYear(), d.getMonth(), 1))
    setViewMode("day")
    setActiveEventId(null)
  }

  // ── Renderers ──────────────────────────────────────────────────────────
  function EventBarSegment(props: { slot: LaneSlot; day?: Date }) {
    const color = () => eventTypeColor(props.slot.event.eventType)
    const repeats = () => !!parseRecurrence(props.slot.event.recurrence)
    const showLabel = () => props.slot.isStart || props.slot.isWrapStart
    return (
      <button
        type="button"
        draggable={true}
        onDragStart={(e) => {
          if (e.dataTransfer) {
            e.dataTransfer.setData("text/plain", JSON.stringify({ id: props.slot.event.id, type: "event" }))
            e.dataTransfer.effectAllowed = "move"
          }
          e.currentTarget.classList.add("opacity-50")
        }}
        onDragEnd={(e) => {
          e.currentTarget.classList.remove("opacity-50")
        }}
        class="calendar-event-bar cursor-grab active:cursor-grabbing"
        classList={{
          "calendar-event-bar--selected": activeEventId() === props.slot.event.id,
          "calendar-event-bar--start": props.slot.isStart,
          "calendar-event-bar--end": props.slot.isEnd,
          "calendar-event-bar--wrap-start": props.slot.isWrapStart,
          "calendar-event-bar--wrap-end": props.slot.isWrapEnd,
          "fresh-overlay": store.fresh.includes(props.slot.event.id),
        }}
        style={{ background: `color-mix(in oklch, ${color()} 26%, transparent)` }}
        title={`${props.slot.event.title}${repeats() ? ` · ${formatRecurrence(parseRecurrence(props.slot.event.recurrence))}` : ""}`}
        onClick={(e) => {
          e.stopPropagation()
          openEventDialog(props.slot.event.id, props.day)
        }}
      >
        <Show when={showLabel()}>
          <span class="calendar-event-chip__dot" style={{ background: color() }} />
          <span class="calendar-event-bar__label">{props.slot.event.title}</span>
        </Show>
      </button>
    )
  }

  function EventChip(props: { occ: CalendarOccurrence; day?: Date }) {
    const color = () => eventTypeColor(props.occ.event.eventType)
    const repeats = () => !!parseRecurrence(props.occ.event.recurrence)
    return (
      <button
        type="button"
        draggable={true}
        onDragStart={(e) => {
          if (e.dataTransfer) {
            e.dataTransfer.setData("text/plain", JSON.stringify({ id: props.occ.event.id, type: "event" }))
            e.dataTransfer.effectAllowed = "move"
          }
          e.currentTarget.classList.add("opacity-50")
        }}
        onDragEnd={(e) => {
          e.currentTarget.classList.remove("opacity-50")
        }}
        class="calendar-event-chip cursor-grab active:cursor-grabbing"
        classList={{
          "calendar-event-chip--selected": activeEventId() === props.occ.event.id,
          "fresh-overlay": store.fresh.includes(props.occ.event.id),
        }}
        style={{ background: `color-mix(in oklch, ${color()} 26%, transparent)` }}
        title={`${props.occ.event.title}${repeats() ? ` · ${formatRecurrence(parseRecurrence(props.occ.event.recurrence))}` : ""}`}
        onClick={(e) => {
          e.stopPropagation()
          openEventDialog(props.occ.event.id, props.day)
        }}
      >
        <span class="calendar-event-chip__dot" style={{ background: color() }} />
        <span class="calendar-event-chip__label">{props.occ.event.title}</span>
        <Show when={repeats()}>
          <span class="calendar-event-chip__repeat" aria-hidden="true">
            ↻
          </span>
        </Show>
      </button>
    )
  }

  function trellisItemColor(item: Exclude<DayItem, { kind: "event" }>) {
    if (item.kind === "issue") return PRIORITY_COLOR[item.priority] ?? ENTITY_COLORS.issue
    if (item.kind === "workunit") return PRIORITY_COLOR[item.priority] ?? ENTITY_COLORS.workunit
    if (item.kind === "milestone") return ENTITY_COLORS.milestone
    return ENTITY_COLORS.cycle
  }

  function trellisItemTooltip(item: Exclude<DayItem, { kind: "event" }>) {
    if (item.kind === "issue") return `Issue · ${item.title}`
    if (item.kind === "workunit") return `WorkUnit · ${item.title}`
    if (item.kind === "cycle") return `Cycle · ${item.title} (${item.horizon})`
    return `Milestone · ${item.title}`
  }

  function TrellisChip(props: { item: Exclude<DayItem, { kind: "event" }> }) {
    const color = () => trellisItemColor(props.item)
    return (
      <button
        type="button"
        class="calendar-event-chip"
        style={{ background: `color-mix(in oklch, ${color()} 26%, transparent)` }}
        title={trellisItemTooltip(props.item)}
        onClick={(e) => {
          e.stopPropagation()
          entityDialog.push(props.item.id, props.item.kind)
        }}
      >
        <EntityIcon type={props.item.kind} size={11} color={color()} class="shrink-0" />
        <span class="calendar-event-chip__label">{props.item.title}</span>
      </button>
    )
  }

  function DayItemChip(props: { item: DayItem; day?: Date }) {
    return (
      <Show
        when={props.item.kind === "event"}
        fallback={<TrellisChip item={props.item as Exclude<DayItem, { kind: "event" }>} />}
      >
        <EventChip occ={(props.item as Extract<DayItem, { kind: "event" }>).occ} day={props.day} />
      </Show>
    )
  }

  // Month grid cells for the active month view
  const monthCells = createMemo(() => {
    const a = anchor()
    const first = new Date(a.getFullYear(), a.getMonth(), 1).getDay()
    const total = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = Array(first).fill(null)
    for (let i = 1; i <= total; i++) cells.push(new Date(a.getFullYear(), a.getMonth(), i))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  })

  const monthOccurrences = createMemo(() => {
    const range = viewRange()
    const list: CalendarOccurrence[] = []
    for (const event of visibleEvents()) {
      list.push(...eventOccurrencesInRange(event, range.start, range.end))
    }
    return list
  })

  const multiDayLaneKeys = createMemo(
    () => new Set(monthOccurrences().filter(isMultiDayOccurrence).map(occurrenceLaneKey)),
  )

  const singleDayEventsOnDay = (d: Date) =>
    eventsOnDay(d).filter((occ) => !multiDayLaneKeys().has(occurrenceLaneKey(occ)))

  const monthLaneSlotsByIndex = createMemo(() => {
    const cells = monthCells()
    const map = new Map<number, (LaneSlot | null)[]>()
    const occByKey = new Map(monthOccurrences().map((o) => [occurrenceLaneKey(o), o]))
    const globalLaneMap = new Map<string, number>()

    for (let i = 0; i < cells.length; i += 7) {
      const rowCells = cells.slice(i, i + 7)
      const anchorDate = rowCells.find((c) => c !== null)
      if (!anchorDate) continue
      const weekDates = Array.from({ length: 7 }, (_, d) => addDays(startOfWeek(anchorDate), d))
      const { lanes } = getMultiDayLanes(weekDates, monthOccurrences(), globalLaneMap, MAX_VISIBLE_MULTI_DAY_LANES)
      const slotsByCol = laneSlotsForWeek(weekDates, lanes, occByKey)
      rowCells.forEach((_, colIdx) => {
        map.set(i + colIdx, slotsByCol[colIdx] ?? [])
      })
    }
    return map
  })

  const weekDays = createMemo(() => {
    const s = startOfWeek(anchor())
    return Array.from({ length: 7 }, (_, i) => addDays(s, i))
  })

  const weekOccurrences = createMemo(() => {
    const range = viewRange()
    const list: CalendarOccurrence[] = []
    for (const event of visibleEvents()) {
      list.push(...eventOccurrencesInRange(event, range.start, range.end))
    }
    return list
  })

  const weekMultiDayLaneKeys = createMemo(
    () => new Set(weekOccurrences().filter(isMultiDayOccurrence).map(occurrenceLaneKey)),
  )

  const weekLaneSlotsByCol = createMemo(() => {
    const days = weekDays()
    const occByKey = new Map(weekOccurrences().map((o) => [occurrenceLaneKey(o), o]))
    const { lanes } = getMultiDayLanes(days, weekOccurrences(), new Map(), MAX_VISIBLE_MULTI_DAY_LANES)
    return laneSlotsForWeek(days, lanes, occByKey)
  })

  const compactLaneSlots = (slots: Array<LaneSlot | null>) => slots.filter((s): s is LaneSlot => s != null)

  const singleDayEventsOnDayWeek = (d: Date) =>
    eventsOnDay(d).filter((occ) => !weekMultiDayLaneKeys().has(occurrenceLaneKey(occ)))

  const yearQuarters = createMemo(() => {
    const year = anchor().getFullYear()
    return [0, 1, 2, 3].map((q) => ({
      quarter: q + 1,
      months: [0, 1, 2].map((i) => ({ year, month: q * 3 + i })),
    }))
  })

  // ── Day view (horizontal EPG timeline) ─────────────────────────────────
  const dayOccurrences = createMemo(() => eventsOnDay(anchor()))
  const epgLanes = createMemo(() => buildLanes(dayOccurrences(), anchor()))
  const allDayItems = createMemo(() => dayOccurrences().filter((o) => o.event.allDay))
  const [nowClock, setNowClock] = createSignal(new Date())

  createEffect(() => {
    if (viewMode() !== "day") return
    const tick = () => setNowClock(new Date())
    tick()
    const id = window.setInterval(tick, 1000)
    onCleanup(() => clearInterval(id))
  })

  const [tl, setTl] = createStore<{
    zoom: number
    scrollLeft: number
    width: number
    drag: { id: string; startMin: number; endMin: number } | null
  }>({ zoom: 100, scrollLeft: 0, width: 0, drag: null })

  let epgScroll: HTMLDivElement | undefined

  const epgHourW = () => hourWidth(tl.zoom)
  const epgTrackW = () => epgHourW() * 24
  const epgWallMin = () => clampMin(nowClock().getHours() * 60 + nowClock().getMinutes() + nowClock().getSeconds() / 60)
  const epgNowX = () => (epgWallMin() / 60) * epgHourW()

  const epgTimeAtClientX = (clientX: number) => {
    if (!epgScroll) return 0
    const rect = epgScroll.getBoundingClientRect()
    const contentX = epgScroll.scrollLeft + (clientX - rect.left) - EPG_LABEL_W
    return clampMin((contentX / epgHourW()) * 60)
  }

  const epgZoomAt = (next: number, clientX: number) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(next)))
    if (z === tl.zoom) return
    const min = epgTimeAtClientX(clientX)
    setTl("zoom", z)
    requestAnimationFrame(() => {
      if (!epgScroll) return
      const rect = epgScroll.getBoundingClientRect()
      const target = EPG_LABEL_W + (min / 60) * hourWidth(z) - (clientX - rect.left)
      epgScroll.scrollLeft = Math.max(0, target)
      setTl("scrollLeft", epgScroll.scrollLeft)
    })
  }

  const epgZoomBy = (factor: number) => {
    if (!epgScroll) return
    const rect = epgScroll.getBoundingClientRect()
    epgZoomAt(tl.zoom * factor, rect.left + rect.width / 2)
  }

  const epgScrollToMin = (min: number, smooth = true) => {
    if (!epgScroll) return
    const x = EPG_LABEL_W + (clampMin(min) / 60) * epgHourW()
    epgScroll.scrollTo({ left: Math.max(0, x - epgScroll.clientWidth / 2), behavior: smooth ? "smooth" : "auto" })
  }

  const epgNowDir = () => {
    if (!isToday(anchor())) return null
    const x = epgNowX()
    if (x < tl.scrollLeft) return "left" as const
    if (x > tl.scrollLeft + (tl.width - EPG_LABEL_W)) return "right" as const
    return null
  }

  function MiniMonth(props: { year: number; month: number; fill?: boolean }) {
    const first = () => new Date(props.year, props.month, 1).getDay()
    const total = () => new Date(props.year, props.month + 1, 0).getDate()
    const cells = createMemo(() => {
      const c: (number | null)[] = Array(first()).fill(null)
      for (let i = 1; i <= total(); i++) c.push(i)
      if (props.fill) {
        while (c.length < 42) c.push(null)
        return c.slice(0, 42)
      }
      return c
    })
    const hasEvents = (day: number) => (occurrencesByDay().get(dateKey(props.year, props.month, day))?.length ?? 0) > 0
    const status = () => monthStatus(props.year, props.month)
    const isViewYear = () => props.year === new Date().getFullYear()
    return (
      <div
        class="calendar-minimonth"
        classList={{
          "calendar-minimonth--fill": props.fill,
          "calendar-minimonth--current": props.fill && status() === "current" && isViewYear(),
          "calendar-minimonth--past": props.fill && status() === "past",
        }}
      >
        <button
          type="button"
          class="calendar-minimonth__title"
          onClick={() => {
            setAnchor(new Date(props.year, props.month, 1))
            setViewMode("month")
          }}
        >
          {MONTH_NAMES[props.month]}
        </button>
        <div class="calendar-minimonth__grid">
          <For each={WEEKDAY_MINI}>{(d) => <div class="calendar-minimonth__dow">{d}</div>}</For>
          <For each={cells()}>
            {(day) => (
              <Show when={day !== null} fallback={<div class="calendar-minimonth__pad" />}>
                {(() => {
                  const date = new Date(props.year, props.month, day!)
                  return (
                    <button
                      type="button"
                      class="calendar-minimonth__day"
                      classList={{
                        "calendar-minimonth__day--today": isToday(date),
                        "calendar-minimonth__day--has": hasEvents(day!) && !isToday(date),
                      }}
                      onClick={() => pickDay(date)}
                    >
                      {day}
                      <Show when={hasEvents(day!)}>
                        <span class="calendar-minimonth__dot" />
                      </Show>
                    </button>
                  )
                })()}
              </Show>
            )}
          </For>
        </div>
      </div>
    )
  }

  function EpgBlock(props: { item: EpgItem; lane: EpgLane; day: Date }) {
    const id = props.item.occ.event.id
    const drag = () => (tl.drag && tl.drag.id === id ? tl.drag : null)
    const startMin = () => drag()?.startMin ?? props.item.startMin
    const endMin = () => drag()?.endMin ?? props.item.endMin
    const left = () => (startMin() / 60) * epgHourW()
    const width = () => Math.max(((endMin() - startMin()) / 60) * epgHourW(), 10)
    const top = () => props.item.sub * EPG_ITEM_HEIGHT
    let moved = false

    const begin = (mode: "move" | "resize-left" | "resize-right", e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const originX = e.clientX
      const oStart = props.item.startMin
      const oEnd = props.item.endMin
      const dur = oEnd - oStart
      const step = Math.max(1, tickMinutes(tl.zoom))
      const cw = epgHourW()
      let active = mode !== "move"
      moved = active
      document.documentElement.style.cursor = mode === "move" ? "grabbing" : "col-resize"

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - originX
        if (!active) {
          if (Math.abs(dx) < 4) return
          active = true
          moved = true
        }
        const dm = snap((dx / cw) * 60, step)
        if (mode === "move") {
          const s = Math.max(0, Math.min(DAY_MINUTES - dur, oStart + dm))
          setTl("drag", { id, startMin: s, endMin: s + dur })
        } else if (mode === "resize-left") {
          const s = Math.max(0, Math.min(oEnd - step, oStart + dm))
          setTl("drag", { id, startMin: s, endMin: oEnd })
        } else {
          const en = Math.min(DAY_MINUTES, Math.max(oStart + step, oEnd + dm))
          setTl("drag", { id, startMin: oStart, endMin: en })
        }
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        document.documentElement.style.cursor = ""
        const d = tl.drag
        setTl("drag", null)
        if (d && active) void handleSetEventTimes(id, props.day, d.startMin, d.endMin)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp, { once: true })
    }

    return (
      <div
        class="epg__event"
        classList={{
          "epg__event--selected": activeEventId() === id,
          "epg__event--dragging": drag() !== null,
          "fresh-overlay": store.fresh.includes(id),
        }}
        style={{
          left: `${left()}px`,
          width: `${width()}px`,
          top: `${top()}px`,
          height: `${EPG_ITEM_HEIGHT - 4}px`,
          background: `color-mix(in oklch, ${eventTypeColor(props.lane.type)} 22%, var(--surface-base))`,
          "border-left-color": eventTypeColor(props.lane.type),
        }}
        title={`${props.item.occ.event.title} · ${formatEventTime(props.item.occ.event)}`}
        onPointerDown={(e) => begin("move", e)}
        onClick={(e) => {
          e.stopPropagation()
          if (moved) {
            moved = false
            return
          }
          openEventDialog(id, props.day)
        }}
      >
        <span class="epg__event-resize epg__event-resize--l" onPointerDown={(e) => begin("resize-left", e)} />
        <span class="epg__event-title">{props.item.occ.event.title}</span>
        <span class="epg__event-time">{formatEventTime(props.item.occ.event)}</span>
        <span class="epg__event-resize epg__event-resize--r" onPointerDown={(e) => begin("resize-right", e)} />
      </div>
    )
  }

  function DayTimeline(props: { day: Date }) {
    onMount(() => {
      const el = epgScroll
      if (!el) return

      const ro = new ResizeObserver(() => setTl("width", el.clientWidth))
      ro.observe(el)
      setTl("width", el.clientWidth)

      const onScroll = () => setTl("scrollLeft", el.scrollLeft)
      el.addEventListener("scroll", onScroll, { passive: true })

      const onWheel = (e: WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        epgZoomAt(tl.zoom * Math.exp(-e.deltaY * 0.01), e.clientX)
      }
      el.addEventListener("wheel", onWheel, { passive: false })

      let pinch: { dist: number; cx: number } | null = null
      const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2)
          pinch = { dist: spread(e.touches), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 }
      }
      const onTouchMove = (e: TouchEvent) => {
        if (!pinch || e.touches.length !== 2) return
        e.preventDefault()
        const d = spread(e.touches)
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
        if (pinch.dist > 0) epgZoomAt(tl.zoom * (d / pinch.dist), cx)
        pinch = { dist: d, cx }
      }
      const onTouchEnd = () => {
        pinch = null
      }
      el.addEventListener("touchstart", onTouchStart, { passive: true })
      el.addEventListener("touchmove", onTouchMove, { passive: false })
      el.addEventListener("touchend", onTouchEnd, { passive: true })

      requestAnimationFrame(() => epgScrollToMin(isToday(props.day) ? epgWallMin() : 8 * 60, false))

      onCleanup(() => {
        ro.disconnect()
        el.removeEventListener("scroll", onScroll)
        el.removeEventListener("wheel", onWheel)
        el.removeEventListener("touchstart", onTouchStart)
        el.removeEventListener("touchmove", onTouchMove)
        el.removeEventListener("touchend", onTouchEnd)
      })
    })

    return (
      <div class="epg">
        <Show when={allDayItems().length > 0}>
          <div class="epg__allday">
            <span class="epg__allday-label">All day</span>
            <div class="epg__allday-list">
              <For each={allDayItems()}>{(occ) => <EventChip occ={occ} day={props.day} />}</For>
            </div>
          </div>
        </Show>
        <div class="epg__scroll" ref={(el) => (epgScroll = el)}>
          <div class="epg__content" style={{ width: `${EPG_LABEL_W + epgTrackW()}px` }}>
            <div class="epg__head" style={{ height: `${EPG_HEADER_H}px` }}>
              <button
                type="button"
                class="epg__corner"
                classList={{ "epg__corner--offscreen": epgNowDir() !== null }}
                style={{ width: `${EPG_LABEL_W}px` }}
                title="Jump to current time"
                onClick={() => epgScrollToMin(epgWallMin())}
              >
                <Show when={epgNowDir() === "left"}>
                  <ArrowLeft size={12} />
                </Show>
                <span class="epg__corner-label">{formatNowLabel(nowClock())}</span>
                <Show when={epgNowDir() === "right"}>
                  <ArrowRight size={12} />
                </Show>
              </button>
              <div class="epg__axis" style={{ width: `${epgTrackW()}px` }}>
                <For each={axisTicks(tl.zoom)}>
                  {(t) => (
                    <span class="epg__tick" style={{ left: `${t.left}px` }}>
                      {t.label}
                    </span>
                  )}
                </For>
              </div>
            </div>

            <div class="epg__lanes">
              <Show
                when={epgLanes().length > 0}
                fallback={
                  <div class="epg__empty" onDblClick={() => openNewEvent(props.day)}>
                    No timed events — double-click to add one
                  </div>
                }
              >
                <For each={epgLanes()}>
                  {(lane) => (
                    <div class="epg__lane" style={{ height: `${lane.subCount * EPG_ITEM_HEIGHT + EPG_LANE_PAD}px` }}>
                      <div class="epg__lane-label" style={{ width: `${EPG_LABEL_W}px` }}>
                        <span class="epg__lane-swatch" style={{ background: eventTypeColor(lane.type) }} />
                        <span class="epg__lane-name">{eventTypeLabel(lane.type)}</span>
                        <span class="epg__lane-count">{lane.items.length}</span>
                      </div>
                      <div
                        class="epg__track"
                        style={{ width: `${epgTrackW()}px`, "--epg-hour-w": `${epgHourW()}px` }}
                        onDblClick={() => openNewEvent(props.day)}
                      >
                        <For each={lane.items}>{(item) => <EpgBlock item={item} lane={lane} day={props.day} />}</For>
                      </div>
                    </div>
                  )}
                </For>
              </Show>

              <Show when={isToday(props.day)}>
                <div class="epg__now" style={{ left: `${EPG_LABEL_W + epgNowX()}px` }} aria-hidden="true">
                  <span class="epg__now-pill">{formatClock(epgWallMin())}</span>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const focusCalendar = (e: PointerEvent) => {
    if (isEditableTarget(e.target)) return
    focusRoot?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={(el) => {
        focusRoot = el
      }}
      class="calendar-projection-focus h-full min-h-0 outline-none"
      tabIndex={-1}
      onPointerDown={focusCalendar}
    >
      <ResizableSidebarLayout id="calendar" defaultWidth={244}>
        <AffordanceShell
          id="calendar"
          viewClass="calendar-projection"
          mainClass="calendar-projection-main"
          sidebarToggle
          padded={false}
          scroll={false}
          contentClass={`calendar-grid${viewMode() === "day" ? " calendar-grid--day" : ""}`}
          title={
            <div class="calendar-header-title">
              <span class="calendar-period-label font-mono">{periodLabel()}</span>
              <div class="flex items-center gap-0.5">
                <IconButton
                  icon="chevron-left"
                  variant="ghost"
                  size="small"
                  onClick={() => step(-1)}
                  aria-label="Previous"
                />
                <Button size="small" variant="ghost" onClick={goToday}>
                  Today
                </Button>
                <IconButton
                  icon="chevron-right"
                  variant="ghost"
                  size="small"
                  onClick={() => step(1)}
                  aria-label="Next"
                />
              </div>
            </div>
          }
          tabs={VIEW_OPTIONS.map((opt) => ({ id: opt.mode, label: opt.label }))}
          tab={viewMode()}
          onTab={(id) => switchMode(id as ViewMode)}
          onRefresh={() => void store.hydrate({ toast: false })}
          refreshTitle="Refresh calendar data"
          addLabel="New event"
          onAdd={() => openNewEvent()}
          sidebar={
            <ResizableRouteSidebar
              title="Calendar"
              width={244}
              footer={
                <Button size="small" variant="ghost" class="w-full justify-start" onClick={() => openNewEvent()}>
                  <Plus class="size-4" />
                  <span>New event</span>
                </Button>
              }
            >
              <div class="calendar-mini">
                <div class="calendar-mini__head">
                  <span class="calendar-mini__month">
                    {MONTH_NAMES[miniDate().getMonth()]} {miniDate().getFullYear()}
                  </span>
                  <div class="flex gap-0.5">
                    <IconButton
                      icon="chevron-left"
                      variant="ghost"
                      size="small"
                      aria-label="Previous month"
                      onClick={() => setMiniDate(addMonths(miniDate(), -1))}
                    />
                    <IconButton
                      icon="chevron-right"
                      variant="ghost"
                      size="small"
                      aria-label="Next month"
                      onClick={() => setMiniDate(addMonths(miniDate(), 1))}
                    />
                  </div>
                </div>
                <div class="calendar-mini__grid">
                  <For each={WEEKDAY_MINI}>{(d) => <div class="calendar-mini__dow">{d}</div>}</For>
                  <For each={miniCells()}>
                    {(cell) => (
                      <Show when={cell !== null} fallback={<div />}>
                        <button
                          type="button"
                          class="calendar-mini__day"
                          classList={{
                            "calendar-mini__day--today": isToday(cell!),
                            "calendar-mini__day--selected": sameYMD(cell!, anchor()) && !isToday(cell!),
                            "calendar-mini__day--has": miniEventDays().has(keyOf(cell!)) && !isToday(cell!),
                          }}
                          onClick={() => pickDay(cell!)}
                        >
                          {cell!.getDate()}
                          <Show when={miniEventDays().has(keyOf(cell!))}>
                            <span class="calendar-mini__dot" />
                          </Show>
                        </button>
                      </Show>
                    )}
                  </For>
                </div>
              </div>

              <div class="calendar-filter">
                <div class="calendar-filter__head">
                  <span class="calendar-filter__title">Filter</span>
                  <button type="button" class="calendar-filter__toggle" onClick={toggleAllTypes}>
                    {allTypesShown() ? "None" : "All"}
                  </button>
                </div>
                <div class="flex flex-col gap-0.5">
                  <For each={CALENDAR_EVENT_TYPES}>
                    {(type) => {
                      const meta = CALENDAR_EVENT_TYPE_META[type]
                      const Icon = meta.icon
                      const shown = () => !hiddenTypes().has(type)
                      return (
                        <button
                          type="button"
                          class="calendar-filter__row"
                          classList={{ "calendar-filter__row--off": !shown() }}
                          onClick={() => toggleType(type)}
                        >
                          <span
                            class="calendar-filter__swatch"
                            style={{
                              background: shown() ? meta.color : "transparent",
                              "border-color": shown() ? meta.color : "var(--border-weak-base)",
                            }}
                          />
                          <Icon class="size-3.5 shrink-0" />
                          <span class="flex-1 text-left truncate">{meta.label}</span>
                          <span class="calendar-filter__count">{typeCounts().get(type) ?? 0}</span>
                        </button>
                      )
                    }}
                  </For>
                  <div class="mt-2 mb-1 px-1 text-10-medium uppercase tracking-wide text-text-weaker">Trellis</div>
                  <For each={TRELLIS_KINDS}>
                    {(kind) => {
                      const meta = TRELLIS_KIND_META[kind]
                      const shown = () => !hiddenKinds().has(kind)
                      return (
                        <button
                          type="button"
                          class="calendar-filter__row"
                          classList={{ "calendar-filter__row--off": !shown() }}
                          onClick={() => toggleKind(kind)}
                        >
                          <span
                            class="calendar-filter__swatch"
                            style={{
                              background: shown() ? meta.color : "transparent",
                              "border-color": shown() ? meta.color : "var(--border-weak-base)",
                            }}
                          />
                          <EntityIcon type={kind} size={14} color="currentColor" class="shrink-0" />
                          <span class="flex-1 text-left truncate">{meta.label}</span>
                          <span class="calendar-filter__count">{kindCounts()[kind] ?? 0}</span>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </div>
            </ResizableRouteSidebar>
          }
        >
          {/* ── Day view (24h gantt) ── */}
          <Show when={viewMode() === "day"}>
            <div class="calendar-day-view" classList={{ "calendar-day-cell--past": dayStatus(anchor()) === "past" }}>
              <div class="calendar-day-view__head">
                <div class="calendar-day-view__head-date">
                  <span class="calendar-month__dow">{WEEKDAY_SHORT[anchor().getDay()]}</span>
                  <span
                    class="calendar-day-cell__num text-10-medium"
                    classList={{ "calendar-day-cell__num--today": dayStatus(anchor()) === "today" }}
                  >
                    {anchor().getDate()}
                  </span>
                </div>
                <div class="calendar-day-view__tools">
                  <div class="epg__zoom">
                    <button type="button" class="epg__zoom-btn" title="Zoom out" onClick={() => epgZoomBy(1 / 1.4)}>
                      <ZoomOut size={14} />
                    </button>
                    <button type="button" class="epg__zoom-btn" title="Zoom in" onClick={() => epgZoomBy(1.4)}>
                      <ZoomIn size={14} />
                    </button>
                  </div>
                  <Show when={isToday(anchor())}>
                    <time class="calendar-day-view__clock" datetime={nowClock().toISOString()}>
                      {formatNowLabel(nowClock())}
                    </time>
                  </Show>
                </div>
              </div>
              <DayTimeline day={anchor()} />
            </div>
          </Show>

          {/* ── Week view ── */}
          <Show when={viewMode() === "week"}>
            <div class="calendar-week">
              <div class="calendar-week__grid">
                <For each={weekDays()}>
                  {(day, dayIdx) => {
                    const status = () => dayStatus(day)
                    const laneSlots = () => compactLaneSlots(weekLaneSlotsByCol()[dayIdx()] ?? [])
                    const items = () => dayItems(day, singleDayEventsOnDayWeek(day))
                    return (
                      <div
                        class="calendar-day-cell calendar-week__col group"
                        classList={{
                          "calendar-day-cell--past": status() === "past",
                          "calendar-day-cell--today": status() === "today",
                        }}
                        onDblClick={() => openNewEvent(day)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.add("calendar-day-cell--drag-over")
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove("calendar-day-cell--drag-over")
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.classList.remove("calendar-day-cell--drag-over")
                          const dataRaw = e.dataTransfer ? e.dataTransfer.getData("text/plain") : ""
                          if (dataRaw) {
                            try {
                              const data = JSON.parse(dataRaw)
                              if (data && data.id && data.type === "event") {
                                void handleMoveEventToDay(data.id, day)
                              }
                            } catch (err) {
                              console.error("Drop on week day failed:", err)
                            }
                          }
                        }}
                      >
                        <div class="calendar-week__col-head">
                          <span class="calendar-month__dow">{WEEKDAY_SHORT[day.getDay()]}</span>
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              class="calendar-day-cell__add-btn opacity-0 group-hover:opacity-100 flex items-center justify-center size-4 rounded bg-surface-raised-base hover:bg-surface-base border border-border-base transition-all text-text-weak hover:text-text-strong"
                              title="Create event on this day"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewEvent(day)
                              }}
                            >
                              <Plus class="size-3" />
                            </button>
                            <button
                              type="button"
                              class="calendar-day-cell__num text-10-medium w-5 h-5 flex items-center justify-center rounded-full transition-colors"
                              classList={{
                                "calendar-day-cell__num--today": status() === "today",
                                "text-text-weak hover:bg-surface-raised-base": status() !== "today",
                              }}
                              onClick={() => setAnchor(new Date(day.getFullYear(), day.getMonth(), day.getDate()))}
                            >
                              {day.getDate()}
                            </button>
                          </div>
                        </div>
                        <div class="calendar-week__col-body">
                          <Show when={laneSlots().length > 0}>
                            <div class="calendar-day-cell__lanes flex flex-col gap-0.5">
                              <For each={laneSlots()}>{(slot) => <EventBarSegment slot={slot} day={day} />}</For>
                            </div>
                          </Show>
                          <div class="calendar-day-cell__single-day calendar-week__col-scroll">
                            <For each={items()}>{(item) => <DayItemChip item={item} day={day} />}</For>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* ── Month view ── */}
          <Show when={viewMode() === "month"}>
            <div class="calendar-month">
              <div class="calendar-month__dow-row">
                <For each={WEEKDAY_SHORT}>{(d) => <div class="calendar-month__dow">{d}</div>}</For>
              </div>
              <div class="calendar-month__grid">
                <For each={monthCells()}>
                  {(cell, index) => {
                    const status = () => (cell ? dayStatus(cell) : "future")
                    const laneSlots = () => compactLaneSlots(monthLaneSlotsByIndex().get(index()) ?? [])
                    const items = () => (cell ? dayItems(cell, singleDayEventsOnDay(cell)) : [])
                    return (
                      <div
                        class="calendar-day-cell group"
                        classList={{
                          "calendar-day-cell--past": cell !== null && status() === "past",
                          "calendar-day-cell--today": cell !== null && status() === "today",
                        }}
                        onDragOver={(e) => {
                          if (cell) {
                            e.preventDefault()
                            e.currentTarget.classList.add("calendar-day-cell--drag-over")
                          }
                        }}
                        onDragLeave={(e) => {
                          if (cell) {
                            e.currentTarget.classList.remove("calendar-day-cell--drag-over")
                          }
                        }}
                        onDrop={(e) => {
                          if (cell) {
                            e.preventDefault()
                            e.currentTarget.classList.remove("calendar-day-cell--drag-over")
                            const dataRaw = e.dataTransfer ? e.dataTransfer.getData("text/plain") : ""
                            if (dataRaw) {
                              try {
                                const data = JSON.parse(dataRaw)
                                if (data && data.id && data.type === "event") {
                                  void handleMoveEventToDay(data.id, cell)
                                }
                              } catch (err) {
                                console.error("Drop on month day failed:", err)
                              }
                            }
                          }
                        }}
                      >
                        <Show when={cell !== null}>
                          <div class="flex items-center justify-between mb-0.5">
                            <button
                              type="button"
                              class="calendar-day-cell__num text-10-medium w-5 h-5 flex items-center justify-center rounded-full transition-colors"
                              classList={{
                                "calendar-day-cell__num--today": status() === "today",
                                "text-text-weak hover:bg-surface-raised-base": status() !== "today",
                              }}
                              onClick={() =>
                                setAnchor(new Date(cell!.getFullYear(), cell!.getMonth(), cell!.getDate()))
                              }
                              onDblClick={() => openNewEvent(cell!)}
                            >
                              {cell!.getDate()}
                            </button>
                            <button
                              type="button"
                              class="calendar-day-cell__add-btn opacity-0 group-hover:opacity-100 flex items-center justify-center size-4 rounded bg-surface-raised-base hover:bg-surface-base border border-border-base transition-all text-text-weak hover:text-text-strong"
                              title="Create event on this day"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewEvent(cell!)
                              }}
                            >
                              <Plus class="size-3" />
                            </button>
                          </div>
                          <div class="calendar-day-cell__events">
                            <Show when={laneSlots().length > 0}>
                              <div class="calendar-day-cell__lanes flex flex-col gap-0.5">
                                <For each={laneSlots()}>{(slot) => <EventBarSegment slot={slot} day={cell!} />}</For>
                              </div>
                            </Show>
                            <div class="calendar-day-cell__single-day">
                              <For each={items().slice(0, MAX_VISIBLE_DAY_EVENTS)}>
                                {(item) => <DayItemChip item={item} day={cell!} />}
                              </For>
                              <Show when={items().length > MAX_VISIBLE_DAY_EVENTS}>
                                <button
                                  type="button"
                                  class="calendar-event-more"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    pickDay(cell!)
                                  }}
                                >
                                  +{items().length - MAX_VISIBLE_DAY_EVENTS} more
                                </button>
                              </Show>
                            </div>
                          </div>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* ── Year view (quarters as columns, months top-down) ── */}
          <Show when={viewMode() === "year"}>
            <div class="calendar-yearview">
              <For each={yearQuarters()}>
                {(col) => {
                  const isCurrentQ = () =>
                    anchor().getFullYear() === new Date().getFullYear() && col.quarter - 1 === currentQuarterIndex()
                  return (
                    <div class="calendar-yearcol" classList={{ "calendar-yearcol--current": isCurrentQ() }}>
                      <div class="calendar-yearcol__label">Q{col.quarter}</div>
                      <div class="calendar-yearcol__months">
                        <For each={col.months}>{(m) => <MiniMonth year={m.year} month={m.month} fill />}</For>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </AffordanceShell>
      </ResizableSidebarLayout>
    </div>
  )
}

/** Monthly calendar of issues, work units, milestones, and manual events. */
export function CalendarView() {
  return (
    <TrellisStoreScope>
      <CalendarViewInner />
    </TrellisStoreScope>
  )
}

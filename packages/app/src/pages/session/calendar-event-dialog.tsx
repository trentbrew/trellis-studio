import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { useTrellisStore } from "@/context/trellis-store"
import { EntityIcon } from "@/lib/entity-theme"
import { MetaField, Pill, SectionHeader } from "@/components/affordance"
import {
  type CalendarEventColor,
  type CalendarEventRecord,
  combineLocalDateTime,
  formatEventTime,
  instantLocalDayParts,
  localDateInputValue,
  localTimeInputValue,
  parseDateInputValue,
} from "@/lib/calendar/event-model"
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_META,
  type CalendarEventType,
  DEFAULT_CALENDAR_EVENT_TYPE,
  eventTypeColor,
  eventTypeLabel,
} from "@/lib/calendar/event-types"
import {
  formatRecurrence,
  parseRecurrence,
  type RecurrenceFrequency,
  type RecurrenceRule,
  serializeRecurrence,
} from "@/lib/calendar/recurrence"
import { apiDeleteCalendarEvent, apiSaveCalendarEvent } from "@/lib/calendar/event-api"

/** Legacy priority palette (kept for issue/work-unit dots elsewhere). */
export const CALENDAR_EVENT_CHIP_COLOR: Record<CalendarEventColor, string> = {
  default: "var(--text-interactive-base)",
  critical: "var(--icon-error)",
  high: "var(--icon-warning)",
  medium: "var(--icon-info)",
  low: "var(--text-weaker)",
}

const fieldClass =
  "w-full rounded-md border border-border-weaker-base bg-surface-base px-2.5 py-1.5 text-12-regular text-text-strong focus:outline-none focus:ring-1 focus:ring-border-weak-base"

type FreqOption = "none" | RecurrenceFrequency

const FREQ_OPTIONS: { value: FreqOption; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday (Mon–Fri)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
]

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]

type SideTab = "details" | "activity"

function shortId(id: string) {
  if (!id.includes(":")) return id
  return id.split(":").slice(1).join(":")
}

function formatTimestamp(value: string | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const MONTH_NAMES_MINI = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAY_MINI_HEADERS = ["S", "M", "T", "W", "T", "F", "S"]

function MiniCalendar(props: {
  year: number
  month: number
  selectedDay: string
  onSelect: (dateStr: string) => void
}) {
  const [viewYear, setViewYear] = createSignal(props.year)
  const [viewMonth, setViewMonth] = createSignal(props.month)

  createEffect(() => {
    setViewYear(props.year)
    setViewMonth(props.month)
  })

  const daysInMonth = () => new Date(viewYear(), viewMonth() + 1, 0).getDate()
  const firstDayOfWeek = () => new Date(viewYear(), viewMonth(), 1).getDay()

  const cells = createMemo(() => {
    const total = daysInMonth()
    const pad = firstDayOfWeek()
    const c: (number | null)[] = []
    for (let i = 0; i < pad; i++) c.push(null)
    for (let d = 1; d <= total; d++) c.push(d)
    while (c.length < 42) c.push(null)
    return c
  })

  const isSelected = (day: number) => {
    const d = new Date(viewYear(), viewMonth(), day)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return props.selectedDay === `${yyyy}-${mm}-${dd}`
  }

  const isToday = (day: number) => {
    const now = new Date()
    return viewYear() === now.getFullYear() && viewMonth() === now.getMonth() && day === now.getDate()
  }

  const selectDay = (day: number) => {
    const d = new Date(viewYear(), viewMonth(), day)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    props.onSelect(`${yyyy}-${mm}-${dd}`)
  }

  const prevMonth = () => {
    if (viewMonth() === 0) {
      setViewMonth(11)
      setViewYear(viewYear() - 1)
    } else {
      setViewMonth(viewMonth() - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth() === 11) {
      setViewMonth(0)
      setViewYear(viewYear() + 1)
    } else {
      setViewMonth(viewMonth() + 1)
    }
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="text-11-medium text-text-weaker hover:text-text-base transition-colors px-2 py-1"
          onClick={prevMonth}
        >
          <Icon name="chevron-left" size="small" />
        </button>
        <span class="text-12-medium text-text-strong">
          {MONTH_NAMES_MINI[viewMonth()]} {viewYear()}
        </span>
        <button
          type="button"
          class="text-11-medium text-text-weaker hover:text-text-base transition-colors px-2 py-1"
          onClick={nextMonth}
        >
          <Icon name="chevron-right" size="small" />
        </button>
      </div>
      <div class="grid grid-cols-7 gap-0.5 text-center">
        <For each={WEEKDAY_MINI_HEADERS}>{(d) => <div class="text-10-medium text-text-weaker py-1">{d}</div>}</For>
        <For each={cells()}>
          {(day) => (
            <Show when={day !== null} fallback={<div />}>
              <button
                type="button"
                class="size-7 rounded-md text-11-medium transition-colors flex items-center justify-center"
                classList={{
                  "bg-accent-base text-on-accent-base": isSelected(day!),
                  "text-text-strong hover:bg-surface-raised-base": !isSelected(day!) && !isToday(day!),
                  "text-accent-base font-semibold": !isSelected(day!) && isToday(day!),
                }}
                onClick={() => selectDay(day!)}
              >
                {day}
              </button>
            </Show>
          )}
        </For>
      </div>
    </div>
  )
}

export function CalendarEventDialog(props: {
  year: number
  month: number
  day: number
  eventId: string
  events: CalendarEventRecord[]
  onSaved?: (id: string) => void
}) {
  const dialog = useDialog()
  const sdk = useSDK()
  const store = useTrellisStore()
  const [saving, setSaving] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [sideTab, setSideTab] = createSignal<SideTab>("details")

  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      if (copyTimer) clearTimeout(copyTimer)
      copyTimer = setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to copy",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }
  const isNew = createMemo(() => props.eventId === "__new__")
  const existing = createMemo(() => props.events.find((event) => event.id === props.eventId))

  const [title, setTitle] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [eventType, setEventType] = createSignal<CalendarEventType>(DEFAULT_CALENDAR_EVENT_TYPE)
  const [allDay, setAllDay] = createSignal(true)
  const [startDate, setStartDate] = createSignal("")
  const [startTime, setStartTime] = createSignal("09:00")
  const [hasEnd, setHasEnd] = createSignal(false)
  const [endDate, setEndDate] = createSignal("")
  const [endTime, setEndTime] = createSignal("10:00")

  // Recurrence
  const [freq, setFreq] = createSignal<FreqOption>("none")
  const [interval, setInterval] = createSignal(1)
  const [weekdays, setWeekdays] = createSignal<number[]>([])
  const [untilDate, setUntilDate] = createSignal("")

  const resetDraft = (event?: CalendarEventRecord) => {
    const defaultStart = localDateInputValue(props.year, props.month, props.day)

    if (event) {
      setTitle(event.title)
      setDescription(event.description)
      setEventType(event.eventType)
      setAllDay(event.allDay)
      const startParts = instantLocalDayParts(event.startAt, event.allDay)
      setStartDate(startParts ? localDateInputValue(startParts.year, startParts.month, startParts.day) : defaultStart)
      setStartTime(localTimeInputValue(event.startAt))
      const endParts = instantLocalDayParts(event.endAt, event.allDay)
      const sameInstant = event.endAt === event.startAt
      const sameDay =
        startParts &&
        endParts &&
        startParts.year === endParts.year &&
        startParts.month === endParts.month &&
        startParts.day === endParts.day
      const hasDistinctEnd = !sameInstant && (!sameDay || !event.allDay)
      setHasEnd(hasDistinctEnd)
      if (endParts) {
        setEndDate(localDateInputValue(endParts.year, endParts.month, endParts.day))
        setEndTime(localTimeInputValue(event.endAt))
      } else {
        setEndDate(defaultStart)
        setEndTime("10:00")
      }

      const rule = parseRecurrence(event.recurrence)
      setFreq(rule ? rule.frequency : "none")
      setInterval(rule?.interval ?? 1)
      setWeekdays(rule?.weekdays ?? [])
      setUntilDate(rule?.endDate ?? "")
      return
    }

    setTitle("")
    setDescription("")
    setEventType(DEFAULT_CALENDAR_EVENT_TYPE)
    setAllDay(true)
    setStartDate(defaultStart)
    setStartTime("09:00")
    setHasEnd(false)
    setEndDate(defaultStart)
    setEndTime("10:00")
    setFreq("none")
    setInterval(1)
    setWeekdays([])
    setUntilDate("")
  }

  createEffect(() => {
    if (props.eventId === "__new__") {
      resetDraft()
      return
    }
    resetDraft(existing())
  })

  const close = () => dialog.close()

  const startParts = () => parseDateInputValue(startDate())
  const endParts = () => parseDateInputValue(endDate())

  const buildStartAt = () => {
    const parts = startParts()
    if (!parts) return combineLocalDateTime(props.year, props.month, props.day, startTime(), allDay())
    return combineLocalDateTime(parts.year, parts.month, parts.day, startTime(), allDay())
  }

  const buildEndAt = () => {
    if (!hasEnd()) return buildStartAt()
    const parts = endParts() ?? startParts()
    if (!parts) return buildStartAt()
    return combineLocalDateTime(parts.year, parts.month, parts.day, endTime(), allDay())
  }

  const showInterval = () => freq() === "daily" || freq() === "weekly" || freq() === "monthly" || freq() === "yearly"
  const showWeekdays = () => freq() === "weekly"

  const buildRecurrence = (): string | null => {
    const f = freq()
    if (f === "none") return null
    const rule: RecurrenceRule = { frequency: f }
    if (showInterval()) rule.interval = Math.max(1, Math.floor(interval() || 1))
    if (showWeekdays() && weekdays().length) rule.weekdays = [...weekdays()].sort((a, b) => a - b)
    if (untilDate()) rule.endDate = untilDate()
    return serializeRecurrence(rule)
  }

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const validateSchedule = () => {
    const start = new Date(buildStartAt())
    const end = new Date(buildEndAt())
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Invalid date or time."
    if (end.getTime() < start.getTime()) return "End must be after start."
    if (freq() !== "none" && untilDate()) {
      const startDay = startParts()
      const until = parseDateInputValue(untilDate())
      if (startDay && until) {
        const s = new Date(startDay.year, startDay.month, startDay.day).getTime()
        const u = new Date(until.year, until.month, until.day).getTime()
        if (u < s) return "Repeat-until must be on or after the start date."
      }
    }
    return undefined
  }

  const saveEvent = async () => {
    const trimmed = title().trim()
    if (!trimmed) {
      showToast({ variant: "error", title: "Title required", description: "Give the event a title before saving." })
      return
    }
    const scheduleError = validateSchedule()
    if (scheduleError) {
      showToast({ variant: "error", title: "Invalid schedule", description: scheduleError })
      return
    }
    setSaving(true)
    try {
      const id = isNew() ? `calendar_event:${crypto.randomUUID()}` : props.eventId
      await apiSaveCalendarEvent(sdk.fetch, sdk.url, sdk.directory, {
        id,
        title: trimmed,
        description: description().trim() || null,
        startAt: buildStartAt(),
        endAt: buildEndAt(),
        allDay: allDay(),
        eventType: eventType(),
        recurrence: buildRecurrence(),
        color: "default",
      })
      await store.refresh(false)
      props.onSaved?.(id)
      close()
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to save event",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async () => {
    if (isNew()) return
    setSaving(true)
    try {
      await apiDeleteCalendarEvent(sdk.fetch, sdk.url, sdk.directory, props.eventId)
      await store.refresh(false)
      close()
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to delete event",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  const recurrenceLabel = createMemo(() => {
    const rule = parseRecurrence(buildRecurrence() ?? "")
    return rule ? formatRecurrence(rule) : "Does not repeat"
  })

  const typeMeta = createMemo(() => CALENDAR_EVENT_TYPE_META[eventType()])
  const typeColor = createMemo(() => eventTypeColor(eventType()))

  const previewItem = createMemo<Pick<CalendarEventRecord, "startAt" | "endAt" | "allDay">>(() => ({
    startAt: buildStartAt(),
    endAt: buildEndAt(),
    allDay: allDay(),
  }))
  const scheduleLabel = createMemo(() => formatEventTime(previewItem()))

  return (
    <Dialog size="large" class="calendar-event-dialog">
      <div class="flex h-full min-h-0 flex-col">
        {/* Header bar — entity-dialog style */}
        <div class="shrink-0 border-b border-border-weaker-base px-4 py-3 flex items-center gap-3">
          <div class="flex-1 min-w-0 flex items-center gap-2">
            <span
              class="inline-flex items-center gap-2 rounded-full bg-surface-raised-base px-3 py-1.5 text-sm font-semibold uppercase tracking-wide"
              style={{ color: typeColor() }}
            >
              <EntityIcon type="event" size={18} color={typeColor()} />
              {isNew() ? "New event" : "Calendar event"}
            </span>
          </div>
          <IconButton icon="close-small" variant="ghost" onClick={close} />
        </div>

        {/* Two-column body */}
        <div class="flex min-h-0 flex-1">
          {/* Main form */}
          <form
            class="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              void saveEvent()
            }}
          >
            {/* Tag row - type dropdown + badges */}
            <div class="flex items-center gap-2 flex-wrap">
              <select
                class="h-6 rounded-md px-2 text-11-medium border-0 cursor-pointer transition-colors"
                style={{ color: typeColor(), background: "var(--surface-raised-base)" }}
                value={eventType()}
                onChange={(e) => setEventType(e.currentTarget.value as CalendarEventType)}
              >
                <For each={CALENDAR_EVENT_TYPES}>
                  {(value) => {
                    const meta = CALENDAR_EVENT_TYPE_META[value]
                    return (
                      <option value={value} style={{ color: meta.color }}>
                        {meta.label}
                      </option>
                    )
                  }}
                </For>
              </select>
              <Show when={allDay()}>
                <Pill>all day</Pill>
              </Show>
              <Show when={freq() !== "none"}>
                <Pill icon={<Icon name="refresh-cw" size="small" class="size-3" />}>recurring</Pill>
              </Show>
            </div>

            <div class="border-t border-border-weaker-base" />

            {/* Title */}
            <InlineInput
              placeholder="Event title"
              value={title()}
              onInput={(e: InputEvent) => setTitle((e.target as HTMLInputElement).value)}
              class="!text-2xl !text-text-strong !leading-tight !py-2 !font-semibold !border-0 !bg-transparent !px-0 focus:!ring-0"
              autofocus
            />

            <div class="border-t border-border-weaker-base" />

            {/* Description */}
            <section class="flex flex-col gap-2">
              <SectionHeader label="Description" icon="align-left" />
              <textarea
                class="min-h-16 w-full resize-y rounded-md border border-border-weaker-base bg-background-base px-2.5 py-2 text-13-regular text-text-base placeholder:text-text-weaker focus:outline-none focus:ring-1 focus:ring-border-weak-base"
                placeholder="Add a description…"
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
              />
            </section>

            <div class="border-t border-border-weaker-base" />

            {/* Schedule */}
            <section class="flex flex-col gap-3">
              <SectionHeader label="Schedule" icon="calendar" />

              {/* Mini Calendar + Schedule Fields side by side */}
              <div class="flex gap-4">
                {/* Left: Mini Calendar */}
                <MiniCalendar
                  year={props.year}
                  month={props.month}
                  selectedDay={startDate()}
                  onSelect={(dateStr) => {
                    setStartDate(dateStr)
                    if (!hasEnd()) setEndDate(dateStr)
                  }}
                />

                {/* Divider */}
                <div class="w-px bg-border-weaker-base self-stretch" />

                {/* Right: Schedule Fields */}
                <div class="flex flex-col gap-3 flex-1 min-w-0">
                  {/* Date + Time row */}
                  <div class="flex items-center gap-2">
                    <div class="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md border border-border-weaker-base bg-surface-base">
                      <Icon name="calendar" size="small" class="text-text-weaker" />
                      <input
                        type="date"
                        class="bg-transparent text-13-medium text-text-strong border-0 p-0 focus:outline-none focus:ring-0 cursor-pointer"
                        value={startDate()}
                        required
                        onInput={(e) => {
                          setStartDate(e.currentTarget.value)
                          if (!hasEnd()) setEndDate(e.currentTarget.value)
                        }}
                      />
                    </div>
                    <Show when={!allDay()}>
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-weaker-base bg-surface-base">
                        <Icon name="clock" size="small" class="text-text-weaker" />
                        <input
                          type="time"
                          class="bg-transparent text-13-medium text-text-strong border-0 p-0 focus:outline-none focus:ring-0 cursor-pointer"
                          value={startTime()}
                          onInput={(e) => setStartTime(e.currentTarget.value)}
                        />
                      </div>
                    </Show>
                  </div>

                  {/* All day / Timed toggle */}
                  <button
                    type="button"
                    class="self-start text-11-medium px-2 py-0.5 rounded-md bg-surface-raised-base hover:bg-surface-raised-hover transition-colors"
                    classList={{ "text-text-weaker": !allDay(), "text-text-strong": allDay() }}
                    onClick={() => {
                      const newAllDay = !allDay()
                      setAllDay(newAllDay)
                      if (!newAllDay && !hasEnd()) {
                        const [h, m] = startTime().split(":").map(Number)
                        const endH = Math.min(23, (h || 9) + 1)
                        setEndTime(`${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`)
                      }
                    }}
                  >
                    {allDay() ? "All day" : "Timed"}
                  </button>

                  {/* End time toggle */}
                  <Show when={!allDay()}>
                    <button
                      type="button"
                      class="flex items-center gap-2 text-11-regular text-text-weaker hover:text-text-base transition-colors"
                      onClick={() => {
                        const on = !hasEnd()
                        setHasEnd(on)
                        if (on && !endDate()) setEndDate(startDate())
                      }}
                    >
                      <input type="checkbox" checked={hasEnd()} class="pointer-events-none" />
                      End time
                    </button>
                  </Show>

                  <Show when={hasEnd() && !allDay()}>
                    <div class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border-weaker-base bg-surface-base">
                      <Icon name="clock" size="small" class="text-text-weaker" />
                      <input
                        type="time"
                        class="bg-transparent text-13-medium text-text-strong border-0 p-0 focus:outline-none focus:ring-0 cursor-pointer"
                        value={endTime()}
                        onInput={(e) => setEndTime(e.currentTarget.value)}
                      />
                      <span class="text-11-regular text-text-weaker">
                        on {endDate() !== startDate() ? endDate() : "same day"}
                      </span>
                      <Show when={endDate() !== startDate()}>
                        <input
                          type="date"
                          class="text-11-regular bg-transparent border-0 p-0 cursor-pointer"
                          value={endDate()}
                          min={startDate()}
                          onInput={(e) => setEndDate(e.currentTarget.value)}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
              </div>
            </section>

            <div class="border-t border-border-weaker-base" />

            {/* Repeat */}
            <section class="flex flex-col gap-3">
              <button
                type="button"
                class="flex items-center gap-2 text-11-medium text-text-weak hover:text-text-base transition-colors"
                onClick={() => {
                  const picker = document.getElementById("repeat-select")
                  if (picker) picker.click()
                }}
              >
                <Icon name="refresh-cw" size="small" />
                <span class={freq() !== "none" ? "text-text-strong" : ""}>
                  {freq() === "none" ? "Repeat" : FREQ_OPTIONS.find((o) => o.value === freq())?.label}
                </span>
              </button>
              <select
                id="repeat-select"
                class="absolute opacity-0 w-0 h-0"
                value={freq()}
                onChange={(e) => setFreq(e.currentTarget.value as FreqOption)}
              >
                <For each={FREQ_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
              </select>

              <Show when={freq() !== "none"}>
                <div class="flex flex-col gap-2 pl-6">
                  <Show when={showInterval()}>
                    <div class="flex items-center gap-2 text-11-regular text-text-weaker">
                      <span>Every</span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        class="w-14 h-7 text-center rounded-md border border-border-weaker-base bg-surface-base text-11-medium"
                        value={interval()}
                        onInput={(e) => setInterval(Number(e.currentTarget.value) || 1)}
                      />
                      <span>
                        {freq() === "daily"
                          ? "days"
                          : freq() === "weekly"
                            ? "weeks"
                            : freq() === "monthly"
                              ? "months"
                              : "years"}
                      </span>
                    </div>
                  </Show>

                  <Show when={showWeekdays()}>
                    <div class="flex flex-col gap-1">
                      <span class="text-11-regular text-text-weaker">On days</span>
                      <div class="flex gap-1">
                        <For each={WEEKDAY_LABELS}>
                          {(label, idx) => (
                            <button
                              type="button"
                              class="size-7 rounded-full text-10-medium border transition-colors"
                              classList={{
                                "bg-surface-raised-base border-border-weak-base text-text-strong":
                                  weekdays().includes(idx()),
                                "border-border-weaker-base text-text-weaker hover:border-border-weak-base":
                                  !weekdays().includes(idx()),
                              }}
                              onClick={() => toggleWeekday(idx())}
                            >
                              {label}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>

                  <div class="flex items-center gap-2 text-11-regular text-text-weaker">
                    <span>Until</span>
                    <input
                      type="date"
                      class="bg-transparent text-11-regular cursor-pointer"
                      value={untilDate()}
                      min={startDate()}
                      onInput={(e) => setUntilDate(e.currentTarget.value)}
                    />
                  </div>
                </div>
              </Show>
            </section>

            <Show when={!isNew() && existing()}>
              {(event) => (
                <div class="pt-4 mt-auto border-t border-border-weaker-base flex flex-col gap-3 text-12-regular text-text-weak">
                  <div class="flex justify-between">
                    <span>Created</span>
                    <span>{formatTimestamp(event().createdAt)}</span>
                  </div>
                  <Show when={event().updatedAt && event().updatedAt !== event().createdAt}>
                    <div class="flex justify-between">
                      <span>Updated</span>
                      <span>{formatTimestamp(event().updatedAt)}</span>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </form>

          {/* Sidebar — Details / Activity */}
          <aside class="w-72 shrink-0 border-l border-border-weaker-base bg-surface-raised-base/30 flex flex-col min-h-0">
            <div class="shrink-0 border-b border-border-weaker-base flex items-center gap-1 px-2">
              <SideTabButton tab="details" active={sideTab()} onSelect={setSideTab} icon="info" label="Details" />
              <SideTabButton tab="activity" active={sideTab()} onSelect={setSideTab} icon="history" label="Activity" />
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
              <Show when={sideTab() === "details"}>
                <div class="flex items-center gap-2">
                  <Icon name="tag" size="small" class="text-icon-weak" />
                  <div class="text-10-medium uppercase tracking-wide text-text-weaker">Attributes</div>
                </div>
                <div class="flex flex-col gap-2">
                  <MetaField label="Type" value={eventTypeLabel(eventType())} />
                  <MetaField label="Schedule" value={scheduleLabel() || "—"} />
                  <MetaField label="All day" value={allDay() ? "Yes" : "No"} />
                  <MetaField label="Repeats" value={recurrenceLabel()} />
                  <Show when={!isNew() && existing()}>
                    {(event) => (
                      <>
                        <MetaField label="Created" value={formatTimestamp(event().createdAt)} />
                        <Show when={event().updatedAt && event().updatedAt !== event().createdAt}>
                          <MetaField label="Updated" value={formatTimestamp(event().updatedAt)} />
                        </Show>
                      </>
                    )}
                  </Show>
                </div>
              </Show>
              <Show when={sideTab() === "activity"}>
                <Show
                  when={!isNew() && existing()}
                  fallback={
                    <div class="flex flex-col items-center gap-2 py-8 text-12-regular text-text-weaker">
                      <Icon name="history" size="small" />
                      <span>Activity appears once the event is saved.</span>
                    </div>
                  }
                >
                  {(event) => (
                    <div class="flex flex-col gap-2">
                      <ActivityRow icon="plus-small" label="Created" timestamp={event().createdAt} />
                      <Show when={event().updatedAt && event().updatedAt !== event().createdAt}>
                        <ActivityRow icon="edit" label="Updated" timestamp={event().updatedAt} />
                      </Show>
                    </div>
                  )}
                </Show>
              </Show>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div class="shrink-0 border-t border-border-weaker-base px-4 py-3 flex items-center gap-2">
          <Show when={!isNew()}>
            <button
              type="button"
              title="Click to copy event ID"
              onClick={() => void copyId(props.eventId)}
              class="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-11-mono text-text-weak hover:text-text-base hover:bg-surface-raised-base/60 transition-colors max-w-60"
            >
              <Icon name={copied() ? "check-small" : "copy"} size="small" class="shrink-0" />
              <span class="truncate">{shortId(props.eventId)}</span>
            </button>
            <IconButton
              icon="trash-2"
              variant="ghost"
              size="small"
              aria-label="Delete event"
              disabled={saving()}
              onClick={() => void deleteEvent()}
            />
          </Show>
          <div class="flex-1" />
          <Button type="button" variant="ghost" size="small" disabled={saving()} onClick={close}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="small" disabled={saving()} onClick={() => void saveEvent()}>
            {saving() ? "Saving…" : isNew() ? "Create event" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function SideTabButton(props: {
  tab: SideTab
  active: SideTab
  onSelect: (tab: SideTab) => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      class="flex items-center gap-1.5 px-2 py-2 text-11-medium border-b-2 transition-colors"
      classList={{
        "border-border-strong-base text-text-strong": props.active === props.tab,
        "border-transparent text-text-weak hover:text-text-base": props.active !== props.tab,
      }}
      onClick={() => props.onSelect(props.tab)}
    >
      <Icon name={props.icon} size="small" />
      {props.label}
    </button>
  )
}

function ActivityRow(props: { icon: string; label: string; timestamp: string | undefined }) {
  return (
    <div class="flex items-start gap-2 rounded-md border border-border-base/60 bg-background-base px-2.5 py-1.5">
      <Icon name={props.icon} size="small" class="mt-0.5 text-icon-weak" />
      <div class="flex-1 min-w-0">
        <div class="text-11-medium text-text-strong">{props.label}</div>
        <div class="text-10-regular text-text-weaker">{formatTimestamp(props.timestamp)}</div>
      </div>
    </div>
  )
}

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** Repeat every N units (default 1). Ignored for `weekdays`/`quarterly`. */
  interval?: number
  /** For weekly rules: days of week (0=Sun … 6=Sat). Empty/absent = same weekday as start. */
  weekdays?: number[]
  /** Inclusive end date (YYYY-MM-DD). */
  endDate?: string
  /** Stop after this many occurrences. */
  count?: number
}

const HARD_ITERATION_CAP = 5000

export function parseRecurrence(value: unknown): RecurrenceRule | null {
  if (!value) return null
  let raw: unknown = value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || trimmed === "null") return null
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const frequency = String(obj.frequency ?? "")
  if (!(RECURRENCE_FREQUENCIES as readonly string[]).includes(frequency)) return null
  const rule: RecurrenceRule = { frequency: frequency as RecurrenceFrequency }
  if (typeof obj.interval === "number" && obj.interval > 0) rule.interval = Math.floor(obj.interval)
  if (Array.isArray(obj.weekdays)) {
    const days = obj.weekdays
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    if (days.length) rule.weekdays = [...new Set(days)].sort((a, b) => a - b)
  }
  if (typeof obj.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.endDate)) rule.endDate = obj.endDate
  if (typeof obj.count === "number" && obj.count > 0) rule.count = Math.floor(obj.count)
  return rule
}

export function serializeRecurrence(rule: RecurrenceRule | null | undefined): string | null {
  if (!rule) return null
  const out: RecurrenceRule = { frequency: rule.frequency }
  if (rule.interval && rule.interval > 1) out.interval = rule.interval
  if (rule.weekdays?.length) out.weekdays = rule.weekdays
  if (rule.endDate) out.endDate = rule.endDate
  if (rule.count && rule.count > 0) out.count = rule.count
  return JSON.stringify(out)
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function formatRecurrence(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return "Does not repeat"
  const interval = Math.max(1, rule.interval ?? 1)
  let base: string
  switch (rule.frequency) {
    case "daily":
      base = interval === 1 ? "Daily" : `Every ${interval} days`
      break
    case "weekdays":
      base = "Every weekday"
      break
    case "weekly":
      if (rule.weekdays?.length) {
        base = `Weekly on ${rule.weekdays.map((d) => WEEKDAY_NAMES[d]).join(", ")}`
      } else {
        base = interval === 1 ? "Weekly" : `Every ${interval} weeks`
      }
      break
    case "monthly":
      base = interval === 1 ? "Monthly" : `Every ${interval} months`
      break
    case "quarterly":
      base = "Quarterly"
      break
    case "yearly":
      base = interval === 1 ? "Yearly" : `Every ${interval} years`
      break
    default:
      base = "Repeats"
  }
  if (rule.endDate) {
    const d = new Date(`${rule.endDate}T00:00:00`)
    if (!Number.isNaN(d.getTime())) {
      base += ` until ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    }
  } else if (rule.count) {
    base += ` · ${rule.count} times`
  }
  return base
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetMonth = d.getMonth() + months
  d.setMonth(targetMonth)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(date.getHours(), date.getMinutes(), 0, 0)
  return d
}

/**
 * Lazily yields occurrence start dates for a recurrence rule, beginning at
 * `baseStart`. Infinite generator — callers MUST break (e.g. when start passes
 * the visible window).
 */
function* iterateStarts(rule: RecurrenceRule, baseStart: Date): Generator<Date> {
  const interval = Math.max(1, rule.interval ?? 1)
  switch (rule.frequency) {
    case "weekdays": {
      let d = new Date(baseStart)
      while (true) {
        const day = d.getDay()
        if (day >= 1 && day <= 5) yield new Date(d)
        d = addDays(d, 1)
      }
    }
    case "weekly": {
      if (rule.weekdays?.length) {
        const weekdays = [...rule.weekdays].sort((a, b) => a - b)
        let weekStart = startOfWeek(baseStart)
        while (true) {
          for (const wd of weekdays) {
            const occ = addDays(weekStart, wd)
            occ.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0)
            if (occ.getTime() >= baseStart.getTime()) yield occ
          }
          weekStart = addDays(weekStart, 7 * interval)
        }
      }
      let i = 0
      while (true) {
        yield addDays(baseStart, 7 * interval * i)
        i++
      }
    }
    default: {
      let i = 0
      while (true) {
        switch (rule.frequency) {
          case "daily":
            yield addDays(baseStart, interval * i)
            break
          case "monthly":
            yield addMonths(baseStart, interval * i)
            break
          case "quarterly":
            yield addMonths(baseStart, 3 * i)
            break
          case "yearly":
            yield addMonths(baseStart, 12 * interval * i)
            break
          default:
            yield addDays(baseStart, interval * i)
        }
        i++
      }
    }
  }
}

export type OccurrenceSpan = { start: Date; end: Date }

/**
 * Expand an event (with optional recurrence) into the concrete occurrence
 * spans that intersect the inclusive window `[rangeStart, rangeEnd]`.
 */
export function expandOccurrences(
  base: OccurrenceSpan,
  rule: RecurrenceRule | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): OccurrenceSpan[] {
  const durationMs = Math.max(0, base.end.getTime() - base.start.getTime())

  if (!rule) {
    if (base.end.getTime() >= rangeStart.getTime() && base.start.getTime() <= rangeEnd.getTime()) {
      return [base]
    }
    return []
  }

  const out: OccurrenceSpan[] = []
  const until = rule.endDate ? new Date(`${rule.endDate}T23:59:59`) : null
  const maxCount = rule.count ?? Infinity
  let emitted = 0
  let iterations = 0

  for (const start of iterateStarts(rule, base.start)) {
    iterations++
    if (iterations > HARD_ITERATION_CAP) break
    if (emitted >= maxCount) break
    if (until && start.getTime() > until.getTime()) break
    if (start.getTime() > rangeEnd.getTime()) break
    emitted++
    const end = new Date(start.getTime() + durationMs)
    if (end.getTime() >= rangeStart.getTime()) {
      out.push({ start, end })
    }
  }

  return out
}

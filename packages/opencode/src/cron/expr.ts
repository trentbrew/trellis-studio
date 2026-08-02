/**
 * Minimal standard 5-field cron evaluator: `minute hour day-of-month month day-of-week`.
 * Supports wildcard, slash-step, `a,b` lists, and `a-b` ranges. Dependency-free.
 *
 * Evaluation is local-time, matching how the rest of the calendar/journal code
 * treats wall-clock dates.
 */
export namespace Cron {
  const RANGES: Array<{ min: number; max: number }> = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 6 }, // day of week (0 = Sunday)
  ]

  type Field = Set<number>

  function parseField(raw: string, idx: number): Field {
    const { min, max } = RANGES[idx]!
    const out = new Set<number>()
    for (const part of raw.split(",")) {
      const piece = part.trim()
      if (!piece) throw new Error(`empty cron field`)
      const [body, stepRaw] = piece.split("/")
      const step = stepRaw === undefined ? 1 : Number(stepRaw)
      if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${piece}"`)

      let lo = min
      let hi = max
      if (body !== "*" && body !== undefined) {
        const [a, b] = body.split("-")
        lo = Number(a)
        hi = b === undefined ? (stepRaw === undefined ? Number(a) : max) : Number(b)
        if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`bad number in "${piece}"`)
        if (lo < min || hi > max || lo > hi) throw new Error(`out of range in "${piece}"`)
      }
      for (let v = lo; v <= hi; v += step) out.add(v)
    }
    return out
  }

  export type Parsed = [Field, Field, Field, Field, Field]

  export function parse(expr: string): Parsed {
    const fields = expr.trim().split(/\s+/)
    if (fields.length !== 5) throw new Error(`cron must have 5 fields, got ${fields.length}: "${expr}"`)
    return fields.map((f, i) => parseField(f, i)) as Parsed
  }

  /** True if the given Date (minute resolution) satisfies the expression. */
  export function matches(expr: string | Parsed, date: Date): boolean {
    const p = typeof expr === "string" ? parse(expr) : expr
    // Standard cron quirk: when both DOM and DOW are restricted, either may match.
    const domRestricted = p[2].size !== 31
    const dowRestricted = p[4].size !== 7
    const dayOk = () => {
      const dom = p[2].has(date.getDate())
      const dow = p[4].has(date.getDay())
      if (domRestricted && dowRestricted) return dom || dow
      return dom && dow
    }
    return p[0].has(date.getMinutes()) && p[1].has(date.getHours()) && p[3].has(date.getMonth() + 1) && dayOk()
  }

  /**
   * Did a fire boundary fall in the half-open interval `(from, to]`?
   * Walks minute-by-minute; the window is tiny (one scheduler tick) so this is cheap.
   */
  export function due(expr: string | Parsed, from: Date, to: Date): boolean {
    const p = typeof expr === "string" ? parse(expr) : expr
    const cursor = new Date(from.getTime())
    cursor.setSeconds(0, 0)
    cursor.setMinutes(cursor.getMinutes() + 1)
    while (cursor.getTime() <= to.getTime()) {
      if (matches(p, cursor)) return true
      cursor.setMinutes(cursor.getMinutes() + 1)
    }
    return false
  }

  /** Next fire time strictly after `after`, or undefined if none within ~4 years. */
  export function next(expr: string | Parsed, after: Date): Date | undefined {
    const p = typeof expr === "string" ? parse(expr) : expr
    const cursor = new Date(after.getTime())
    cursor.setSeconds(0, 0)
    cursor.setMinutes(cursor.getMinutes() + 1)
    const limit = after.getTime() + 4 * 366 * 24 * 60 * 60 * 1000
    while (cursor.getTime() <= limit) {
      if (matches(p, cursor)) return new Date(cursor.getTime())
      cursor.setMinutes(cursor.getMinutes() + 1)
    }
    return undefined
  }

  export function valid(expr: string): boolean {
    try {
      parse(expr)
      return true
    } catch {
      return false
    }
  }
}

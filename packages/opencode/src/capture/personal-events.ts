import { Config } from "../config/config"
import { Memory } from "../trellis/memory"
import { Log } from "../util/log"

const log = Log.create({ service: "capture.personal-events" })

const MONTHS = [
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
] as const

/**
 * Calendar titles that encode a recurring personal fact worth persisting to
 * user-scoped memory (birthday, anniversary, …). Kept deliberately small to
 * avoid junk memories — this is a high-confidence allowlist, not inference.
 */
const PERSONAL_EVENT_PATTERN = /\b(birthday|b-?day|anniversary)\b/i

type PersonalFact = {
  title: string
  content: string
  key: string
}

function monthDay(startAt: string): { month: number; day: number } | undefined {
  const iso = startAt.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const month = Number(iso[2]) - 1
    const day = Number(iso[3])
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) return { month, day }
    return undefined
  }
  const date = new Date(startAt)
  if (Number.isNaN(date.getTime())) return undefined
  return { month: date.getMonth(), day: date.getDate() }
}

/**
 * Inspect a successful `calendar create` and, when it encodes a recurring
 * personal fact, derive the year-stripped annual fact to persist. Returns
 * undefined when the event is not a personal-fact event.
 */
export function detect(input: {
  title: string
  startAt: string
  allDay?: boolean
}): PersonalFact | undefined {
  const title = input.title.trim()
  if (!title || !PERSONAL_EVENT_PATTERN.test(title)) return undefined

  // Recurring personal facts are all-day. A timed event named "birthday party"
  // is a one-off, not the durable fact, so require all-day or a date-only start.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input.startAt.trim())
  if (!input.allDay && !dateOnly) return undefined

  const parts = monthDay(input.startAt.trim())
  if (!parts) return undefined

  const when = `${MONTHS[parts.month]} ${parts.day}`
  return {
    title,
    content: `${title} is ${when} (annual).`,
    // Namespace calendar-derived facts so they never overwrite a free-form
    // agent memory that happens to share a title.
    key: `event:${title}`,
  }
}

/**
 * Deterministic capture: when a `calendar create` encodes a personal fact,
 * persist it to user-scoped memory in code — no model judgment required.
 * Gated by `capture.personalEvents` (default on).
 */
export async function fromToolResult(input: {
  tool: string
  action?: string
  sessionID: string
  args?: Record<string, unknown>
  result?: { output?: string }
  dir: string
}) {
  if (input.tool !== "calendar") return undefined
  const action = input.action ?? (typeof input.args?.action === "string" ? input.args.action : undefined)
  if (action !== "create") return undefined

  const cfg = await Config.get()
  if (cfg.capture?.personalEvents === false) return undefined

  const title = typeof input.args?.title === "string" ? input.args.title : ""
  const startAt = typeof input.args?.startAt === "string" ? input.args.startAt : ""
  const allDay = input.args?.allDay === true
  if (!title || !startAt) return undefined

  const fact = detect({ title, startAt, allDay })
  if (!fact) return undefined

  try {
    return Memory.remember(
      {
        title: fact.title,
        content: fact.content,
        scope: "user",
        tags: ["personal", "calendar"],
        source: "calendar",
        sessionID: input.sessionID,
        key: fact.key,
      },
      input.dir,
    )
  } catch (err) {
    log.warn("personal event capture failed", { title: fact.title, error: String(err) })
    return undefined
  }
}

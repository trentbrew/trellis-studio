import z from "zod"
import { Tool } from "./tool"
import { SchemaKit } from "./schema-kit"
import { CalendarEvent, CALENDAR_EVENT_COLORS, CALENDAR_EVENT_TYPES } from "../trellis/calendar-event"
import { Trellis } from "../trellis"

const colorSchema = SchemaKit.looseEnum(CALENDAR_EVENT_COLORS)
const typeSchema = SchemaKit.looseEnum(CALENDAR_EVENT_TYPES)
const boolishOptional = SchemaKit.boolishOptional
const recurrenceDescription =
  'Recurrence as JSON, e.g. {"frequency":"weekly","interval":1,"weekdays":[1,3,5],"endDate":"2026-12-31"}. ' +
  "frequency: daily|weekdays|weekly|monthly|quarterly|yearly. Omit or pass null for a one-off event."

const params = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    year: z.coerce.number().int().min(1970).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional().describe("1-based month when filtering by year"),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    includeTrellis: boolishOptional.describe(
      "Include Trellis VCS items (issues, work units, milestones, cycles) bucketed by createdAt. Default true.",
    ),
  }),
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(200),
    startAt: SchemaKit.dateish.describe("ISO datetime or YYYY-MM-DD for all-day events"),
    endAt: SchemaKit.optionalNullSafe(z.string().trim()),
    allDay: boolishOptional.describe('true for all-day events (boolean, not the string "true")'),
    description: SchemaKit.optionalNullSafe(z.string().max(4000)),
    color: SchemaKit.optionalNullSafe(colorSchema),
    eventType: SchemaKit.optionalNullSafe(typeSchema).describe("Event category; drives color in the UI"),
    recurrence: SchemaKit.optionalNullSafe(z.string()).describe(recurrenceDescription),
    id: SchemaKit.optionalNullSafe(z.string()),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    startAt: z.string().trim().optional(),
    endAt: z.string().trim().nullable().optional(),
    allDay: boolishOptional,
    description: z.string().max(4000).nullable().optional(),
    color: colorSchema.nullable().optional(),
    eventType: typeSchema.nullable().optional(),
    recurrence: z.string().nullable().optional().describe(recurrenceDescription),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().trim().min(1),
  }),
])

export const CalendarTool = Tool.define<typeof params, Record<string, any>>("calendar", {
  description: [
    "CRUD calendar events stored in the Trellis graph (entity type: calendar_event).",
    "Events appear in Studio Plan → Calendar and the Calendar projection alongside Trellis VCS items (issues, work units, milestones, cycles), which are placed on their createdAt date.",
    "",
    "**list** — List calendar events AND Trellis VCS items (bucketed by createdAt). Optionally filtered to a calendar month (year + month 1–12). Pass includeTrellis: false to exclude VCS items.",
    "",
    "**create** — Add an event. Use ISO datetimes (2026-05-27T15:00:00.000Z) or YYYY-MM-DD with allDay: true.",
    "",
    "**update** — Patch title, schedule, description, type, recurrence, or color by event id.",
    "",
    "**delete** — Remove an event by id.",
    "",
    "Types (drive chip color): event, meeting, appointment, deadline, milestone, task, reminder, travel, payment, deposit, budget, birthday.",
    "Recurrence: pass a JSON rule (see recurrence field) to make an event repeat.",
    "",
    "When an all-day event encodes a durable personal fact the user stated (birthday, anniversary,",
    "recurring date), also call memory remember with scope: user. Common cases auto-capture, but",
    "persist anything the heuristic might miss.",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "write",
      patterns: ["trellis-store"],
      always: ["trellis-store"],
      metadata: { action: input.action },
    })

    if (input.action === "list") {
      const events =
        input.year !== undefined && input.month !== undefined
          ? CalendarEvent.listInMonth(input.year, input.month - 1)
          : CalendarEvent.list({ limit: input.limit ?? 100 })

      const includeTrellis = input.includeTrellis !== false
      const inRange = (iso: string | undefined) => {
        if (!iso) return false
        if (input.year === undefined) return true
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return false
        if (d.getFullYear() !== input.year) return false
        if (input.month !== undefined && d.getMonth() !== input.month - 1) return false
        return true
      }

      const trellisLines: string[] = []
      let trellisCount = 0
      if (includeTrellis) {
        for (const issue of Trellis.issues()) {
          if (!inRange(issue.createdAt)) continue
          trellisLines.push(
            `ISSUE  ${issue.id}  ${issue.createdAt.slice(0, 10)}  [${issue.status}/${issue.priority}]  ${issue.title}`,
          )
          trellisCount++
        }
        for (const wu of Trellis.workUnits()) {
          if (!inRange(wu.createdAt)) continue
          trellisLines.push(
            `WORKUNIT  ${wu.id}  ${wu.createdAt.slice(0, 10)}  [${wu.status}/${wu.priority}]  ${wu.title}`,
          )
          trellisCount++
        }
        for (const cycle of Trellis.cycles()) {
          if (!inRange(cycle.createdAt)) continue
          trellisLines.push(
            `CYCLE  ${cycle.id}  ${cycle.createdAt.slice(0, 10)}  [${cycle.horizon}/${cycle.status}]  ${cycle.title}`,
          )
          trellisCount++
        }
        for (const ms of Trellis.milestones()) {
          if (!inRange(ms.createdAt)) continue
          trellisLines.push(`MILESTONE  ${ms.id}  ${(ms.createdAt ?? "").slice(0, 10)}  ${ms.message ?? ms.id}`)
          trellisCount++
        }
      }

      const eventLines = events.map((item) => {
        const when = item.allDay ? item.startAt.slice(0, 10) : item.startAt
        const repeat = item.recurrence ? "  ↻" : ""
        return `EVENT  ${item.id}  ${when}  [${item.eventType}]${repeat}  ${item.title}${item.description ? `\n  ${item.description}` : ""}`
      })

      if (eventLines.length === 0 && trellisLines.length === 0) {
        return { title: "Calendar", output: "No calendar items.", metadata: { count: 0 } }
      }

      const sections: string[] = []
      if (eventLines.length) sections.push(`Events (${events.length}):\n${eventLines.join("\n")}`)
      if (trellisLines.length) sections.push(`Trellis (${trellisCount}):\n${trellisLines.join("\n")}`)

      return {
        title: `${events.length + trellisCount} items`,
        output: sections.join("\n\n"),
        metadata: { events: events.length, trellis: trellisCount },
      }
    }

    if (input.action === "create") {
      const saved = CalendarEvent.create({
        id: input.id,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        description: input.description,
        color: input.color,
        eventType: input.eventType,
        recurrence: input.recurrence,
      })
      if (!saved) return { title: "Error", output: "Trellis store not available.", metadata: {} }
      return {
        title: `Created ${saved.title}`,
        output: `Created calendar event ${saved.id}\n  ${saved.startAt} — ${saved.title}`,
        metadata: { id: saved.id },
      }
    }

    if (input.action === "update") {
      const saved = CalendarEvent.update(input.id, {
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        description: input.description,
        color: input.color,
        eventType: input.eventType,
        recurrence: input.recurrence,
      })
      if (!saved) return { title: "Not found", output: `Event "${input.id}" not found.`, metadata: {} }
      return {
        title: `Updated ${saved.title}`,
        output: `Updated ${saved.id}\n  ${saved.startAt} — ${saved.title}`,
        metadata: { id: saved.id },
      }
    }

    const removed = CalendarEvent.remove(input.id)
    if (!removed) return { title: "Not found", output: `Event "${input.id}" not found.`, metadata: {} }
    return {
      title: "Deleted event",
      output: `Deleted ${input.id} (${removed.retracted} facts retracted)`,
      metadata: { id: input.id },
    }
  },
})

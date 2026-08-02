import { createHash, randomUUID } from "crypto"
import { Instance } from "../project/instance"
import { StoreSDK } from "./store-sdk"
import { Trellis } from "./index"

export const CALENDAR_EVENT_COLORS = ["default", "critical", "high", "medium", "low"] as const
export type CalendarEventColor = (typeof CALENDAR_EVENT_COLORS)[number]

export const CALENDAR_EVENT_TYPES = [
  "event",
  "meeting",
  "appointment",
  "deadline",
  "milestone",
  "task",
  "reminder",
  "travel",
  "payment",
  "deposit",
  "budget",
  "birthday",
] as const
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]

export namespace CalendarEvent {
  export type Item = {
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

  function projectId(root: string) {
    return `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
  }

  function normalizeColor(value: unknown): CalendarEventColor {
    const raw = String(value ?? "default").toLowerCase()
    if ((CALENDAR_EVENT_COLORS as readonly string[]).includes(raw)) return raw as CalendarEventColor
    return "default"
  }

  function normalizeType(value: unknown): CalendarEventType {
    const raw = String(value ?? "event").toLowerCase()
    if ((CALENDAR_EVENT_TYPES as readonly string[]).includes(raw)) return raw as CalendarEventType
    return "event"
  }

  function normalizeAllDay(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null) return fallback
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0
    if (typeof value === "string") {
      const s = value.trim().toLowerCase()
      if (s === "true" || s === "1" || s === "yes") return true
      if (s === "false" || s === "0" || s === "no") return false
    }
    return fallback
  }

  function normalizeRecurrence(value: unknown): string {
    if (!value) return ""
    const raw = String(value).trim()
    if (!raw || raw === "null") return ""
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && typeof parsed.frequency === "string") return raw
    } catch {
      return ""
    }
    return ""
  }

  function parseInstant(value: string, allDay: boolean): Date | undefined {
    if (!value) return undefined
    if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number)
      const date = new Date(y, m - 1, d)
      return Number.isNaN(date.getTime()) ? undefined : date
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  export function eventLocalDayParts(item: Pick<Item, "startAt" | "allDay">) {
    const date = parseInstant(item.startAt, item.allDay)
    if (!date) return undefined
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() }
  }

  export function occursOnLocalDay(item: Pick<Item, "startAt" | "allDay">, year: number, month: number, day: number) {
    const parts = eventLocalDayParts(item)
    if (!parts) return false
    return parts.year === year && parts.month === month && parts.day === day
  }

  function itemFromEntity(entityId: string, root: string): Item | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const fact = (attr: string) => detail.facts.find((item: { a: string; v: unknown }) => item.a === attr)?.v
    const allDay = fact("allDay") === true || fact("allDay") === "true"
    const startAt = String(fact("startAt") ?? "")
    const endAt = String(fact("endAt") ?? startAt)
    return {
      id: entityId,
      title: String(fact("title") ?? "Untitled event"),
      description: String(fact("description") ?? ""),
      startAt,
      endAt,
      allDay,
      color: normalizeColor(fact("color")),
      eventType: normalizeType(fact("eventType")),
      recurrence: normalizeRecurrence(fact("recurrence")),
      createdAt: String(fact("createdAt") ?? ""),
      updatedAt: String(fact("updatedAt") ?? fact("createdAt") ?? ""),
    }
  }

  export function create(
    input: {
      title: string
      startAt: string
      endAt?: string
      allDay?: boolean
      description?: string
      color?: CalendarEventColor
      eventType?: CalendarEventType
      recurrence?: string | null
      id?: string
    },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const now = new Date().toISOString()
    const allDay = normalizeAllDay(input.allDay, false)
    const startAt = input.startAt.trim()
    const endAt = (input.endAt ?? startAt).trim()
    const id = input.id ?? `calendar_event:${randomUUID()}`
    const title = input.title.trim() || "Untitled event"

    StoreSDK.defineEntity(
      "calendar_event",
      id,
      {
        title,
        description: input.description?.trim() ?? "",
        startAt,
        endAt,
        allDay,
        color: input.color ?? "default",
        eventType: normalizeType(input.eventType),
        recurrence: normalizeRecurrence(input.recurrence),
        createdAt: now,
        updatedAt: now,
      },
      root,
    )
    StoreSDK.relate(projectId(root), "knows", id, root)

    return itemFromEntity(id, root)
  }

  export function save(
    input: {
      id: string
      title?: string
      startAt?: string
      endAt?: string
      allDay?: boolean
      description?: string
      color?: CalendarEventColor
      eventType?: CalendarEventType
      recurrence?: string | null
    },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    const existing = itemFromEntity(input.id, root)
    if (!existing) {
      if (!input.title || !input.startAt) return undefined
      return create(
        {
          id: input.id,
          title: input.title,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay,
          description: input.description,
          color: input.color,
          eventType: input.eventType,
          recurrence: input.recurrence,
        },
        root,
      )
    }
    return update(input.id, input, root)
  }

  export function update(
    id: string,
    patch: {
      title?: string
      startAt?: string
      endAt?: string | null
      allDay?: boolean
      description?: string | null
      color?: CalendarEventColor | null
      eventType?: CalendarEventType | null
      recurrence?: string | null
    },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    const existing = itemFromEntity(id, root)
    if (!existing) return undefined

    const allDay = patch.allDay === undefined ? existing.allDay : normalizeAllDay(patch.allDay, existing.allDay)
    const startAt = patch.startAt ?? existing.startAt
    const endAt = patch.endAt === undefined ? existing.endAt : (patch.endAt ?? startAt)
    const attrs: Record<string, string | number | boolean | null> = {
      title: patch.title?.trim() || existing.title,
      description: patch.description === undefined ? existing.description : (patch.description ?? ""),
      startAt,
      endAt,
      allDay,
      color: patch.color === undefined ? existing.color : (patch.color ?? "default"),
      eventType: patch.eventType === undefined ? existing.eventType : normalizeType(patch.eventType),
      recurrence: patch.recurrence === undefined ? existing.recurrence : normalizeRecurrence(patch.recurrence),
      updatedAt: new Date().toISOString(),
    }

    StoreSDK.updateEntity(id, attrs, root)
    return itemFromEntity(id, root)
  }

  export function remove(id: string, dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    return StoreSDK.deleteEntity(id, root)
  }

  export function list(opts?: { limit?: number }, dir?: string): Item[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []

    return Trellis.storeEntities(root, { type: "calendar_event", limit: opts?.limit ?? 500 })
      .map((entity) => itemFromEntity(entity.id, root))
      .filter((item): item is Item => !!item)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  export function listInMonth(year: number, month: number, dir?: string): Item[] {
    return list({ limit: 500 }, dir).filter((item) => {
      const parts = eventLocalDayParts(item)
      if (!parts) return false
      return parts.year === year && parts.month === month
    })
  }
}

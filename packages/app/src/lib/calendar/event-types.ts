import type { Component } from "solid-js"
import {
  Banknote,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Cake,
  CircleDollarSign,
  Clock,
  Flag,
  ListChecks,
  PiggyBank,
  Plane,
  Users,
  Wallet,
} from "lucide-solid"

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
  "cron",
] as const

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]

export type CalendarEventTypeMeta = {
  label: string
  /** Solid color used for chips, dots, and filter swatches. */
  color: string
  icon: Component<{ class?: string; size?: number | string }>
}

export const CALENDAR_EVENT_TYPE_META: Record<CalendarEventType, CalendarEventTypeMeta> = {
  event: { label: "Event", color: "#3b82f6", icon: CalendarDays },
  meeting: { label: "Meeting", color: "#06b6d4", icon: Users },
  appointment: { label: "Appointment", color: "#22c55e", icon: CalendarClock },
  deadline: { label: "Deadline", color: "#ef4444", icon: Flag },
  milestone: { label: "Milestone", color: "#a855f7", icon: Flag },
  task: { label: "Task", color: "#0ea5e9", icon: ListChecks },
  reminder: { label: "Reminder", color: "#f59e0b", icon: CalendarClock },
  travel: { label: "Travel", color: "#f97316", icon: Plane },
  payment: { label: "Payment", color: "#f43f5e", icon: CircleDollarSign },
  deposit: { label: "Deposit", color: "#10b981", icon: PiggyBank },
  budget: { label: "Budget", color: "#eab308", icon: Wallet },
  birthday: { label: "Birthday", color: "#ec4899", icon: Cake },
  cron: { label: "Cron Job", color: "#6366f1", icon: Clock },
}

export const DEFAULT_CALENDAR_EVENT_TYPE: CalendarEventType = "event"

/** Icon for the generic "work" group fallbacks (issues/work units). */
export const WORK_ICON = Briefcase
export const MONEY_ICON = Banknote

export function normalizeEventType(value: unknown): CalendarEventType {
  const raw = String(value ?? "").toLowerCase()
  if ((CALENDAR_EVENT_TYPES as readonly string[]).includes(raw)) return raw as CalendarEventType
  return DEFAULT_CALENDAR_EVENT_TYPE
}

export function eventTypeColor(type: CalendarEventType): string {
  return CALENDAR_EVENT_TYPE_META[type]?.color ?? CALENDAR_EVENT_TYPE_META.event.color
}

export function eventTypeLabel(type: CalendarEventType): string {
  return CALENDAR_EVENT_TYPE_META[type]?.label ?? "Event"
}

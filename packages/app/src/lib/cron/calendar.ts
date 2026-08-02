import type { CalendarEventRecord } from "@/lib/calendar/event-model"
import type { CronJob } from "./api"

export function cronJobsToCalendarEvents(jobs: CronJob[]): CalendarEventRecord[] {
  return jobs
    .filter((job) => job.enabled && job.nextRunAt)
    .map((job) => ({
      id: `cron:${job.id}`,
      title: job.name,
      description: `${job.action} job • ${job.schedule}`,
      startAt: job.nextRunAt,
      endAt: job.nextRunAt,
      allDay: false,
      color: "default",
      eventType: "cron" as const,
      recurrence: "",
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }))
}

export function aggregateCronJobsByDay(events: CalendarEventRecord[]): Map<string, CalendarEventRecord[]> {
  const byDay = new Map<string, CalendarEventRecord[]>()
  for (const event of events) {
    const day = event.startAt.split("T")[0]
    if (!day) continue
    const existing = byDay.get(day) ?? []
    existing.push(event)
    byDay.set(day, existing)
  }
  return byDay
}

export function createAggregatedCronEvent(day: string, jobs: CalendarEventRecord[]): CalendarEventRecord {
  const count = jobs.length
  const names = jobs.map((j) => j.title).join(", ")
  return {
    id: `cron:agg:${day}`,
    title: `${count} Cron Job${count > 1 ? "s" : ""}`,
    description: names.length > 100 ? `${names.slice(0, 100)}...` : names,
    startAt: `${day}T00:00:00Z`,
    endAt: `${day}T23:59:59Z`,
    allDay: true,
    color: "default",
    eventType: "cron" as const,
    recurrence: "",
    createdAt: jobs[0]?.createdAt ?? new Date().toISOString(),
    updatedAt: jobs[0]?.updatedAt ?? new Date().toISOString(),
  }
}

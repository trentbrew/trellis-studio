import { trellisUrl } from "@/context/trellis"
import type { Fetcher } from "@/utils/server"
import type { CalendarEventColor, CalendarEventRecord } from "./event-model"

async function readError(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; reason?: string }
    return body.reason ?? body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export async function apiListCalendarEvents(
  run: Fetcher,
  url: string,
  dir: string,
  query?: { year?: number; month?: number },
): Promise<CalendarEventRecord[]> {
  const req = new URL(trellisUrl(url, dir, "/calendar/events"))
  if (query?.year !== undefined) req.searchParams.set("year", String(query.year))
  if (query?.month !== undefined) req.searchParams.set("month", String(query.month))
  const res = await run(req.toString())
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CalendarEventRecord[]
}

export async function apiSaveCalendarEvent(
  run: Fetcher,
  url: string,
  dir: string,
  input: {
    id: string
    title?: string
    startAt?: string
    endAt?: string | null
    allDay?: boolean
    description?: string | null
    color?: CalendarEventColor | null
    eventType?: string | null
    recurrence?: string | null
  },
): Promise<CalendarEventRecord> {
  const res = await run(trellisUrl(url, dir, "/calendar/save"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CalendarEventRecord
}

export async function apiDeleteCalendarEvent(run: Fetcher, url: string, dir: string, id: string) {
  const res = await run(trellisUrl(url, dir, "/calendar/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(await readError(res))
}

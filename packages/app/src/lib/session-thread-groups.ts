import type { Session } from "@opencode-ai/sdk/v2/client"

export type SessionThreadGroupId = "today" | "yesterday" | "previous7" | "previous30" | "older"

export type SessionThreadGroup = {
  id: SessionThreadGroupId
  labelKey: string
  sessions: Session[]
}

const dayMs = 24 * 60 * 60 * 1000

export function sessionUpdatedAt(session: Session) {
  return session.time?.updated ?? session.time?.created ?? 0
}

export function startOfLocalDay(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function groupSessionsByDate(sessions: Session[], now = Date.now()): SessionThreadGroup[] {
  const todayStart = startOfLocalDay(now)
  const yesterdayStart = todayStart - dayMs
  const weekStart = todayStart - 7 * dayMs
  const monthStart = todayStart - 30 * dayMs

  const buckets: Record<SessionThreadGroupId, Session[]> = {
    today: [],
    yesterday: [],
    previous7: [],
    previous30: [],
    older: [],
  }

  const sorted = [...sessions].sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a))

  for (const session of sorted) {
    const at = sessionUpdatedAt(session)
    if (at >= todayStart) buckets.today.push(session)
    else if (at >= yesterdayStart) buckets.yesterday.push(session)
    else if (at >= weekStart) buckets.previous7.push(session)
    else if (at >= monthStart) buckets.previous30.push(session)
    else buckets.older.push(session)
  }

  const order: SessionThreadGroupId[] = ["today", "yesterday", "previous7", "previous30", "older"]
  const labels: Record<SessionThreadGroupId, string> = {
    today: "session.threadGroup.today",
    yesterday: "session.threadGroup.yesterday",
    previous7: "session.threadGroup.previous7",
    previous30: "session.threadGroup.previous30",
    older: "session.threadGroup.older",
  }

  return order.flatMap((id) => {
    const list = buckets[id]
    if (list.length === 0) return []
    return [{ id, labelKey: labels[id], sessions: list }]
  })
}

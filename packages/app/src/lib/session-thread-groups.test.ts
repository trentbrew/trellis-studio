import { describe, expect, test } from "bun:test"
import { groupSessionsByDate, startOfLocalDay } from "./session-thread-groups"
import type { Session } from "@opencode-ai/sdk/v2/client"

const session = (id: string, updated: number): Session =>
  ({
    id,
    directory: "/proj",
    title: id,
    time: { created: updated, updated },
  }) as Session

describe("groupSessionsByDate", () => {
  test("groups sessions into today and yesterday", () => {
    const now = new Date(2026, 4, 29, 12, 0, 0).getTime()
    const todayStart = startOfLocalDay(now)
    const today = todayStart + 60_000
    const yesterday = todayStart - 60_000

    const groups = groupSessionsByDate([session("a", today), session("b", yesterday)], now)

    expect(groups.map((g) => g.id)).toEqual(["today", "yesterday"])
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["a"])
    expect(groups[1]?.sessions.map((s) => s.id)).toEqual(["b"])
  })

  test("omits empty groups", () => {
    const now = new Date(2026, 4, 29, 12, 0, 0).getTime()
    const groups = groupSessionsByDate([session("only", startOfLocalDay(now) + 1)], now)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.id).toBe("today")
  })
})

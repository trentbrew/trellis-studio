import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "crypto"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { CalendarEvent } from "../../src/trellis/calendar-event"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("calendar_event", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }
  const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
  const watch = proto.watch

  beforeAll(async () => {
    proto.watch = () => undefined
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir) })
  })

  afterAll(async () => {
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("create and list in month", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = CalendarEvent.create(
          {
            title: "Ship review",
            startAt: "2026-05-15T14:00:00.000Z",
            color: "high",
          },
          dir,
        )
        expect(saved?.id).toStartWith("calendar_event:")
        expect(saved?.title).toBe("Ship review")

        const may = CalendarEvent.listInMonth(2026, 4, dir)
        expect(may.some((item) => item.id === saved?.id)).toBe(true)

        const june = CalendarEvent.listInMonth(2026, 5, dir)
        expect(june.some((item) => item.id === saved?.id)).toBe(false)
      },
    })
  })

  test("all-day event uses date-only startAt", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = CalendarEvent.create(
          {
            title: "Offsite",
            startAt: "2026-05-27",
            allDay: true,
          },
          dir,
        )
        expect(saved?.allDay).toBe(true)
        expect(CalendarEvent.occursOnLocalDay(saved!, 2026, 4, 27)).toBe(true)
      },
    })
  })

  test("update and remove", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = CalendarEvent.create(
          { title: "Standup", startAt: "2026-05-20T09:00:00.000Z" },
          dir,
        )
        expect(saved).toBeTruthy()
        if (!saved) return

        const updated = CalendarEvent.update(saved.id, { title: "Daily standup" }, dir)
        expect(updated?.title).toBe("Daily standup")

        const removed = CalendarEvent.remove(saved.id, dir)
        expect(removed?.retracted).toBeGreaterThan(0)
        expect(CalendarEvent.list({}, dir).some((item) => item.id === saved.id)).toBe(false)
      },
    })
  })

  test("links event to project via knows", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = CalendarEvent.create(
          { title: "Demo", startAt: "2026-05-10T16:00:00.000Z" },
          dir,
        )
        expect(saved).toBeTruthy()
        if (!saved) return

        const project = `project:${createHash("sha256").update(dir).digest("hex").slice(0, 12)}`
        const detail = Trellis.storeEntity(saved.id, dir)
        expect(
          detail?.links.some(
            (link: { e1: string; a: string; e2: string }) =>
              link.e1 === project && link.a === "knows" && link.e2 === saved.id,
          ),
        ).toBe(true)
      },
    })
  })
})

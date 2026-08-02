import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import { CalendarTool } from "../../src/tool/calendar"
import type { Tool } from "../../src/tool/tool"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
const watch = proto.watch

function ctx(): Tool.Context<Record<string, unknown>> {
  return {
    sessionID: "ses_test" as Tool.Context["sessionID"],
    messageID: "msg_test" as Tool.Context["messageID"],
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    ask: async () => {},
  }
}

describe("calendar tool", () => {
  beforeAll(() => {
    proto.watch = () => undefined
  })

  afterAll(() => {
    proto.watch = watch
  })

  test("create accepts allDay as string true", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await CalendarTool.init()
        const created = await tool.execute(
          {
            action: "create",
            title: "All day hackathon",
            startAt: "2026-06-20",
            allDay: "true" as unknown as boolean,
          },
          ctx(),
        )
        expect(created.output).toContain("calendar_event:")
        const listed = await tool.execute({ action: "list", year: 2026, month: 6 }, ctx())
        expect(listed.output).toContain("All day hackathon")
      },
    })
    Trellis.dispose(tmp.path)
  })

  test("create list update delete", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await CalendarTool.init()
        const created = await tool.execute(
          {
            action: "create",
            title: "Launch",
            startAt: "2026-06-01",
            allDay: true,
            color: "critical",
          },
          ctx(),
        )
        expect(created.output).toContain("calendar_event:")

        const listed = await tool.execute({ action: "list", year: 2026, month: 6 }, ctx())
        expect(listed.output).toContain("Launch")

        const idMatch = created.output.match(/calendar_event:[^\s]+/)?.[0]
        expect(idMatch).toBeTruthy()
        if (!idMatch) return

        await tool.execute({ action: "update", id: idMatch, title: "Launch day" }, ctx())
        const deleted = await tool.execute({ action: "delete", id: idMatch }, ctx())
        expect(deleted.output).toContain("Deleted")
      },
    })
    Trellis.dispose(tmp.path)
  })
})

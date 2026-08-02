import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { MemoryTool } from "../../src/tool/memory"
import type { Tool } from "../../src/tool/tool"
import { Memory } from "../../src/trellis/memory"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
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

describe("memory tool", () => {
  beforeAll(() => {
    proto.watch = () => undefined
  })

  afterAll(() => {
    proto.watch = watch
  })

  test("recall action returns semantically matching memories", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        Memory.remember({ title: "UI framework", content: "Prefer SolidJS for interactive UI." }, tmp.path)
        await Memory.backfill(tmp.path)

        const tool = await MemoryTool.init()
        const result = await tool.execute({ action: "recall", query: "what frontend framework?" }, ctx())
        expect(result.title).toContain("recalled")
        expect(result.output).toContain("SolidJS")
      },
    })
    Trellis.dispose(tmp.path)
  }, 30000)
})

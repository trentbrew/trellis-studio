import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Memory } from "../../src/trellis/memory"
import { Trellis } from "../../src/trellis"
import * as Capture from "../../src/capture/prompt"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("memory", () => {
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

  test("remember and list", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = Memory.remember({ title: "Preferred stack", content: "Use Bun and SolidJS for UI work." }, dir)
        expect(saved?.id).toStartWith("memory:")
        const items = Memory.list({ limit: 10 }, dir)
        expect(items.some((item) => item.content.includes("Bun"))).toBe(true)
      },
    })
  })

  test("capture explicit remember phrase", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        await Capture.fromMessage({
          dir,
          sessionID: "test",
          text: "Remember: always use link assets instead of CMS collections for bookmarks.",
        })
        const items = Memory.list({ scope: "user" }, dir)
        expect(items.some((item) => item.content.includes("link assets"))).toBe(true)
      },
    })
  })

  test("prompt block includes stored facts", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const block = await Memory.promptBlock({ limit: 5 }, dir)
        expect(block).toContain("<project-memory>")
        expect(block).toContain("Preferred stack")
      },
    })
  })

  test("recall returns semantically matching memories", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        Memory.remember({ title: "Database choice", content: "Use the built-in Trellis EAV store, not Postgres." }, dir)
        await Memory.backfill(dir)

        const results = await Memory.recall("which database should we use?", { limit: 5 }, dir)
        expect(results.length).toBeGreaterThan(0)
        expect(results.some((item) => item.content.includes("Trellis EAV"))).toBe(true)
      },
    })
  }, 30000)

  test("prompt block includes query-relevant memories", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        Memory.remember({ title: "Preview port", content: "Dev server runs on port 5173." }, dir)
        await Memory.backfill(dir)

        const block = await Memory.promptBlock({ query: "what port does the dev server use?" }, dir)
        expect(block).toContain("5173")
      },
    })
  }, 30000)
})

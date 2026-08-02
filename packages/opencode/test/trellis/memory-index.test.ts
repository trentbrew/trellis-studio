import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Memory } from "../../src/trellis/memory"
import { MemoryIndex } from "../../src/trellis/memory-index"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("memory-index", () => {
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
    MemoryIndex.close(dir)
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("upsert + search returns the seeded memory", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const ok = await MemoryIndex.upsert(
          "memory:test-stack",
          "Preferred stack",
          "Use Bun and SolidJS for UI work.",
          dir,
        )
        expect(ok).toBe(true)

        const results = await MemoryIndex.search("which JavaScript runtime should I use?", { limit: 5 }, dir)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].chunk.entityId).toBe("memory:test-stack")
        expect(results[0].score).toBeGreaterThan(0.2)
      },
    })
  }, 30000)

  test("upsert is idempotent on the same entityId", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const before = (await MemoryIndex.stats(dir)).count
        await MemoryIndex.upsert("memory:test-stack", "Preferred stack", "Updated content.", dir)
        const after = (await MemoryIndex.stats(dir)).count
        expect(after).toBe(before)
      },
    })
  }, 30000)

  test("backfill embeds existing memory:* entities without re-embedding seen ones", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        Memory.remember({ title: "Backfill target", content: "Trellis is graph-native version control." }, dir)
        await new Promise((r) => setTimeout(r, 50))

        const first = await Memory.backfill(dir)
        expect(first.scanned).toBeGreaterThan(0)

        const second = await Memory.backfill(dir)
        expect(second.embedded).toBe(0)
      },
    })
  }, 30000)

  test("Memory.remember fires-and-forgets upsert without blocking", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const t0 = Date.now()
        const saved = Memory.remember(
          { title: "Fast write", content: "Background embedding should not block remember()." },
          dir,
        )
        const elapsed = Date.now() - t0
        expect(saved?.id).toBe("memory:fast-write")
        expect(elapsed).toBeLessThan(200)
      },
    })
  })
})

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash, randomUUID } from "crypto"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Note } from "../../src/trellis/note"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("note", () => {
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

  test("create with content only auto-generates title", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = Note.create({ content: "# Meeting notes\nDiscussed roadmap." }, dir)
        expect(saved?.id).toStartWith("note:")
        expect(saved?.title).toBe("Meeting notes")
        expect(saved?.content).toContain("Discussed roadmap")
      },
    })
  })

  test("list returns notes newest-first", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        Note.create({ content: "Older note body" }, dir)
        const newer = Note.create({ content: "Newer note body" }, dir)
        expect(newer).toBeTruthy()
        if (!newer) return

        const items = Note.list({ limit: 10 }, dir)
        expect(items.length).toBeGreaterThanOrEqual(2)
        expect(items[0].id).toBe(newer.id)
      },
    })
  })

  test("update refreshes title from content", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = Note.create({ content: "" }, dir)
        expect(saved).toBeTruthy()
        if (!saved) return

        const updated = Note.update(saved.id, { content: "## Renamed\nBody text." }, dir)
        expect(updated?.title).toBe("Renamed")
      },
    })
  })

  test("remove deletes note entity", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = Note.create({ content: "Temporary note" }, dir)
        expect(saved).toBeTruthy()
        if (!saved) return

        const removed = Note.remove(saved.id, dir)
        expect(removed?.retracted).toBeGreaterThan(0)
        expect(Note.list({}, dir).some((item) => item.id === saved.id)).toBe(false)
      },
    })
  })

  test("links note to project via knows", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const saved = Note.create({ content: "Linked note" }, dir)
        expect(saved).toBeTruthy()
        if (!saved) return

        const project = `project:${createHash("sha256").update(dir).digest("hex").slice(0, 12)}`
        const detail = Trellis.storeEntity(saved.id, dir)
        expect(detail?.links.some((link: { e1: string; a: string; e2: string }) => link.e1 === project && link.a === "knows" && link.e2 === saved.id)).toBe(
          true,
        )
      },
    })
  })

  test("save creates then updates note", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const id = `note:${randomUUID()}`
        const created = Note.save({ id, content: "First draft" }, dir)
        expect(created?.title).toBe("First draft")

        const updated = Note.save({ id, content: "Second draft", tags: ["ideas"] }, dir)
        expect(updated?.content).toBe("Second draft")
        expect(updated?.tags).toEqual(["ideas"])

        const detail = Trellis.storeEntity(id, dir)
        const titles = detail?.facts.filter((fact: { a: string }) => fact.a === "title") ?? []
        expect(titles.length).toBe(1)
      },
    })
  })
})

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import * as SourceEntity from "../../src/file/source-entity"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("source entity", () => {
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

  test("upserts Source entity with url facts and session link", async () => {
    const record = await Instance.provide({
      directory: dir,
      fn: () =>
        SourceEntity.upsert(
          {
            url: "https://example.com/docs",
            title: "Example Docs",
            tool: "websearch",
            sessionID: "ses_test",
            messageID: "msg_test",
          },
          dir,
        ),
    })

    expect(record.id).toMatch(/^source:/)
    expect(record.domain).toBe("example.com")

    const entity = Trellis.storeEntity(record.id, dir)
    expect(entity?.facts).toContainEqual({ e: record.id, a: "type", v: "Source" })
    expect(entity?.facts).toContainEqual({ e: record.id, a: "url", v: "https://example.com/docs" })
    expect(entity?.facts).toContainEqual({ e: record.id, a: "title", v: "Example Docs" })

    const links = Trellis.storeLinks(dir, { entity: "session:ses_test" })
    expect(links.some((link: { e2: string; a: string }) => link.e2 === record.id && link.a === "consulted")).toBe(
      true,
    )
  })

  test("dedupes by normalized url", async () => {
    const first = await Instance.provide({
      directory: dir,
      fn: () =>
        SourceEntity.upsert(
          {
            url: "https://github.com/foo/bar/",
            tool: "webfetch",
            sessionID: "ses_test",
            messageID: "msg_a",
          },
          dir,
        ),
    })

    const second = await Instance.provide({
      directory: dir,
      fn: () =>
        SourceEntity.upsert(
          {
            url: "https://github.com/foo/bar",
            title: "Repo",
            tool: "webfetch",
            sessionID: "ses_test",
            messageID: "msg_b",
          },
          dir,
        ),
    })

    expect(first.id).toBe(second.id)
    expect(Trellis.storeEntities(dir, { type: "Source" }).filter((item) => item.id === first.id)).toHaveLength(1)
  })
})

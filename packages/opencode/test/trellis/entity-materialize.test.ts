import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import path from "path"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import * as EntityMaterialize from "../../src/trellis/entity-materialize"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("entity-materialize", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }
  const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
  const watch = proto.watch

  beforeAll(async () => {
    proto.watch = () => undefined
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir, { create: true }) })
  })

  afterAll(async () => {
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("materialize writes @entities markdown and path fact", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const id = "artifact:jd"
        Trellis.storeAssert(
          [
            { e: id, a: "type", v: "artifact" },
            { e: id, a: "cms_status", v: "draft" },
            { e: id, a: "title", v: "Job Description" },
            { e: id, a: "body", v: "React engineer role" },
          ],
          dir,
        )
        await EntityMaterialize.materialize(id, dir)
        const rel = "@entities/artifact/jd.md"
        const text = await readFile(path.join(dir, rel), "utf-8")
        expect(text).toContain("React engineer role")
        expect(text).toContain("Job Description")
        const entity = Trellis.storeEntity(id, dir)
        expect(entity?.facts.find((fact: { a: string; v: unknown }) => fact.a === "path")?.v).toBe(rel)
      },
    })
  })

  test("ingest updates store body from markdown file", async () => {
    await Instance.provide({
      directory: dir,
      fn: async () => {
        const id = "artifact:note"
        Trellis.storeAssert(
          [
            { e: id, a: "type", v: "artifact" },
            { e: id, a: "cms_status", v: "draft" },
            { e: id, a: "title", v: "Note" },
          ],
          dir,
        )
        const rel = "@entities/artifact/note.md"
        const content = `---
trellis:
  id: artifact:note
  type: artifact
  cms_status: draft
title: Note
---

Updated body from file.
`
        await EntityMaterialize.ingest(rel, content, dir)
        const entity = Trellis.storeEntity(id, dir)
        expect(entity?.facts.find((fact: { a: string; v: unknown }) => fact.a === "body")?.v).toBe(
          "Updated body from file.",
        )
      },
    })
  })
})

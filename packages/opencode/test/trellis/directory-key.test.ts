import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { TrellisVcsEngine } from "trellis"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import { Filesystem } from "../../src/util/filesystem"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
const watch = proto.watch

describe("trellis directory key canonicalization", () => {
  let real: string | undefined
  let link: string | undefined

  afterEach(() => {
    proto.watch = watch
    if (real) Trellis.dispose(real)
    if (link) Trellis.dispose(link)
    real = undefined
    link = undefined
  })

  test("symlink and real path share the same engine and work units", async () => {
    proto.watch = () => undefined

    await using tmp = await tmpdir()
    real = path.join(tmp.path, "real")
    link = path.join(tmp.path, "link")
    await fs.mkdir(real, { recursive: true })
    await fs.symlink(real, link)

    await Instance.provide({
      directory: real,
      init: InstanceBootstrap,
      fn: async () => true,
    })

    await Instance.provide({
      directory: real,
      fn: async () => {
        const created = await Trellis.createWorkUnit("Canonical path WU", {}, real)
        expect(created).toBeDefined()
      },
    })

    await Instance.provide({
      directory: link!,
      fn: async () => {
        expect(Trellis.engine(link!)).toBe(Trellis.engine(real!))
        expect(Trellis.workUnits(link!).map((w) => w.title)).toEqual(["Canonical path WU"])
      },
    })
  })

  test("init via symlink path resolves to the same cache key as real path", async () => {
    proto.watch = () => undefined

    await using tmp = await tmpdir()
    real = path.join(tmp.path, "real")
    link = path.join(tmp.path, "link")
    await fs.mkdir(real, { recursive: true })
    await fs.symlink(real, link)

    await Instance.provide({
      directory: real,
      fn: async () => {
        await Trellis.init(real)
      },
    })

    await Instance.provide({
      directory: link!,
      fn: async () => {
        await Trellis.init(link!)
        expect(Trellis.engine(real!)).toBeDefined()
        expect(Trellis.engine(link!)).toBe(Trellis.engine(real!))
        expect(Filesystem.resolve(link!)).toBe(Filesystem.resolve(real!))
      },
    })
  })
})

import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Trellis } from "../../src/trellis"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("trellis bootstrap init", () => {
  let dir: string | undefined

  afterEach(() => {
    if (!dir) return
    Trellis.dispose(dir)
    dir = undefined
  })

  test("creates a trellis repo before bootstrap returns", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    await Instance.provide({
      directory: dir,
      init: InstanceBootstrap,
      fn: async () => true,
    })

    expect(await Bun.file(path.join(dir, ".trellis", "ops.json")).exists()).toBe(true)
    expect(Trellis.engine(dir)).toBeDefined()
  })

  test("server requests bootstrap trellis for requested directories", async () => {
    await using tmp = await tmpdir({ git: true })
    dir = tmp.path

    const res = await Server.ControlPlaneRoutes().request(`/path?directory=${encodeURIComponent(dir)}`)

    expect(res.status).toBe(200)
    expect(await Bun.file(path.join(dir, ".trellis", "ops.json")).exists()).toBe(true)
    expect(Trellis.engine(dir)).toBeDefined()
  })
})

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdir, symlink } from "fs/promises"
import { Hono } from "hono"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

let app: Hono
let dir: string
let cleanup: { [Symbol.asyncDispose](): Promise<void> }

async function req(input: string) {
  return Instance.provide({
    directory: dir,
    fn: () => app.request(input),
  })
}

beforeAll(async () => {
  const tmp = await tmpdir({
    init: async (root) => {
      await Bun.write(path.join(root, "README.md"), "# test")
      const real = path.join(root, "realdir")
      await mkdir(real)
      await Bun.write(path.join(real, "inside.txt"), "ok")
      await symlink(real, path.join(root, "linkdir"))
    },
  })
  cleanup = tmp
  dir = tmp.path

  const { FileRoutes } = await import("../../src/server/routes/file")
  const root = new Hono()
  root.route("/", FileRoutes())
  app = root
})

afterAll(async () => {
  await cleanup[Symbol.asyncDispose]()
})

describe("GET /file", () => {
  test("lists workspace files when directory query param is the instance path", async () => {
    const query = new URLSearchParams({ path: "", directory: dir })
    const res = await req(`http://localhost/file?${query}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ name: string; type: string }>
    expect(body.some((n) => n.name === "README.md")).toBe(true)
    const link = body.find((n) => n.name === "linkdir")
    expect(link?.type).toBe("directory")
  })

})

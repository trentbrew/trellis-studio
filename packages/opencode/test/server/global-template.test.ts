import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

describe("global project template routes", () => {
  test("lists templates", async () => {
    const app = Server.Default()
    const response = await app.request("/global/templates")
    const body = (await response.json()) as Array<{ id: string }>

    expect(response.status).toBe(200)
    expect(body.map((template) => template.id)).toContain("video-remotion")
  })

  test("creates a template project at a requested target", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "mobile-client")
    const app = Server.Default()

    const response = await app.request("/global/template", {
      method: "POST",
      body: JSON.stringify({
        id: "mobile-expo",
        name: "Mobile Client",
        target,
        initGit: false,
      }),
      headers: {
        "content-type": "application/json",
      },
    })
    const body = (await response.json()) as { path: string; template: { id: string } }

    expect(response.status).toBe(200)
    expect(body.path).toBe(target)
    expect(body.template.id).toBe("mobile-expo")
    expect(JSON.parse(await fs.readFile(path.join(target, "app.json"), "utf8"))).toMatchObject({
      expo: {
        name: "Mobile Client",
        slug: "mobile-client",
      },
    })
  })
})

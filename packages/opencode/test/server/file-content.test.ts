import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import { Hono } from "hono"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

let app: Hono
let dir: string
let cleanup: { [Symbol.asyncDispose](): Promise<void> }

async function req(input: string, init?: RequestInit) {
  return Instance.provide({
    directory: dir,
    fn: () => app.request(input, init),
  })
}

beforeAll(async () => {
  const tmp = await tmpdir()
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

describe("spreadsheet file content", () => {
  test("reads xlsx as binary metadata instead of text", async () => {
    await Bun.write(path.join(dir, "book.xlsx"), new Uint8Array([80, 75, 3, 4]))

    const res = await req("http://localhost/file/content?path=book.xlsx")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      type: "binary",
      content: "",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  })

  test("serves xlsx raw bytes with the office mime type", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 20, 0])
    await Bun.write(path.join(dir, "raw.xlsx"), bytes)

    const res = await req("http://localhost/file/raw?path=raw.xlsx")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(bytes))
  })

  test("serves raw media bytes with browser mime types", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const cases = [
      ["tone.wav", "audio/wav"],
      ["track.mp3", "audio/mpeg"],
      ["clip.mp4", "video/mp4"],
      ["clip.webm", "video/webm"],
    ] as const

    for (const item of cases) {
      await Bun.write(path.join(dir, item[0]), bytes)
      const res = await req(`http://localhost/file/raw?path=${item[0]}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe(item[1])
      expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(bytes))
    }
  })

  test("writes base64 spreadsheet bytes in place", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3])
    const res = await req("http://localhost/file/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "saved.xlsx",
        content: Buffer.from(bytes).toString("base64"),
        encoding: "base64",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      type: "binary",
      content: "",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    expect(Array.from(await readFile(path.join(dir, "saved.xlsx")))).toEqual(Array.from(bytes))
  })
})

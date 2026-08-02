import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import path from "path"
import { readFile } from "fs/promises"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

let app: Hono
let dir: string
let cleanup: { [Symbol.asyncDispose](): Promise<void> }

async function upload(target: string, name: string, body: Uint8Array | string, type = "application/octet-stream") {
  const fd = new FormData()
  fd.append("path", target)
  fd.append("name", name)
  fd.append("file", new Blob([body as BlobPart], { type }), name)
  return Instance.provide({
    directory: dir,
    fn: () => app.request("http://localhost/file/upload", { method: "POST", body: fd }),
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

describe("POST /file/upload", () => {
  test("writes a binary blob to a workspace-relative path", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const res = await upload("", "data.bin", bytes)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { path: string; size: number }
    expect(json.path).toBe("data.bin")
    expect(json.size).toBe(5)
    const written = await readFile(path.join(dir, "data.bin"))
    expect(Array.from(written)).toEqual([1, 2, 3, 4, 5])
  })

  test("creates parent directories when target dir does not exist", async () => {
    const res = await upload("nested/deep", "hi.txt", "hello", "text/plain")
    expect(res.status).toBe(200)
    const json = (await res.json()) as { path: string }
    expect(json.path).toBe("nested/deep/hi.txt")
    const text = await readFile(path.join(dir, "nested/deep/hi.txt"), "utf-8")
    expect(text).toBe("hello")
  })

  test("rejects names containing path separators", async () => {
    const res = await upload("", "../escape.txt", "x")
    expect(res.status).toBe(400)
  })

  test("rejects targets that escape the project directory", async () => {
    const res = await upload("../..", "outside.txt", "x")
    expect(res.status).toBe(400)
  })

  test("rejects requests without a file field", async () => {
    const fd = new FormData()
    fd.append("path", "")
    const res = await Instance.provide({
      directory: dir,
      fn: () => app.request("http://localhost/file/upload", { method: "POST", body: fd }),
    })
    expect(res.status).toBe(400)
  })

  test("trusts the caller's name even when the target already exists (overwrites)", async () => {
    await upload("", "same.txt", "first", "text/plain")
    const res = await upload("", "same.txt", "second", "text/plain")
    expect(res.status).toBe(200)
    const text = await readFile(path.join(dir, "same.txt"), "utf-8")
    expect(text).toBe("second")
  })
})

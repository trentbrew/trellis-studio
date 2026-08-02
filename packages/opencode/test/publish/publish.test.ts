import { describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { publish } from "../../src/publish/index"
import type { UploadCredentialBatch } from "../../src/publish/types"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe("publish", () => {
  test("static site publishes end-to-end with mocked broker", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publish-e2e-"))
    await writeFile(path.join(root, "index.html"), "<html>live</html>")

    const calls: string[] = []
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (init?.method === "PUT" && url.includes("r2.example")) {
        return new Response(null, { status: 200 })
      }
      if (url.includes("/publish/begin")) {
        const body = JSON.parse(String(init?.body)) as { manifest: unknown[] }
        const uploads: UploadCredentialBatch["uploads"] = {}
        for (const entry of body.manifest as Array<{ path: string; contentType: string }>) {
          uploads[entry.path] = {
            url: `https://r2.example/${entry.path}`,
            method: "PUT",
            headers: { "content-type": entry.contentType },
          }
        }
        return new Response(
          JSON.stringify({
            kind: "r2-presigned-batch",
            version: "sha256-test",
            uploads,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }),
          { status: 200 },
        )
      }
      if (url.includes("/publish/commit")) {
        return new Response(
          JSON.stringify({ url: "https://hello.studio.trellis.computer", version: "sha256-test" }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 404 })
    }) as unknown as typeof fetch

    const result = await publish({
      projectDir: root,
      projectId: "proj-1",
      brokerUrl: "https://api.studio.trellis.computer",
      authToken: "tok",
      slug: "hello",
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url).toBe("https://hello.studio.trellis.computer")
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/publish/begin"))).toBe(true)
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/publish/commit"))).toBe(true)
  })

  test("failed build does not call broker", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publish-e2e-"))
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { build: "exit 1" } }),
    )

    let brokerCalled = false
    const fetchImpl = (async () => {
      brokerCalled = true
      return new Response(null, { status: 500 })
    }) as unknown as typeof fetch

    const result = await publish({
      projectDir: root,
      projectId: "proj-1",
      brokerUrl: "https://api.studio.trellis.computer",
      authToken: "tok",
      slug: "hello",
      buildCommand: process.platform === "win32" ? "cmd /c exit 1" : "false",
      outputDir: "dist",
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.phase).toBe("building")
    expect(brokerCalled).toBe(false)
  })
})

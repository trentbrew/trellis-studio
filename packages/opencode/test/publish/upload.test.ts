import { describe, expect, test } from "bun:test"
import { uploadArtifact } from "../../src/publish/upload"
import type { UploadCredentialBatch } from "../../src/publish/types"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function credential(paths: string[], expiresInMin = 60): UploadCredentialBatch {
  const uploads: UploadCredentialBatch["uploads"] = {}
  for (const p of paths) {
    uploads[p] = {
      url: `https://r2.example/${encodeURIComponent(p)}`,
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
    }
  }
  return {
    kind: "r2-presigned-batch",
    version: "sha256-test",
    uploads,
    expiresAt: new Date(Date.now() + expiresInMin * 60_000).toISOString(),
  }
}

describe("uploadArtifact", () => {
  test("uploads every file once with PUT", async () => {
    const seen: Array<{ url: string; method: string }> = []
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method ?? "GET" })
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const result = await uploadArtifact({
      credential: credential(["index.html", "app.js"]),
      files: { "index.html": bytes("<html>"), "app.js": bytes("console.log(1)") },
      fetchImpl,
      concurrency: 2,
    })

    expect(result.ok).toBe(true)
    expect(seen).toHaveLength(2)
    expect(seen.every((s) => s.method === "PUT")).toBe(true)
    expect(new Set(seen.map((s) => s.url))).toEqual(
      new Set([
        "https://r2.example/index.html",
        "https://r2.example/app.js",
      ]),
    )
  })

  test("respects concurrency limit", async () => {
    const inflight = { count: 0, max: 0 }
    const fetchImpl = (async () => {
      inflight.count++
      inflight.max = Math.max(inflight.max, inflight.count)
      await new Promise((r) => setTimeout(r, 10))
      inflight.count--
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const paths = Array.from({ length: 20 }, (_, i) => `f${i}.txt`)
    const files = Object.fromEntries(paths.map((p) => [p, bytes("x")]))

    const result = await uploadArtifact({
      credential: credential(paths),
      files,
      fetchImpl,
      concurrency: 4,
    })

    expect(result.ok).toBe(true)
    expect(inflight.max).toBeLessThanOrEqual(4)
  })

  test("reports progress", async () => {
    const fetchImpl = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    const seen: Array<[number, number]> = []
    const paths = ["a.txt", "b.txt", "c.txt"]
    const files = Object.fromEntries(paths.map((p) => [p, bytes(p)]))
    await uploadArtifact({
      credential: credential(paths),
      files,
      fetchImpl,
      concurrency: 1,
      onProgress: (done, total) => seen.push([done, total]),
    })
    expect(seen.at(-1)).toEqual([3, 3])
  })

  test("retries on 5xx then succeeds", async () => {
    let attempt = 0
    const fetchImpl = (async () => {
      attempt++
      if (attempt < 3) return new Response(null, { status: 503 })
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const result = await uploadArtifact({
      credential: credential(["a.txt"]),
      files: { "a.txt": bytes("x") },
      fetchImpl,
      retries: 3,
    })
    expect(result.ok).toBe(true)
    expect(attempt).toBe(3)
  })

  test("does not retry 4xx (signature / policy failure)", async () => {
    let attempt = 0
    const fetchImpl = (async () => {
      attempt++
      return new Response(null, { status: 403 })
    }) as unknown as typeof fetch

    const result = await uploadArtifact({
      credential: credential(["a.txt"]),
      files: { "a.txt": bytes("x") },
      fetchImpl,
      retries: 3,
    })
    expect(result.ok).toBe(false)
    expect(attempt).toBe(1)
    if (result.ok) return
    expect(result.failed[0]!.status).toBe(403)
  })

  test("retries 408 and 429", async () => {
    let attempt = 0
    const fetchImpl = (async () => {
      attempt++
      if (attempt === 1) return new Response(null, { status: 429 })
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const result = await uploadArtifact({
      credential: credential(["a.txt"]),
      files: { "a.txt": bytes("x") },
      fetchImpl,
      retries: 2,
    })
    expect(result.ok).toBe(true)
    expect(attempt).toBe(2)
  })

  test("refuses to start when credential expires within 60s", async () => {
    const cred = credential(["a.txt"], 0) // expiresAt = now
    const result = await uploadArtifact({
      credential: cred,
      files: { "a.txt": bytes("x") },
      // Should never call fetch.
      fetchImpl: (async () => {
        throw new Error("should not fetch")
      }) as unknown as typeof fetch,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failed[0]!.error).toBe("CREDENTIAL_EXPIRED")
  })

  test("reports missing local files without making a request", async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    const result = await uploadArtifact({
      credential: credential(["a.txt", "b.txt"]),
      files: { "a.txt": bytes("present") }, // b.txt missing
      fetchImpl,
    })
    expect(called).toBe(true) // a.txt was uploaded
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.uploaded).toEqual(["a.txt"])
    expect(result.failed[0]).toEqual({ path: "b.txt", error: "FILE_MISSING_LOCAL" })
  })
})

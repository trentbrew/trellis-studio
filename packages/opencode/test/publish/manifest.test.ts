import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildManifest, buildManifestFromFiles, versionFor } from "../../src/publish/manifest"
import { LIMITS, type ManifestEntry } from "../../src/publish/types"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe("buildManifestFromFiles", () => {
  test("produces sorted, content-hashed entries", () => {
    const result = buildManifestFromFiles({
      "index.html": bytes("<html>hi</html>"),
      "assets/app.js": bytes("console.log(1)"),
      "favicon.ico": bytes("ICOXX"),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((e) => e.path)).toEqual([
      "assets/app.js",
      "favicon.ico",
      "index.html",
    ])
    expect(result.entries.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true)
    expect(result.version.startsWith("sha256-")).toBe(true)
    expect(result.totalBytes).toBe(15 + 14 + 5)
  })

  test("version is deterministic across runs", () => {
    const a = buildManifestFromFiles({
      "a.txt": bytes("alpha"),
      "b.txt": bytes("beta"),
    })
    const b = buildManifestFromFiles({
      "b.txt": bytes("beta"),
      "a.txt": bytes("alpha"),
    })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.version).toBe(b.version)
  })

  test("identical contents under different paths produce different versions", () => {
    const a = buildManifestFromFiles({ "a.txt": bytes("hello") })
    const b = buildManifestFromFiles({ "b.txt": bytes("hello") })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.version).not.toBe(b.version)
  })

  test("stamps Content-Type from extension", () => {
    const result = buildManifestFromFiles({ "index.html": bytes("<html>") })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries[0]!.contentType).toBe("text/html; charset=utf-8")
  })

  test("rejects manifests over file-count limit", () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < LIMITS.maxFiles + 1; i++) files[`f${i}.txt`] = bytes("x")
    const result = buildManifestFromFiles(files)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.error).toBe("MANIFEST_TOO_LARGE")
  })

  test("rejects oversize single files", () => {
    const big = new Uint8Array(LIMITS.maxBytesPerFile + 1)
    const result = buildManifestFromFiles({ "big.bin": big })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.error).toBe("FILE_TOO_LARGE")
    expect(result.error.message).toBe("big.bin")
  })

  test("rejects oversize total artifact", () => {
    const halfPlus = new Uint8Array(LIMITS.maxBytesPerFile)
    // ceil(maxTotal / maxBytesPerFile) + 1 files of max size each = over
    const need = Math.floor(LIMITS.maxTotalBytes / LIMITS.maxBytesPerFile) + 1
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < need; i++) files[`f${i}.bin`] = halfPlus
    const result = buildManifestFromFiles(files)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.error).toBe("ARTIFACT_TOO_LARGE")
  })
})

describe("versionFor", () => {
  test("is invariant to input ordering", () => {
    const e1: ManifestEntry[] = [
      { path: "a", size: 1, sha256: "a".repeat(64), contentType: "text/plain" },
      { path: "b", size: 2, sha256: "b".repeat(64), contentType: "text/plain" },
    ]
    const e2 = [...e1].reverse()
    expect(versionFor(e1)).toBe(versionFor(e2))
  })
})

describe("buildManifest (filesystem walk)", () => {
  test("walks a real directory tree and matches buildManifestFromFiles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "publish-manifest-"))
    await writeFile(path.join(root, "index.html"), "<html>hi</html>")
    await mkdir(path.join(root, "assets"))
    await writeFile(path.join(root, "assets/app.js"), "console.log(1)")

    const fromFs = await buildManifest(root)
    const fromMem = buildManifestFromFiles({
      "index.html": bytes("<html>hi</html>"),
      "assets/app.js": bytes("console.log(1)"),
    })
    expect(fromFs.ok && fromMem.ok).toBe(true)
    if (!fromFs.ok || !fromMem.ok) return
    expect(fromFs.version).toBe(fromMem.version)
    expect(fromFs.entries.map((e) => e.path)).toEqual(fromMem.entries.map((e) => e.path))
  })
})

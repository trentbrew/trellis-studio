import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { contentTypeFor } from "./mime"
import { LIMITS, type ManifestEntry, type PublishError } from "./types"

export interface BuildManifestOk {
  ok: true
  entries: ManifestEntry[]
  version: string
  totalBytes: number
}

export interface BuildManifestErr {
  ok: false
  error: PublishError
}

export type BuildManifestResult = BuildManifestOk | BuildManifestErr

// Walks a build output directory and produces the manifest + content-addressed
// version string defined in storage-contract.md §2.
//
// Fails fast on the same limits the broker enforces, so the user sees the
// error before any network round-trip.
export async function buildManifest(rootDir: string): Promise<BuildManifestResult> {
  const absRoot = path.resolve(rootDir)
  const filePaths: string[] = []
  await walk(absRoot, absRoot, filePaths)
  filePaths.sort()

  if (filePaths.length > LIMITS.maxFiles) {
    return {
      ok: false,
      error: {
        error: "MANIFEST_TOO_LARGE",
        limit: { maxFiles: LIMITS.maxFiles, actualFiles: filePaths.length },
      },
    }
  }

  const entries: ManifestEntry[] = []
  let totalBytes = 0

  for (const rel of filePaths) {
    const abs = path.join(absRoot, rel)
    const buf = await readFile(abs)
    const size = buf.byteLength
    if (size > LIMITS.maxBytesPerFile) {
      return {
        ok: false,
        error: {
          error: "FILE_TOO_LARGE",
          limit: { maxBytes: LIMITS.maxBytesPerFile, actualBytes: size },
          message: rel,
        },
      }
    }
    totalBytes += size
    if (totalBytes > LIMITS.maxTotalBytes) {
      return {
        ok: false,
        error: {
          error: "ARTIFACT_TOO_LARGE",
          limit: { maxBytes: LIMITS.maxTotalBytes, actualBytes: totalBytes },
        },
      }
    }
    entries.push({
      path: toPosix(rel),
      size,
      sha256: createHash("sha256").update(buf).digest("hex"),
      contentType: contentTypeFor(rel),
    })
  }

  return { ok: true, entries, version: versionFor(entries), totalBytes }
}

// Deterministic version hash. Identical artifacts → identical version → no-op
// republish at the broker.
export function versionFor(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  // Fixed key order, no whitespace — see storage-contract.md §2.
  const canonical =
    "[" +
    sorted
      .map((e) => `{"path":${JSON.stringify(e.path)},"size":${e.size},"sha256":${JSON.stringify(e.sha256)}}`)
      .join(",") +
    "]"
  return "sha256-" + createHash("sha256").update(canonical).digest("hex")
}

async function walk(root: string, current: string, out: string[]): Promise<void> {
  const dirents = await readdir(current, { withFileTypes: true })
  for (const d of dirents) {
    const abs = path.join(current, d.name)
    if (d.isDirectory()) {
      await walk(root, abs, out)
      continue
    }
    if (!d.isFile()) continue
    const rel = path.relative(root, abs)
    if (rel.includes("..")) continue // defensive — readdir shouldn't produce these
    out.push(rel)
  }
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

// Test helper / future use: build a manifest from in-memory file contents.
// Same shape and version semantics as buildManifest, no filesystem.
export function buildManifestFromFiles(
  files: Record<string, Uint8Array>,
): BuildManifestResult {
  const paths = Object.keys(files).sort()
  if (paths.length > LIMITS.maxFiles) {
    return {
      ok: false,
      error: {
        error: "MANIFEST_TOO_LARGE",
        limit: { maxFiles: LIMITS.maxFiles, actualFiles: paths.length },
      },
    }
  }
  const entries: ManifestEntry[] = []
  let totalBytes = 0
  for (const rel of paths) {
    const buf = files[rel]!
    const size = buf.byteLength
    if (size > LIMITS.maxBytesPerFile) {
      return {
        ok: false,
        error: {
          error: "FILE_TOO_LARGE",
          limit: { maxBytes: LIMITS.maxBytesPerFile, actualBytes: size },
          message: rel,
        },
      }
    }
    totalBytes += size
    if (totalBytes > LIMITS.maxTotalBytes) {
      return {
        ok: false,
        error: {
          error: "ARTIFACT_TOO_LARGE",
          limit: { maxBytes: LIMITS.maxTotalBytes, actualBytes: totalBytes },
        },
      }
    }
    entries.push({
      path: rel,
      size,
      sha256: createHash("sha256").update(buf).digest("hex"),
      contentType: contentTypeFor(rel),
    })
  }
  return { ok: true, entries, version: versionFor(entries), totalBytes }
}

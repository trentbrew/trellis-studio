import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ManifestEntry } from "./types"

/** Load manifest paths into memory for the uploader (bounded by LIMITS upstream). */
export async function loadManifestFiles(
  rootDir: string,
  entries: ManifestEntry[],
): Promise<Record<string, Uint8Array>> {
  const absRoot = path.resolve(rootDir)
  const files: Record<string, Uint8Array> = {}
  for (const entry of entries) {
    const buf = await readFile(path.join(absRoot, entry.path))
    files[entry.path] = new Uint8Array(buf)
  }
  return files
}

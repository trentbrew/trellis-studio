/**
 * Resolver shim for sql.js — build.ts aliases every bare `sql.js` import to this file.
 *
 * Two things go wrong with a bare `sql.js` import inside the compiled binary:
 *
 *   1. The binary is bundled with `conditions: ["browser"]`, so `sql.js` resolves to
 *      dist/sql-wasm-browser.js, whose emscripten loader can only `fetch()` its wasm.
 *   2. There is no wasm on disk to point it at — the file lives in node_modules, which
 *      the single-file binary does not ship.
 *
 * The result was `fetch() URL is invalid` on a `/$bunfs/root/...` path, then an
 * emscripten `abort()` that escapes as an unhandled rejection and kills opencode on
 * boot in any workspace with a `.trellis/` dir (trellis MemoryIndex opens a VectorStore).
 *
 * So: load the node build explicitly, embed the wasm as a binary asset, and hand
 * emscripten a real filesystem path.
 */
import fs from "fs"
import os from "os"
import path from "path"
import initSqlJsNode from "sql.js/dist/sql-wasm.js"
import wasmAsset from "sql.js/dist/sql-wasm.wasm" with { type: "file" }

let cached: string | undefined

/**
 * Returns a directory containing a readable `sql-wasm.wasm`.
 *
 * When running from source `wasmAsset` is already a real path and is used as-is.
 * Inside the compiled binary it is a `/$bunfs/root/...` path, which emscripten
 * cannot load, so the bytes are materialized into a temp dir keyed by byte length
 * (cheap version marker — a sql.js upgrade lands in a different dir).
 */
function wasmDir(): string {
  if (cached) return cached

  const bytes = fs.readFileSync(wasmAsset)

  if (!wasmAsset.startsWith("/$bunfs") && !wasmAsset.startsWith("B:/~BUN") && fs.existsSync(wasmAsset)) {
    cached = path.dirname(wasmAsset)
    return cached
  }

  const dir = path.join(os.tmpdir(), `opencode-sqljs-${bytes.byteLength}`)
  const file = path.join(dir, "sql-wasm.wasm")
  if (!fs.existsSync(file) || fs.statSync(file).size !== bytes.byteLength) {
    fs.mkdirSync(dir, { recursive: true })
    // write-then-rename so concurrent opencode processes never see a partial file
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, file)
  }
  cached = dir
  return cached
}

export default async function initSqlJs(config: Record<string, any> = {}) {
  const dir = wasmDir()
  return (initSqlJsNode as any)({
    ...config,
    locateFile: (file: string) => path.join(dir, file),
  })
}

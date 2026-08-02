#!/usr/bin/env bun
/**
 * End-to-end smoke test for a freshly-built turtlecode CLI.
 *
 * Verifies:
 *   1. `packages/cli/assets/bin/turtlecode-backend` exists and serves trellis routes.
 *   2. `packages/cli/bin/cli.mjs` finds the bundled binary and proxies requests to it.
 *
 * Usage:
 *   bun packages/cli/script/smoke.ts            # run both phases
 *   bun packages/cli/script/smoke.ts --backend  # only the backend phase
 *   bun packages/cli/script/smoke.ts --cli      # only the cli phase
 *
 * Exit codes: 0 on success, 1 on any failure.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const repoRoot = join(root, "..", "..")

// Resolve the backend binary for the current platform from `platforms/`.
// Mirrors the resolution logic in cli.mjs.
function resolvePlatformBinary(): string | null {
  const plat = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const ext = process.platform === "win32" ? ".exe" : ""
  const candidates = [`turtlecode-backend-${plat}-${arch}`, `turtlecode-backend-${plat}-${arch}-baseline`]
  for (const name of candidates) {
    const bin = join(root, "platforms", name, "bin", `turtlecode-backend${ext}`)
    if (existsSync(bin)) return bin
  }
  return null
}

const backendBin = resolvePlatformBinary()
const cli = join(root, "bin", "cli.mjs")

const only = process.argv[2]
const runBackend = !only || only === "--backend"
const runCli = !only || only === "--cli"

let failures = 0

async function waitFor(url: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" })
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

async function expectJson(label: string, url: string, check: (body: any) => boolean) {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`  ✗ ${label} — status ${res.status}`)
      failures++
      return
    }
    const body = (await res.json()) as any
    if (!check(body)) {
      console.error(`  ✗ ${label} — unexpected body shape:`, body)
      failures++
      return
    }
    console.log(`  ✓ ${label}`)
  } catch (err) {
    console.error(`  ✗ ${label} — ${err instanceof Error ? err.message : String(err)}`)
    failures++
  }
}

async function withProcess<T>(cmd: string, args: string[], port: number, fn: () => Promise<T>): Promise<T> {
  const child = spawn(cmd, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] })
  const logs: string[] = []
  child.stdout?.on("data", (d) => logs.push(String(d)))
  child.stderr?.on("data", (d) => logs.push(String(d)))
  try {
    const ready = await waitFor(`http://127.0.0.1:${port}/`)
    if (!ready) {
      console.error(`  ✗ process did not become ready on port ${port}`)
      console.error(logs.join(""))
      failures++
      return undefined as T
    }
    return await fn()
  } finally {
    child.kill()
    await new Promise((r) => child.on("exit", r))
  }
}

if (runBackend) {
  console.log("Phase 1: bundled backend binary")
  if (!backendBin) {
    console.error(`  ✗ no platform binary found under packages/cli/platforms/`)
    console.error(`    Run: bun packages/cli/script/build.ts`)
    failures++
  } else {
    console.log(`  using: ${backendBin.replace(root + "/", "")}`)
    const port = 5179
    const base = `http://127.0.0.1:${port}`
    const dir = encodeURIComponent(repoRoot)
    await withProcess(backendBin, ["serve", "--port", String(port)], port, async () => {
      await expectJson(
        "GET /trellis/stats",
        `${base}/trellis/stats?directory=${dir}`,
        (b) => typeof b.totalOps === "number" && typeof b.trackedFiles === "number",
      )
      await expectJson(
        "GET /trellis/store/stats",
        `${base}/trellis/store/stats?directory=${dir}`,
        (b) => typeof b.totalFacts === "number" && typeof b.uniqueEntities === "number",
      )
      await expectJson(
        "GET /trellis/graph",
        `${base}/trellis/graph?directory=${dir}`,
        (b) => Array.isArray(b.nodes) && Array.isArray(b.edges),
      )
    })
  }
}

if (runCli) {
  console.log("\nPhase 2: cli.mjs proxies to bundled backend")
  const frontPort = 5180
  const backPort = 5181
  const base = `http://127.0.0.1:${frontPort}`
  const dir = encodeURIComponent(repoRoot)
  await withProcess(
    "node",
    [cli, "--port", String(frontPort), "--backend", `http://localhost:${backPort}`, "--no-open"],
    frontPort,
    async () => {
      try {
        const res = await fetch(`${base}/`)
        const text = await res.text()
        if (res.ok && text.toLowerCase().includes("<!doctype")) {
          console.log("  ✓ SPA shell serves HTML")
        } else {
          console.error(`  ✗ SPA shell unexpected (status=${res.status})`)
          failures++
        }
      } catch (err) {
        console.error(`  ✗ SPA shell fetch failed — ${err instanceof Error ? err.message : String(err)}`)
        failures++
      }
      await expectJson(
        "proxied /trellis/stats",
        `${base}/trellis/stats?directory=${dir}`,
        (b) => typeof b.totalOps === "number",
      )
    },
  )
}

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)

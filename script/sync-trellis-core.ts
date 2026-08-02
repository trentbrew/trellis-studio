#!/usr/bin/env bun
/**
 * One-shot: build trellis core, wire it into the IDE workspace, verify.
 *
 * Usage (from ide repo root):
 *   bun script/sync-trellis-core.ts
 *   bun script/sync-trellis-core.ts --skip-opencode-test
 *   bun script/sync-trellis-core.ts --no-build          # install + verify only
 *   bun script/sync-trellis-core.ts --npm               # use "^x.y.z" after npm publish
 *   TRELLIS_PACKAGE=/path/to/trellis-package bun script/sync-trellis-core.ts
 *
 * Env:
 *   TRELLIS_PACKAGE  — override trellis-package path (default: follow packages/opencode
 *                      file: trellis dep, else sibling trellis-package or TRELLIS/kernel)
 *
 * Note: updating packages/opencode/package.json uses JSON.stringify (may reorder keys).
 */
import { $ } from "bun"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { dirname, join, relative, resolve } from "path"

const ide = join(import.meta.dir, "..")
const opencode = join(ide, "packages/opencode")
const opencodePkg = join(opencode, "package.json")

const args = new Set(process.argv.slice(2))
const skipBuild = args.has("--no-build")
const skipTrellisTest = args.has("--skip-trellis-test")
const skipOpencodeTest = args.has("--skip-opencode-test")
const useNpm = args.has("--npm")

function defaultTrellis(): string {
  const oc = JSON.parse(readFileSync(opencodePkg, "utf8")) as {
    dependencies: Record<string, string>
  }
  const dep = oc.dependencies.trellis ?? ""
  if (dep.startsWith("file:")) {
    return resolve(dirname(opencodePkg), dep.slice("file:".length))
  }
  const sibling = join(ide, "..", "..", "trellis-package")
  const desk = join(ide, "..", "..", "..", "TRELLIS", "kernel")
  if (existsSync(join(sibling, "package.json"))) return sibling
  if (existsSync(join(desk, "package.json"))) return desk
  return sibling
}

const trellis = resolve(process.env.TRELLIS_PACKAGE ?? defaultTrellis())

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

function step(n: number, total: number, msg: string) {
  console.log(`\n[${n}/${total}] ${msg}`)
}

function totalSteps() {
  const wired = 4 // pin, install, verify, smoke
  const extra =
    (skipBuild ? 0 : 1) +
    (skipTrellisTest ? 0 : 1) +
    (skipOpencodeTest ? 0 : 1) +
    (useNpm ? 1 : 0) // registry check before pin
  return wired + extra
}

async function assertNpm(version: string) {
  const url = `https://registry.npmjs.org/trellis/${version}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    fail(
      `could not verify trellis@${version} on npm (GET ${url}).\n` +
        `  ${reason}\n` +
        `  Sync without --npm until the registry can be reached.`,
    )
  }
  if (res.ok) return
  fail(
    `trellis@${version} is not on npm yet (GET ${url} → ${res.status}).\n` +
      `  Publish from trellis-package first: npm publish\n` +
      `  Until then, sync without --npm (local file: link).`,
  )
}

async function textOf(value: unknown): Promise<string> {
  if (typeof value === "string") return value
  if (value instanceof Uint8Array) return new TextDecoder().decode(value)
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value)
  if (value instanceof Blob) return value.text()
  return value == null ? "" : String(value)
}

async function capturedOutput(result: { stdout?: unknown; stderr?: unknown; text?: () => Promise<string> }) {
  const stdout = (await textOf(result.stdout)).trim()
  const stderr = (await textOf(result.stderr)).trim()
  const combined = [stdout, stderr].filter(Boolean).join("\n")
  if (combined) return combined
  return result.text?.().catch(() => "") ?? ""
}

async function run() {
  if (!existsSync(join(trellis, "package.json"))) {
    fail(`trellis-package not found at ${trellis} (set TRELLIS_PACKAGE)`)
  }

  const pkg = JSON.parse(readFileSync(join(trellis, "package.json"), "utf8")) as {
    name: string
    version: string
  }
  if (pkg.name !== "trellis") fail(`expected package name "trellis", got "${pkg.name}"`)

  const version = pkg.version
  const rel = relative(dirname(opencodePkg), trellis)
  const link = rel.startsWith("..") ? `file:${rel}` : `file:./${rel}`

  const total = totalSteps()
  let i = 0

  console.log("Trellis core → IDE sync")
  console.log(`  trellis-package: ${trellis} (@${version})`)
  console.log(`  ide:             ${ide}`)
  console.log(`  opencode dep:    ${useNpm ? `^${version}` : link}`)

  if (!skipBuild) {
    step(++i, total, "build trellis-package")
    await $`bun run build`.cwd(trellis).quiet(false)
    if (!existsSync(join(trellis, "dist/cli/index.js"))) {
      fail("build finished but dist/cli/index.js is missing")
    }
  }

  if (!skipTrellisTest) {
    step(++i, total, "test trellis-package")
    await $`bun test`.cwd(trellis).quiet(false)
  }

  if (useNpm) {
    step(++i, total, "check trellis on npm registry")
    await assertNpm(version)
    console.log(`  ✓ trellis@${version} published on npm`)
  }

  step(++i, total, "pin opencode trellis dependency")
  const oc = JSON.parse(readFileSync(opencodePkg, "utf8")) as {
    dependencies: Record<string, string>
  }
  const next = useNpm ? `^${version}` : link
  if (oc.dependencies.trellis === next) {
    console.log(`  already ${next}`)
  } else {
    oc.dependencies.trellis = next
    writeFileSync(opencodePkg, `${JSON.stringify(oc, null, 2)}\n`)
    console.log(`  updated packages/opencode/package.json → ${next}`)
  }

  step(++i, total, "bun install (ide workspace)")
  const install = await $`bun install`.cwd(ide).quiet().nothrow()
  if (install.exitCode !== 0) {
    const err = await capturedOutput(install)
    const hint = useNpm
      ? `\n  --npm requires trellis@${version} on npm. Publish first or drop --npm for a file: link.`
      : ""
    fail(`bun install failed (exit ${install.exitCode})${hint}\n${err}`)
  }

  step(++i, total, "verify linked trellis in node_modules")
  const linked = join(ide, "node_modules/trellis/package.json")
  if (!existsSync(linked)) fail("node_modules/trellis missing after install")
  const linkedVer = JSON.parse(readFileSync(linked, "utf8")).version as string
  if (linkedVer !== version) {
    fail(`node_modules/trellis is ${linkedVer}, expected ${version}`)
  }
  console.log(`  ✓ trellis@${linkedVer}`)

  step(++i, total, "smoke trellis CLI")
  const cli = join(ide, "node_modules/trellis/dist/cli/index.js")
  const ver = (await $`bun ${cli} --version`.cwd(ide).text()).trim()
  if (ver !== version) fail(`CLI reports ${ver}, expected ${version}`)
  console.log(`  ✓ trellis --version → ${ver}`)

  const probe = await $`bun ${cli} issue list -p ${ide}`.cwd(ide).quiet().nothrow()
  if (probe.exitCode !== 0) {
    const err = await capturedOutput(probe)
    fail(`trellis issue list failed (exit ${probe.exitCode})\n${err}`)
  }
  const list = await probe.text()
  const head = list.trim().split("\n")[0] ?? "ok"
  console.log(`  ✓ trellis issue list (${head})`)

  if (!skipOpencodeTest) {
    step(++i, total, "test opencode trellis integration")
    await $`bun test test/trellis`.cwd(opencode).quiet(false)
  }

  console.log("\n✓ Trellis core sync complete")
  console.log("\nNext:")
  console.log("  • Restart opencode / IDE dev server if running")
  if (useNpm) {
    console.log(`  • Published dep: trellis@${version} (npm)`)
  } else {
    console.log("  • Local link active — rebuild trellis-package then re-run this script")
    console.log(`  • After npm publish: bun script/sync-trellis-core.ts --npm`)
  }
  console.log(`  • Agents: cd <repo> && npx trellis@${version} <cmd> -p .`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

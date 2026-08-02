#!/usr/bin/env bun
/**
 * Publish turtlecode to npm with platform-specific backend packages.
 *
 * Workflow:
 *   1. Reads the current `packages/cli/package.json` version.
 *   2. Syncs that version into the main pkg's `optionalDependencies`.
 *   3. Runs `bun script/build.ts --all-platforms` (unless `--no-build`).
 *   4. Publishes every `platforms/turtlecode-backend-*` package.
 *   5. Publishes the main `turtlecode` package.
 *
 * Flags:
 *   --dry-run       Print `npm publish --dry-run` for each package, skip real publish.
 *   --no-build      Skip rebuild; assumes `platforms/` is already populated.
 *   --tag <tag>     npm dist-tag (default: latest).
 *   --only-backends Publish only the platform sub-packages, not the main CLI.
 *   --only-main     Publish only the main CLI, not the platform sub-packages.
 *   --otp <code>    One-time password for npm 2FA (reused across all publishes
 *                   in the run; npm caches OTPs for ~30 min so one code suffices).
 *
 * Prereqs:
 *   - npm auth: `NPM_TOKEN` / `NODE_AUTH_TOKEN` in desk `../.env` (or `npm login`).
 *     Automation tokens skip OTP prompts; granular publish tokens need `--otp`.
 *   - All target platform package names are either yours or available on npm.
 */
import { $ } from "bun"
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createInterface } from "readline/promises"

const root = join(import.meta.dir, "..")
const platforms = join(root, "platforms")
const mainPkgPath = join(root, "package.json")

/** Load KEY=VALUE pairs from a `.env` file. */
function loadEnvFile(path: string, opts?: { override?: boolean; keys?: string[] }) {
  if (!existsSync(path)) return
  const only = opts?.keys ? new Set(opts.keys) : null
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (only && !only.has(key)) continue
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (opts?.override || process.env[key] === undefined) process.env[key] = val
  }
}

const NPM_AUTH_KEYS = ["NPM_TOKEN", "NODE_AUTH_TOKEN", "NPM_AUTH_TOKEN"] as const

/** Desk `.env` lives beside `studio/` (mac-compat: `Projects/TRELLIS/.env`). */
function deskEnvCandidates(cliRoot: string): string[] {
  const physical = realpathSync(cliRoot)
  const studioRoot = join(physical, "..", "..")
  return [
    join(studioRoot, "..", ".env"),
    join(physical, "..", "..", "..", "..", "..", "TRELLIS", ".env"),
    join(physical, "..", "..", "..", "..", "TRELLIS", ".env"),
  ]
}

const studioEnv = join(root, "..", "..", ".env")
loadEnvFile(studioEnv)
loadEnvFile(join(root, ".env"))
for (const envPath of deskEnvCandidates(root)) {
  loadEnvFile(envPath, { keys: [...NPM_AUTH_KEYS], override: true })
}

const argv = process.argv.slice(2)
const has = (flag: string) => argv.includes(flag)
const dryRun = has("--dry-run")
const noBuild = has("--no-build")
const onlyBackends = has("--only-backends")
const onlyMain = has("--only-main")
const tagIdx = argv.indexOf("--tag")
const tag = tagIdx >= 0 ? (argv[tagIdx + 1] ?? "latest") : "latest"
const otpIdx = argv.indexOf("--otp")
let otp = otpIdx >= 0 ? (argv[otpIdx + 1] ?? "") : (process.env.NPM_OTP ?? process.env.NPM_CONFIG_OTP ?? "")
let token = process.env.NPM_TOKEN ?? process.env.NPM_AUTH_TOKEN ?? process.env.NODE_AUTH_TOKEN ?? ""
const userEnv = { ...process.env }
let tmp = ""
let cfg = ""
let env = userEnv

async function auth(env: NodeJS.ProcessEnv, userConfig?: string) {
  const res = userConfig
    ? await $`npm whoami --userconfig ${userConfig}`.env(env).quiet().nothrow()
    : await $`npm whoami`.env(env).quiet().nothrow()
  return res.exitCode === 0 ? res.text().trim() : ""
}

if (token) {
  tmp = mkdtempSync(join(tmpdir(), "turtlecode-npm-"))
  cfg = join(tmp, ".npmrc")
  writeFileSync(cfg, `registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${token}\n`, {
    mode: 0o600,
  })
  process.on("exit", () => rmSync(tmp, { recursive: true, force: true }))

  const tokenEnv = {
    ...userEnv,
    NODE_AUTH_TOKEN: token,
    NPM_CONFIG_USERCONFIG: cfg,
    NPM_AUTH_TOKEN: token,
  }

  const tokenUser = await auth(tokenEnv, cfg)
  if (tokenUser) {
    env = tokenEnv
  } else {
    const fallbackEnv = { ...userEnv }
    delete fallbackEnv.NPM_TOKEN
    delete fallbackEnv.NODE_AUTH_TOKEN
    delete fallbackEnv.NPM_AUTH_TOKEN

    const fallbackUser = await auth(fallbackEnv)
    if (fallbackUser) {
      console.warn(
        "\nNPM auth token from environment failed; falling back to existing npm login.",
      )
      env = fallbackEnv
      cfg = ""
      token = ""
    } else {
      console.warn(
        "\nNPM auth token from environment failed and no existing npm login was detected.",
      )
      env = tokenEnv
    }
  }
}

const mainPkg = JSON.parse(readFileSync(mainPkgPath, "utf8"))
const version = mainPkg.version as string
const source = await $`git rev-parse HEAD`
  .cwd(join(root, "..", ".."))
  .text()
  .then((x) => x.trim())
  .catch(() => "unknown")

console.log(`turtlecode publish — v${version} (tag: ${tag}${dryRun ? ", dry-run" : ""})`)

if (!dryRun && !token && !(await auth())) {
  console.error("Error: not logged into npm. Run `npm login` first or set NPM_TOKEN/NODE_AUTH_TOKEN.")
  process.exit(1)
}

// --- Sync optionalDependencies to current version ---------------------------
const optDeps = (mainPkg.optionalDependencies ?? {}) as Record<string, string>
const declaredPlatforms = Object.keys(optDeps)
let synced = false
for (const name of declaredPlatforms) {
  if (optDeps[name] !== version) {
    optDeps[name] = version
    synced = true
  }
}
if (synced) {
  mainPkg.optionalDependencies = optDeps
  writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + "\n")
  console.log(`  Synced optionalDependencies to ${version}`)
}

// --- Build -------------------------------------------------------------------
if (!noBuild) {
  console.log("\nBuilding all-platforms...")
  await $`bun script/build.ts --all-platforms`.cwd(root)
}

if (!existsSync(platforms)) {
  console.error(`Error: ${platforms} not found. Run without --no-build or build first.`)
  process.exit(1)
}

// --- Collect built platform packages ----------------------------------------
const builtPlatforms = readdirSync(platforms, { withFileTypes: true })
  .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
  .map((d: { name: string }) => d.name)
  .filter((n: string) => n.startsWith("turtlecode-backend-"))
  .sort()

if (builtPlatforms.length === 0) {
  console.error("Error: no platform packages found in platforms/")
  process.exit(1)
}

if (noBuild) {
  const stale = builtPlatforms.filter((name) => {
    const item = JSON.parse(readFileSync(join(platforms, name, "package.json"), "utf8"))
    return item.version !== version || item.turtlecodeBuild?.source !== source
  })
  if (stale.length) {
    const msg = "--no-build platform packages are stale. Re-run without --no-build before publishing."
    const details = [`  expected version/source: ${version} ${source}`, `  stale: ${stale.join(", ")}`]
    if (!dryRun) {
      console.error(`Error: ${msg}`)
      for (const line of details) console.error(line)
      process.exit(1)
    }
    console.warn(`  ⚠ ${msg}`)
    for (const line of details) console.warn(line)
  }
}

// Warn about skew between declared optionalDependencies and actually-built packages.
const declared = new Set<string>(declaredPlatforms)
const built = new Set<string>(builtPlatforms)
const missing = [...declared].filter((n) => !built.has(n))
const extra = [...built].filter((n) => !declared.has(n))
if (missing.length) console.warn(`  ⚠ declared but not built: ${missing.join(", ")}`)
if (extra.length) console.warn(`  ⚠ built but not declared in optionalDependencies: ${extra.join(", ")}`)

// --- Publish -----------------------------------------------------------------
// Quick registry lookup. Returns true iff `<name>@<version>` is already published.
// Hits registry.npmjs.org directly rather than `npm view` because npm's local
// metadata cache happily serves stale 404s, which breaks the pre-publish
// idempotency check poisoning the post-publish verification on the same run.
async function alreadyPublished(name: string, ver: string): Promise<boolean> {
  const url = `https://registry.npmjs.org/${name}/${ver}`
  const res = await fetch(url, { headers: { accept: "application/json" } })
  return res.ok
}

async function npmAuthInfo() {
  const registry = await $`npm config get registry`.env(env).quiet().nothrow()
  const whoami = await $`npm whoami`.env(env).quiet().nothrow()
  return {
    registry: registry.exitCode === 0 ? registry.text().trim() : "(unknown)",
    whoami: whoami.exitCode === 0 ? whoami.text().trim() : "(not authenticated)",
  }
}

function retry() {
  return `just publish-resume${tag === "latest" ? "" : ` --tag ${tag}`}${otp ? " --otp <fresh-code>" : ""}`
}

async function run(dir: string, args: string[]) {
  const child = spawn("npm", args, { cwd: dir, env, stdio: "inherit" })
  return await new Promise<{ status: number | null; error?: Error }>((done) => {
    child.on("error", (error) => done({ status: null, error }))
    child.on("close", (status) => done({ status }))
  })
}

async function publish(dir: string, label: string, seen = false) {
  // Idempotency: skip anything already at the target version. Makes the script
  // safe to re-run after partial failures (and avoids E403 on re-publish).
  if (!dryRun && !seen && (await alreadyPublished(label, version))) {
    console.log(`\nSkipping ${label} (already published at ${version})`)
    return
  }
  const args = ["publish", "--access", "public", "--tag", tag]
  if (cfg) args.push("--userconfig", cfg)
  if (dryRun) args.push("--dry-run")
  if (otp) args.push("--otp", otp)
  console.log(`\nPublishing ${label}...`)
  const res = await run(dir, args)
  if (res.error) {
    console.error(`\nnpm publish failed to start for ${label}: ${res.error.message}`)
    process.exit(1)
  }
  if (res.status !== 0) {
    if (!dryRun && (await alreadyPublished(label, version))) {
      console.log(`\n${label} is published at ${version}; continuing despite npm exit ${res.status}`)
      return
    }
    console.error(`\nnpm publish failed for ${label} (exit ${res.status ?? 1})`)
    if (!dryRun) {
      const auth = await npmAuthInfo()
      console.error(`  npm registry: ${auth.registry}`)
      console.error(`  npm user: ${auth.whoami}`)
      if (!token && !otp) {
        console.error(
          "  No npm auth token or OTP was provided. For 2FA-enabled accounts, pass --otp <code> or set NPM_TOKEN/NODE_AUTH_TOKEN.",
        )
      }
      console.error(`  Retry without rebuilding: ${retry()}`)
      console.error(`  Already-published packages will be skipped on retry.`)
    }
    process.exit(res.status ?? 1)
  }
  // Post-verify: confirm the package actually landed on the registry. Uses a
  // direct HTTPS fetch (not `npm view`) to bypass npm's metadata cache.
  if (!dryRun && !(await alreadyPublished(label, version))) {
    throw new Error(
      `publish reported success but ${label}@${version} is not on the registry. ` +
        `Check network and re-run; the script is idempotent.`,
    )
  }
}

const targets = [
  ...(!onlyMain ? builtPlatforms.map((name) => ({ dir: join(platforms, name), label: name })) : []),
  ...(!onlyBackends ? [{ dir: root, label: "turtlecode" }] : []),
]
const todo: typeof targets = []

for (const item of targets) {
  if (await alreadyPublished(item.label, version)) {
    console.log(`\nSkipping ${item.label} (already published at ${version})`)
    continue
  }
  todo.push(item)
}

if (!dryRun && todo.length > 1 && !otp && !token) {
  console.warn("\nNo npm OTP or auth token was detected.")
  console.warn("If npm requires 2FA for publish writes, this run needs a fresh one-time password.")
  console.warn("Use --otp <code>/NPM_OTP, or NPM_TOKEN/NODE_AUTH_TOKEN with an npm automation token to avoid prompts.")
}

if (token) console.log("\nUsing npm auth token from environment.")
if (!dryRun && todo.length > 0 && !token && !otp) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  otp = (await rl.question("\nEnter npm OTP for publish writes, or press Enter to try without one: ")).trim()
  rl.close()
}
console.log(
  `\n${dryRun ? "Dry-run publishing" : "Publishing"} ${todo.length}/${targets.length} package${targets.length === 1 ? "" : "s"}.`,
)

for (const item of todo) await publish(item.dir, item.label, true)

console.log(`\n${dryRun ? "Dry run " : ""}Done.`)

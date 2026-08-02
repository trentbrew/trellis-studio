import { $ } from "bun"
import { join } from "path"
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, writeFileSync, readFileSync } from "fs"

const root = join(import.meta.dir, "..")
const app = join(root, "..", "app")
const backend = join(root, "..", "opencode")
const assets = join(root, "assets")
const platforms = join(root, "platforms")
const starterTemplates = join(root, "..", "..", "starter-templates", "projects")

if (!process.env.NODE_OPTIONS?.includes("--max-old-space-size")) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=4096`.trim()
}

const skipBackend = process.argv.includes("--skip-backend")
const allPlatforms = process.argv.includes("--all-platforms")

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const version = pkg.version as string
const source = await $`git rev-parse HEAD`
  .cwd(join(root, "..", ".."))
  .text()
  .then((x) => x.trim())
  .catch(() => "unknown")

// --- 1. Build the web app -----------------------------------------------------
console.log("Building web app...")
await $`bun run build`.cwd(app)

if (existsSync(assets)) rmSync(assets, { recursive: true })
mkdirSync(assets, { recursive: true })

const dist = join(app, "dist")
if (!existsSync(dist)) {
  console.error("Error: packages/app/dist not found after build")
  process.exit(1)
}

cpSync(dist, assets, { recursive: true })
console.log("Assets copied to packages/cli/assets/")

if (existsSync(starterTemplates)) {
  const bundledTemplates = join(assets, "starter-templates", "projects")
  mkdirSync(join(assets, "starter-templates"), { recursive: true })
  cpSync(starterTemplates, bundledTemplates, { recursive: true })
  console.log("Starter templates copied to packages/cli/assets/starter-templates/projects/")
}

// --- 2. Build backend binary(ies) --------------------------------------------
// opencode's build.ts compiles a native Bun binary per target. We reuse it,
// then repackage the outputs into `packages/cli/platforms/turtlecode-backend-<target>/`
// sub-packages ready to be published individually and listed as
// `optionalDependencies` of the main `turtlecode` npm package.
if (!skipBackend) {
  if (existsSync(platforms)) rmSync(platforms, { recursive: true })
  mkdirSync(platforms, { recursive: true })

  const env = { ...process.env, OPENCODE_VERSION: version, OPENCODE_CHANNEL: "latest" }
  const mode = allPlatforms ? "all platforms" : "current platform"
  console.log(`\nBuilding backend binary (${mode})...`)
  await $`rm -rf dist`.cwd(backend).nothrow()
  if (allPlatforms) {
    await $`bun script/build.ts --skip-embed-web-ui`.cwd(backend).env(env)
  } else {
    await $`bun script/build.ts --single --skip-embed-web-ui`.cwd(backend).env(env)
  }

  const distDir = join(backend, "dist")
  if (!existsSync(distDir)) {
    console.error("Error: packages/opencode/dist not found after backend build")
    process.exit(1)
  }

  // opencode produces `dist/opencode-<target>/bin/opencode[.exe]` + a
  // per-target `package.json` (name/version/os/cpu). We rename each package
  // to `turtlecode-backend-<target>` and copy it under `platforms/`.
  const targetDirs = readdirSync(distDir, { withFileTypes: true })
    .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
    .map((d: { name: string }) => d.name)

  const packaged: string[] = []
  for (const target of targetDirs) {
    const srcBinDir = join(distDir, target, "bin")
    if (!existsSync(srcBinDir)) continue
    const entries = readdirSync(srcBinDir).filter((f: string) => f === "opencode" || f === "opencode.exe")
    if (entries.length === 0) continue
    const entry = entries[0]
    if (!entry) continue
    const srcBin = join(srcBinDir, entry)
    const ext = srcBin.endsWith(".exe") ? ".exe" : ""

    // Strip `opencode-` prefix → `darwin-arm64`, `linux-x64-baseline`, ...
    const suffix = target.replace(/^opencode-/, "")
    const pkgName = `turtlecode-backend-${suffix}`
    const pkgDir = join(platforms, pkgName)
    const destBinDir = join(pkgDir, "bin")
    mkdirSync(destBinDir, { recursive: true })

    const destBin = join(destBinDir, `turtlecode-backend${ext}`)
    cpSync(srcBin, destBin)
    await $`chmod +x ${destBin}`.nothrow()

    // Read opencode's generated per-target package.json to inherit os/cpu.
    const srcPkg = JSON.parse(readFileSync(join(distDir, target, "package.json"), "utf8"))
    const subPkg = {
      name: pkgName,
      version,
      description: `turtlecode backend binary for ${suffix}`,
      license: pkg.license ?? "MIT",
      repository: pkg.repository,
      os: srcPkg.os,
      cpu: srcPkg.cpu,
      turtlecodeBuild: {
        source,
      },
      files: ["bin/"],
    }
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify(subPkg, null, 2) + "\n")
    packaged.push(pkgName)
  }

  if (packaged.length === 0) {
    console.error("Error: no backend binaries packaged into platforms/")
    process.exit(1)
  }

  console.log(`\nPackaged ${packaged.length} platform binar${packaged.length === 1 ? "y" : "ies"}:`)
  for (const name of packaged) console.log(`  platforms/${name}/`)
} else {
  console.log("\nSkipping backend binary build (--skip-backend)")
}

await $`chmod +x ${join(root, "bin", "cli.mjs")}`
console.log("\nDone. Ready to publish.")

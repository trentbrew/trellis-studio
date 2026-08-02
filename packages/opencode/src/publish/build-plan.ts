import { existsSync } from "fs"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { hasHtml } from "@/preview/static"
import { infer } from "@/preview/infer"

export interface PublishBuildPlan {
  /** Shell command to run before upload; null when the tree is already static. */
  buildCommand: string | null
  /** Directory relative to project root that contains publishable files. */
  outputDir: string
  /** Opt-in SPA fallback for client routers (Vite, Next export, etc.). */
  spaFallback: boolean
}

const OUTPUT_CANDIDATES = ["dist", "build", "out", ".output/public", "public"] as const

/**
 * Infer how a project should be built and which folder to upload.
 * Reuses preview/infer.ts for framework hints; reads package.json for `build`.
 */
export async function inferPublishBuild(dir: string): Promise<PublishBuildPlan> {
  const abs = path.resolve(dir)
  const pkg = await readPackageJson(abs)
  const suggestions = await infer(abs)
  const spaFallback = detectSpaFallback(abs, pkg, suggestions)

  const buildCommand = pickBuildCommand(pkg)
  if (!buildCommand) {
    const staticRoot = pickStaticRoot(abs)
    return { buildCommand: null, outputDir: staticRoot, spaFallback: false }
  }

  const outputDir =
    (await detectOutputDir(abs, pkg)) ??
    (buildCommand.includes("next") ? "out" : "dist")

  return { buildCommand, outputDir, spaFallback }
}

export function resolvePublishBuild(
  plan: PublishBuildPlan,
  overrides?: { buildCommand?: string | null; outputDir?: string; spaFallback?: boolean },
): PublishBuildPlan {
  return {
    buildCommand:
      overrides?.buildCommand !== undefined ? overrides.buildCommand : plan.buildCommand,
    outputDir: overrides?.outputDir?.replace(/^\/+/, "") || plan.outputDir,
    spaFallback: overrides?.spaFallback ?? plan.spaFallback,
  }
}

async function readPackageJson(dir: string): Promise<Record<string, unknown> | null> {
  const file = path.join(dir, "package.json")
  if (!existsSync(file)) return null
  return Filesystem.readJson<Record<string, unknown>>(file).catch(() => null)
}

function pickBuildCommand(pkg: Record<string, unknown> | null): string | null {
  const scripts = pkg?.scripts as Record<string, string> | undefined
  if (!scripts) return null
  if (scripts.build?.trim()) return "npm run build"
  return null
}

function pickStaticRoot(dir: string): string {
  if (hasHtml(dir)) return "."
  for (const name of OUTPUT_CANDIDATES) {
    if (hasHtml(path.join(dir, name))) return name
  }
  return "."
}

async function detectOutputDir(dir: string, pkg: Record<string, unknown> | null): Promise<string | null> {
  const viteOut = await readViteOutDir(dir)
  if (viteOut) return viteOut

  if (existsSync(path.join(dir, "next.config.ts")) || existsSync(path.join(dir, "next.config.js"))) {
    if (existsSync(path.join(dir, "out"))) return "out"
    return "out"
  }

  for (const name of OUTPUT_CANDIDATES) {
    if (existsSync(path.join(dir, name))) return name
  }

  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  }
  if (deps?.vite) return "dist"
  if (deps?.next) return "out"
  return null
}

async function readViteOutDir(dir: string): Promise<string | null> {
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mts"]) {
    const file = path.join(dir, name)
    if (!existsSync(file)) continue
    const text = await Bun.file(file)
      .text()
      .catch(() => "")
    const match = text.match(/outDir\s*:\s*['"`]([^'"`]+)['"`]/)
    if (match?.[1]) return match[1].replace(/^\//, "")
  }
  return null
}

function detectSpaFallback(
  dir: string,
  pkg: Record<string, unknown> | null,
  suggestions: Awaited<ReturnType<typeof infer>>,
): boolean {
  if (suggestions.some((s) => s.command.includes("vite") || s.command.includes("next"))) return true
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  }
  if (deps?.vite || deps?.["react-router"] || deps?.["@remix-run/react"]) return true
  if (deps?.next) return true
  if (
    existsSync(path.join(dir, "vite.config.ts")) ||
    existsSync(path.join(dir, "vite.config.js")) ||
    existsSync(path.join(dir, "next.config.ts")) ||
    existsSync(path.join(dir, "next.config.js"))
  ) {
    return true
  }
  return false
}

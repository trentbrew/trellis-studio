#!/usr/bin/env bun
/**
 * Phase 149c — warn on legacy elevation tokens in app + ui source.
 * Run: bun packages/ui/script/lint-elevation-tokens.ts
 * Exit 0 with warnings printed; exit 1 only on --strict if any warnings.
 */

import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

const UI_PKG = join(import.meta.dir, "..")
const STUDIO = join(UI_PKG, "../..")
const SCAN_ROOTS = [join(STUDIO, "packages/app/src"), join(UI_PKG, "src")]
const EXT = new Set([".tsx", ".ts", ".css"])

const RULES: Array<{
  id: string
  pattern: RegExp
  message: string
  severity: "warning" | "error"
}> = [
  {
    id: "bg-background-panel",
    pattern: /\bbg-background-panel\b/g,
    message: "Use bg-panel (--bg-panel) instead of TUI-only bg-background-panel",
    severity: "warning",
  },
  {
    id: "var-background-panel",
    pattern: /var\(\s*--background-panel\s*\)/g,
    message: "Use var(--bg-panel) instead of --background-panel",
    severity: "warning",
  },
  {
    id: "color-mix-depth",
    pattern: /color-mix\([^)]*var\(\s*--background-base\s*\)/g,
    message: "Prefer a --bg-* ladder step instead of color-mix(... var(--background-base) ...) for depth",
    severity: "warning",
  },
]

type Hit = { file: string; line: number; rule: string; message: string; severity: "warning" | "error"; snippet: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue
      walk(path, out)
    } else if (EXT.has(name.slice(name.lastIndexOf(".")))) {
      if (name === "lint-elevation-tokens.ts" || name === "token-validator.ts") continue
      out.push(path)
    }
  }
  return out
}

function lintFile(path: string): Hit[] {
  const text = readFileSync(path, "utf-8")
  const lines = text.split("\n")
  const hits: Hit[] = []
  const rel = relative(STUDIO, path)

  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (!rule.pattern.test(line)) {
        rule.pattern.lastIndex = 0
        continue
      }
      rule.pattern.lastIndex = 0
      hits.push({
        file: rel,
        line: i + 1,
        rule: rule.id,
        message: rule.message,
        severity: rule.severity,
        snippet: line.trim().slice(0, 120),
      })
    }
  }
  return hits
}

const strict = process.argv.includes("--strict")
const hits = SCAN_ROOTS.flatMap((root) => walk(root).flatMap(lintFile))

if (hits.length === 0) {
  console.log("elevation token lint: no legacy usage found")
  process.exit(0)
}

const warnings = hits.filter((h) => h.severity === "warning")
const errors = hits.filter((h) => h.severity === "error")

for (const h of hits) {
  const tag = h.severity === "error" ? "error" : "warn "
  console.log(`${tag}  ${h.file}:${h.line} [${h.rule}] ${h.message}`)
  console.log(`       ${h.snippet}`)
}

console.log(
  `\nelevation token lint: ${warnings.length} warning(s), ${errors.length} error(s)`,
)

if (strict && hits.length > 0) process.exit(1)
process.exit(0)

import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)

/** Resolved path to @zed-industries/claude-code-acp agent entry (dist/index.js). */
export function resolveClaudeCodeAcpEntry(): string {
  const pkgJson = require.resolve("@zed-industries/claude-code-acp/package.json")
  return join(dirname(pkgJson), "dist/index.js")
}

export function defaultBridgeSpawn(cwd: string) {
  const entry = resolveClaudeCodeAcpEntry()
  return {
    command: process.execPath,
    args: [entry],
    cwd,
    env: { ...process.env },
  }
}

export const SPIKE_MODULE_DIR = dirname(fileURLToPath(import.meta.url))

#!/usr/bin/env bun
/**
 * CC0 spike: Claude Code subscription via @zed-industries/claude-code-acp + ACP client.
 *
 * Prereq: `claude login` on the machine running this script (same host as Studio backend).
 *
 * Usage (from packages/app):
 *   bun run acp:spike
 *   bun run acp:spike -- --cwd /path/to/project
 */
import { runClaudeAcpSpike } from "../src/agent/acp-client"
import { resolveClaudeCodeAcpEntry } from "../src/agent/bridge-path"

const cwd = process.argv.includes("--cwd")
  ? process.argv[process.argv.indexOf("--cwd") + 1] ?? process.cwd()
  : process.cwd()

console.log("Claude Code ACP spike (CC0)")
console.log("  cwd:   ", cwd)
console.log("  bridge:", resolveClaudeCodeAcpEntry())
console.log("")

const result = await runClaudeAcpSpike({
  cwd,
  autoAcceptPermissions: true,
  onStderr: (line) => process.stderr.write(line),
})

if (result.authRequired) {
  console.error("\n✗ Auth required:", result.error)
  process.exit(2)
}

if (!result.ok) {
  console.error("\n✗ Spike failed:", result.error ?? "expected ACP_SPIKE_OK in response")
  console.error("  assistant text:", result.assistantText.slice(0, 500))
  process.exit(1)
}

console.log("\n✓ Spike OK")
console.log("  session:", result.sessionId)
console.log("  text:   ", result.assistantText.trim().slice(0, 200))
console.log("  updates:", result.updates.length)

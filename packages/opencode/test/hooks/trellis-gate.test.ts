import { describe, it, expect } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gateTool, registerTrellisGate, trellisGateRegistered } from "@/hooks/trellis-gate"
import { hooks } from "@/hooks/dispatcher"

function makeTrellisRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "trellis-gate-"))
  mkdirSync(join(root, ".trellis"), { recursive: true })
  writeFileSync(join(root, ".trellis", "config.json"), JSON.stringify({}))
  return root
}

describe("trellis-gate", () => {
  it("registers the preToolUse hook once", () => {
    registerTrellisGate()
    registerTrellisGate()
    expect(trellisGateRegistered()).toBe(true)
    expect(hooks.has("preToolUse")).toBe(true)
  })

  it("denies destructive git on a Trellis-owned tree (armed kernel)", async () => {
    const root = makeTrellisRepo()
    const r = await gateTool({
      tool: "bash",
      args: { command: "git reset --hard HEAD~1" },
      directory: root,
      sessionID: "sess_1",
    })
    expect(r.continue).toBe(false)
    expect(r.decision).toBe("deny")
    expect(r.redirect).toBe("trellis lane promote")
  })

  it("allows read-only git inside a Trellis tree", async () => {
    const root = makeTrellisRepo()
    const r = await gateTool({
      tool: "bash",
      args: { command: "git status" },
      directory: root,
      sessionID: "sess_1",
    })
    expect(r.continue).toBe(true)
  })

  it("allows git outside a Trellis tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-gate-none-"))
    const r = await gateTool({
      tool: "bash",
      args: { command: "git reset --hard" },
      directory: root,
      sessionID: "sess_1",
    })
    expect(r.continue).toBe(true)
  })
})

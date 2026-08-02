import { describe, expect, test } from "bun:test"
import { runClaudeAcpSpike } from "./acp-client"

const runLive = process.env.TRELLIS_ACP_SPIKE_LIVE === "1"

describe("acp-claude-spike (live)", () => {
  test(
    "subscription-backed prompt returns ACP_SPIKE_OK",
    async () => {
      if (!runLive) return

      const result = await runClaudeAcpSpike({
        cwd: process.cwd(),
        autoAcceptPermissions: true,
      })

      if (result.authRequired) {
        console.warn("Skip: Claude Code not authenticated (`claude login`)")
        return
      }

      expect(result.ok).toBe(true)
      expect(result.assistantText).toContain("ACP_SPIKE_OK")
      expect(result.updates.length).toBeGreaterThan(0)
    },
    { timeout: 120_000 },
  )
})

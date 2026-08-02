import { describe, expect, test } from "bun:test"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import { SystemPrompt } from "../../src/session/system"
import { Trellis } from "../../src/trellis"
import { tmpdir } from "../fixture/fixture"

describe("session.system", () => {
  test("skills output is sorted by name and stable across calls", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        for (const [name, description] of [
          ["zeta-skill", "Zeta skill."],
          ["alpha-skill", "Alpha skill."],
          ["middle-skill", "Middle skill."],
        ]) {
          const skillDir = path.join(dir, ".opencode", "skill", name)
          await Bun.write(
            path.join(skillDir, "SKILL.md"),
            `---
name: ${name}
description: ${description}
---

# ${name}
`,
          )
        }
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const build = await Agent.get("build")
          const first = await SystemPrompt.skills(build!)
          const second = await SystemPrompt.skills(build!)

          expect(first).toBe(second)

          const alpha = first!.indexOf("<name>alpha-skill</name>")
          const middle = first!.indexOf("<name>middle-skill</name>")
          const zeta = first!.indexOf("<name>zeta-skill</name>")

          expect(alpha).toBeGreaterThan(-1)
          expect(middle).toBeGreaterThan(alpha)
          expect(zeta).toBeGreaterThan(middle)
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("trellis prompt includes knowledge capture guidance", async () => {
    await using tmp = await tmpdir({ git: true })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await Trellis.init(tmp.path)
          const ctx = await SystemPrompt.trellis()
          expect(ctx).toBeDefined()
          expect(ctx).toContain("Knowledge capture")
          expect(ctx).toContain("Entity lists")
          expect(ctx).toContain("Graph enrichment")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("environment includes trellis follow-up after web research", async () => {
    await using tmp = await tmpdir({ git: true })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const env = await SystemPrompt.environment({
            providerID: "google",
            modelID: "gemini-flash-latest",
            api: { id: "gemini-flash-latest", npm: "@ai-sdk/google" },
          } as any)
          const joined = env.join("\n")
          expect(joined).toContain("Next steps in Trellis")
          expect(joined).toContain("bulk lists")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})

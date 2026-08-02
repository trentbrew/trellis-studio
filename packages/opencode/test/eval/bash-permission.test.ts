/**
 * Eval: Bash Permission Extraction
 *
 * Validates that the bash tool correctly extracts file paths, redirects,
 * to ask for appropriate external_directory and bash pattern permissions.
 * Run standalone:  bun run test/eval/bash-permission.test.ts
 * Run as test:     bun test test/eval/bash-permission.test.ts
 */
import { afterEach, describe, test } from "bun:test"
import path from "path"
import os from "os"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"
import { runEval, assertAllPassed, type Scenario } from "./runner"
import { SessionID, MessageID } from "../../src/session/schema"
import type { Permission } from "../../src/permission"

Log.init({ print: false })

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

async function assertPermissions(
  commands: string[],
  check: (requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">>) => void,
): Promise<void> {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const bash = await BashTool.init()
      const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
      const testCtx = {
        ...baseCtx,
        ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
          requests.push(req)
        },
      }
      for (const command of commands) {
        await bash.execute({ command, description: "eval test" }, testCtx)
      }
      check(requests)
    },
  })
}

async function scenarios(): Promise<Scenario[]> {
  return [
    {
      name: "extract redirect out path",
      async run() {
        const outDir = os.tmpdir()
        const outFile = path.join(outDir, "eval-out.txt")
        await assertPermissions([`cat src/index.ts > ${outFile}`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir))) throw new Error(`expected pattern with ${outDir}, got: ${ext.patterns.join(", ")}`)
        })
      },
    },
    {
      name: "extract append redirect path",
      async run() {
        const outDir = os.tmpdir()
        const outFile = path.join(outDir, "eval-append.txt")
        await assertPermissions([`echo 'log' >> ${outFile}`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir))) throw new Error(`expected pattern with ${outDir}, got: ${ext.patterns.join(", ")}`)
        })
      },
    },
    {
      name: "extract stderr redirect path",
      async run() {
        const outDir = os.tmpdir()
        const outFile = path.join(outDir, "eval-err.log")
        await assertPermissions([`node script.js 2> ${outFile}`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir))) throw new Error(`expected pattern with ${outDir}, got: ${ext.patterns.join(", ")}`)
        })
      },
    },
    {
      name: "extract multiple redirects",
      async run() {
        const outDir1 = path.join(os.tmpdir(), "log1")
        const outDir2 = path.join(os.tmpdir(), "log2")
        const cmd = `cmd > ${path.join(outDir1, "out")} 2> ${path.join(outDir2, "err")}`
        await assertPermissions([cmd], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir1))) throw new Error("missing outDir1")
          if (!ext.patterns.some((p: string) => p.includes(outDir2))) throw new Error("missing outDir2")
        })
      },
    },
    {
      name: "piped commands extract permissions for all parts",
      async run() {
        await assertPermissions([`echo "hello" | cat > ${path.join(os.tmpdir(), "out.log")}`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(os.tmpdir()))) throw new Error("missing temp dir")
          
          const bash = reqs.find((r) => r.permission === "bash")
          if (!bash) throw new Error("bash permission not asked")
        })
      },
    },
    {
      name: "quoted redirect paths",
      async run() {
        const outDir = os.tmpdir()
        const outFile = path.join(outDir, "eval-quoted.txt")
        await assertPermissions([`echo 'data' > "${outFile}"`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir))) throw new Error("missing outDir")
        })
      },
    },
    {
      name: "extracts built-in file manipulation commands outside project",
      async run() {
        const outDir = os.tmpdir()
        const outFile = path.join(outDir, "eval-chmod.txt")
        await Bun.write(outFile, "test")
        await assertPermissions([`chmod +x ${outFile}`], (reqs) => {
          const ext = reqs.find((r) => r.permission === "external_directory")
          if (!ext) throw new Error("external_directory permission not asked")
          if (!ext.patterns.some((p: string) => p.includes(outDir))) throw new Error("missing outDir")
        })
      },
    }
  ]
}

// ─── bun:test integration ────────────────────────────────────────────────────

afterEach(async () => {
  await Instance.disposeAll()
})

describe("eval: bash permission extraction", () => {
  test("all scenarios pass", async () => {
    const s = await scenarios()
    const results = await runEval("Bash Permission Extraction", s)
    assertAllPassed(results)
  })
})

// ─── standalone ───────────────────────────────────────────────────────────────

if (import.meta.main) {
  const s = await scenarios()
  const results = await runEval("Bash Permission Extraction", s)
  const failed = results.filter((r) => !r.passed && !r.skipped)
  process.exit(failed.length > 0 ? 1 : 0)
}

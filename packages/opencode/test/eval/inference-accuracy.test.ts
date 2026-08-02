/**
 * Eval: Service Inference Accuracy
 *
 * Validates that infer() correctly identifies service types, commands,
 * and ports across diverse project structures.
 * Run standalone:  bun run test/eval/inference-accuracy.ts
 * Run as test:     bun test test/eval/inference-accuracy.ts
 */
import { afterEach, describe, test } from "bun:test"
import { rm } from "fs/promises"
import path from "path"
import { infer } from "../../src/preview/infer"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"
import { runEval, assertAllPassed, type Scenario } from "./runner"

Log.init({ print: false })

type ServiceExpect = {
  name: string
  type: "web" | "api" | "terminal"
  port?: number
  command?: string
}

async function inferIn(
  files: Record<string, string>,
  check: (svcs: Awaited<ReturnType<typeof infer>>) => void,
): Promise<void> {
  await using tmp = await tmpdir({
    init: async (dir) => {
      for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel)
        await Bun.write(full, content)
      }
    },
  })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const svcs = await infer(tmp.path)
      check(svcs)
    },
  })
}

function find(svcs: ServiceExpect[], name: string): ServiceExpect {
  const s = svcs.find((x) => x.name === name)
  if (!s) throw new Error(`service "${name}" not found — got: ${svcs.map((x) => x.name).join(", ")}`)
  return s
}

async function scenarios(): Promise<Scenario[]> {
  return [
    {
      name: "package.json dev → client:web",
      async run() {
        await inferIn({ "package.json": JSON.stringify({ scripts: { dev: "vite" } }) }, (svcs) => {
          const s = find(svcs, "client")
          if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
          if (s.command !== "npm run dev") throw new Error(`wrong command: ${s.command}`)
        })
      },
    },
    {
      name: "package.json start → start:web",
      async run() {
        await inferIn({ "package.json": JSON.stringify({ scripts: { start: "node index.js" } }) }, (svcs) => {
          const s = find(svcs, "start")
          if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
        })
      },
    },
    {
      name: "package.json api → api:api",
      async run() {
        await inferIn(
          { "package.json": JSON.stringify({ scripts: { api: "node server.js" } }) },
          (svcs) => {
            const s = find(svcs, "api")
            if (s.type !== "api") throw new Error(`expected api, got ${s.type}`)
          },
        )
      },
    },
    {
      name: "package.json server → server:api",
      async run() {
        await inferIn(
          { "package.json": JSON.stringify({ scripts: { server: "node server.js" } }) },
          (svcs) => {
            const s = find(svcs, "server")
            if (s.type !== "api") throw new Error(`expected api, got ${s.type}`)
          },
        )
      },
    },
    {
      name: "package.json --port flag extracted",
      async run() {
        await inferIn(
          { "package.json": JSON.stringify({ scripts: { dev: "vite --port 5174" } }) },
          (svcs) => {
            const s = find(svcs, "client")
            if (s.port !== 5174) throw new Error(`expected port 5174, got ${s.port}`)
          },
        )
      },
    },
    {
      name: "package.json PORT=N extracted",
      async run() {
        await inferIn(
          { "package.json": JSON.stringify({ scripts: { dev: "PORT=4000 node server.js" } }) },
          (svcs) => {
            const s = find(svcs, "client")
            if (s.port !== 4000) throw new Error(`expected port 4000, got ${s.port}`)
          },
        )
      },
    },
    {
      name: ".env PORT=N → server:web with correct port",
      async run() {
        await inferIn({ ".env": "PORT=4321\n" }, (svcs) => {
          const s = find(svcs, "server")
          if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
          if (s.port !== 4321) throw new Error(`expected port 4321, got ${s.port}`)
        })
      },
    },
    {
      name: "vite.config.ts port extracted",
      async run() {
        await inferIn(
          { "vite.config.ts": "export default { server: { port: 5173 } }" },
          (svcs) => {
            const s = find(svcs, "client")
            if (s.port !== 5173) throw new Error(`expected 5173, got ${s.port}`)
            if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
          },
        )
      },
    },
    {
      name: "vite.config.js also detected",
      async run() {
        await inferIn(
          { "vite.config.js": "module.exports = { server: { port: 5174 } }" },
          (svcs) => {
            const s = find(svcs, "client")
            if (s.port !== 5174) throw new Error(`expected 5174, got ${s.port}`)
          },
        )
      },
    },
    {
      name: "next.config.js → client:web npm run dev",
      async run() {
        await inferIn({ "next.config.js": "module.exports = {}" }, (svcs) => {
          const s = find(svcs, "client")
          if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
          if (s.command !== "npm run dev") throw new Error(`wrong command: ${s.command}`)
        })
      },
    },
    {
      name: "static html fallback when no web script",
      async run() {
        await inferIn(
          {
            "package.json": JSON.stringify({ scripts: { lint: "echo ok" } }),
            "index.html": "<html><body>hi</body></html>",
          },
          (svcs) => {
            const s = find(svcs, "client")
            if (s.type !== "web") throw new Error(`expected web, got ${s.type}`)
            if (s.command !== "bun .trellis/_serve.js") throw new Error(`wrong command: ${s.command}`)
          },
        )
      },
    },
    {
      name: "static fallback skipped when web script exists",
      async run() {
        await inferIn(
          {
            "package.json": JSON.stringify({ scripts: { dev: "vite" } }),
            "index.html": "<html><body>hi</body></html>",
          },
          (svcs) => {
            const staticSvc = svcs.find((s) => s.command === "bun .trellis/_serve.js")
            if (staticSvc) throw new Error("static fallback should not fire when dev script exists")
          },
        )
      },
    },
    {
      name: "empty directory → no services",
      async run() {
        await inferIn({}, (svcs) => {
          if (svcs.length !== 0) throw new Error(`expected 0 services, got ${svcs.length}`)
        })
      },
    },
    {
      name: "deduplication — same port not inferred twice",
      async run() {
        await inferIn(
          {
            ".env": "PORT=3000\n",
            "package.json": JSON.stringify({ scripts: { dev: "vite --port 3000" } }),
          },
          (svcs) => {
            const ports = svcs.map((s) => s.port).filter(Boolean)
            const unique = new Set(ports)
            if (unique.size !== ports.length) throw new Error(`duplicate ports: ${ports.join(", ")}`)
          },
        )
      },
    },
    {
      name: "multi-service project — both web + api inferred",
      async run() {
        await inferIn(
          {
            "package.json": JSON.stringify({
              scripts: { dev: "vite --port 5173", api: "node api.js --port=3001" },
            }),
          },
          (svcs) => {
            const web = svcs.find((s) => s.type === "web")
            const api = svcs.find((s) => s.type === "api")
            if (!web) throw new Error("no web service")
            if (!api) throw new Error("no api service")
            if (web.port === api.port) throw new Error("web and api share a port")
          },
        )
      },
    },
  ]
}

// ─── bun:test integration ────────────────────────────────────────────────────

afterEach(async () => {
  await Instance.disposeAll()
  await rm(path.join(Global.Path.state, "preview"), { recursive: true, force: true }).catch(() => undefined)
})

describe("eval: inference accuracy", () => {
  test("all scenarios pass", async () => {
    const s = await scenarios()
    const results = await runEval("Inference Accuracy", s)
    assertAllPassed(results)
  })
})

// ─── standalone ───────────────────────────────────────────────────────────────

if (import.meta.main) {
  const s = await scenarios()
  const results = await runEval("Inference Accuracy", s)
  const failed = results.filter((r) => !r.passed && !r.skipped)
  process.exit(failed.length > 0 ? 1 : 0)
}

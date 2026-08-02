/**
 * Eval: Preview Lifecycle
 *
 * Scenario-based coverage of the preview service start/stop/error/recover cycle.
 * Run standalone:  bun run test/eval/preview-lifecycle.ts
 * Run as test:     bun test test/eval/preview-lifecycle.ts
 */
import { afterEach, describe, test } from "bun:test"
import { rm } from "fs/promises"
import path from "path"
import { createServer } from "net"
import { Preview } from "../../src/preview/manager"
import { assign, reserve } from "../../src/preview/port"
import { Filesystem } from "../../src/util/filesystem"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"
import { runEval, assertAllPassed, type Scenario } from "./runner"

Log.init({ print: false })

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("no addr")))
        return
      }
      const port = addr.port
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

function holdPort(port: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once("error", reject)
    srv.listen(port, "127.0.0.1", () => resolve(() => srv.close()))
  })
}

async function scenarios(): Promise<Scenario[]> {
  return [
    {
      name: "show external URL → status running",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            await Preview.show("ext", { url: "http://localhost:9001", type: "web" })
            const info = await Preview.status("ext")
            if (info?.status !== "running") throw new Error(`expected running, got ${info?.status}`)
            if (info.url !== "http://localhost:9001") throw new Error(`wrong url: ${info.url}`)
          },
        })
      },
    },
    {
      name: "show different URLs isolated per directory",
      async run() {
        await using a = await tmpdir()
        await using b = await tmpdir()
        await Instance.provide({
          directory: a.path,
          fn: () => Preview.show("svc", { url: "http://localhost:1111", type: "web" }),
        })
        await Instance.provide({
          directory: b.path,
          fn: async () => {
            const info = await Preview.status("svc")
            if (info !== undefined) throw new Error("leaked across directories")
          },
        })
      },
    },
    {
      name: "stop cleans up service",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            await Preview.show("svc", { url: "http://localhost:9002", type: "web" })
            await Preview.stop("svc")
            const info = await Preview.status("svc")
            if (info !== undefined) throw new Error(`expected undefined after stop, got ${info?.status}`)
          },
        })
      },
    },
    {
      name: "stop non-existent service → no error",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: () => Preview.stop("ghost"),
        })
      },
    },
    {
      name: "stop resolves < 500ms (no PTY)",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            await Preview.show("fast", { url: "http://localhost:9003", type: "web" })
            const t = Date.now()
            await Preview.stop("fast")
            const ms = Date.now() - t
            if (ms >= 500) throw new Error(`stop took ${ms}ms`)
          },
        })
      },
    },
    {
      name: "port conflict → error status returned",
      async run() {
        await using owner = await tmpdir()
        await using other = await tmpdir()
        const port = await freePort()
        await reserve({ directory: owner.path, name: "app", port })
        await Instance.provide({
          directory: other.path,
          fn: async () => {
            const cfg = path.join(other.path, ".trellis", "preview.json")
            await Bun.write(cfg, JSON.stringify({ services: { app: { port, type: "web", command: "echo ok" } } }))
            const info = await Preview.start("app")
            if (info?.status !== "error") throw new Error(`expected error, got ${info?.status}`)
            if (!info.error?.includes(String(port))) throw new Error(`error missing port: ${info.error}`)
          },
        })
      },
    },
    {
      name: "port in use by OS process → error status",
      async run() {
        await using tmp = await tmpdir()
        const port = await freePort()
        const release = await holdPort(port)
        try {
          await Instance.provide({
            directory: tmp.path,
            fn: async () => {
              const cfg = path.join(tmp.path, ".trellis", "preview.json")
              await Bun.write(cfg, JSON.stringify({ services: { app: { port, type: "web", command: "echo ok" } } }))
              const info = await Preview.start("app")
              if (info?.status !== "error") throw new Error(`expected error, got ${info?.status}`)
            },
          })
        } finally {
          release()
        }
      },
    },
    {
      name: "list merges config + active services",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const cfg = path.join(tmp.path, ".trellis", "preview.json")
            await Bun.write(
              cfg,
              JSON.stringify({ services: { client: { port: 3000, type: "web", command: "npm run dev" } } }),
            )
            const list = await Preview.list()
            const svc = list.find((s) => s.name === "client")
            if (!svc) throw new Error("client not in list")
            if (svc.status !== "stopped") throw new Error(`expected stopped, got ${svc.status}`)
          },
        })
      },
    },
    {
      name: "start already-running service → idempotent",
      async run() {
        await using tmp = await tmpdir()
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            await Preview.show("idem", { url: "http://localhost:9004", type: "web" })
            // show again — should not duplicate
            await Preview.show("idem", { url: "http://localhost:9005", type: "web" })
            const list = await Preview.list()
            const dupes = list.filter((s) => s.name === "idem")
            if (dupes.length !== 1) throw new Error(`expected 1 entry, got ${dupes.length}`)
          },
        })
      },
    },
    {
      name: "static HTML project → scaffolds _serve.js + running",
      async run() {
        await using tmp = await tmpdir({
          init: async (dir) => {
            await Bun.write(path.join(dir, "index.html"), "<html><body>hello</body></html>")
          },
        })
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const port = await assign({ directory: tmp.path, name: "static" })
            await Preview.writeConfig("static", {
              port,
              type: "web",
              command: "bun .trellis/_serve.js",
              url: `http://localhost:${port}/index.html`,
            })
            const info = await Preview.start("static")
            if (info?.status !== "running") throw new Error(`expected running, got ${info?.status}`)
            const exists = await Filesystem.exists(path.join(tmp.path, ".trellis", "_serve.js"))
            if (!exists) throw new Error("_serve.js not scaffolded")
            await Preview.stop("static")
          },
        })
      },
    },
  ]
}

// ─── bun:test integration ────────────────────────────────────────────────────

afterEach(async () => {
  await Instance.disposeAll()
  await rm(path.join(Global.Path.state, "preview"), { recursive: true, force: true }).catch(() => undefined)
})

describe("eval: preview lifecycle", () => {
  test("all scenarios pass", async () => {
    const s = await scenarios()
    const results = await runEval("Preview Lifecycle", s)
    assertAllPassed(results)
  })
})

// ─── standalone ───────────────────────────────────────────────────────────────

if (import.meta.main) {
  const s = await scenarios()
  const results = await runEval("Preview Lifecycle", s)
  const failed = results.filter((r) => !r.passed && !r.skipped)
  process.exit(failed.length > 0 ? 1 : 0)
}

import { afterEach, expect, test } from "bun:test"
import { createServer } from "net"
import { rm } from "fs/promises"
import path from "path"
import { infer } from "../../src/preview/infer"
import { Preview } from "../../src/preview/manager"
import { assign, reserve } from "../../src/preview/port"
import { Instance } from "../../src/project/instance"
import { Global } from "../../src/global"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"
import { Log } from "../../src/util/log"

Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
  await rm(path.join(Global.Path.state, "preview"), { recursive: true, force: true }).catch(() => undefined)
})

async function free() {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("failed to determine free port")))
        return
      }
      const port = addr.port
      srv.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(port)
      })
    })
  })
}

test("preview services with the same name stay isolated per directory", async () => {
  await using one = await tmpdir()
  await using two = await tmpdir()

  await Instance.provide({
    directory: one.path,
    fn: async () => {
      await Preview.show("preview", { url: "http://localhost:11111", type: "web" })
      const info = await Preview.status("preview")
      expect(info?.url).toBe("http://localhost:11111")
    },
  })

  await Instance.provide({
    directory: two.path,
    fn: async () => {
      const before = await Preview.status("preview")
      expect(before).toBeUndefined()
      await Preview.show("preview", { url: "http://localhost:22222", type: "web" })
      const info = await Preview.status("preview")
      expect(info?.url).toBe("http://localhost:22222")
    },
  })

  await Instance.provide({
    directory: one.path,
    fn: async () => {
      const info = await Preview.status("preview")
      expect(info?.url).toBe("http://localhost:11111")
    },
  })
})

test("assign never reuses a reserved port across projects", async () => {
  await using one = await tmpdir()
  await using two = await tmpdir()

  const a = await assign({ directory: one.path, name: "client" })
  const b = await assign({ directory: two.path, name: "client" })

  expect(a).not.toBe(b)
})

test("reserve rejects an already reserved port from another project", async () => {
  await using one = await tmpdir()
  await using two = await tmpdir()

  const port = await free()
  const first = await reserve({ directory: one.path, name: "client", port })
  const second = await reserve({ directory: two.path, name: "client", port })

  expect(first.ok).toBe(true)
  expect(second.ok).toBe(false)
  if (second.ok) return
  expect(second.error).toContain(String(port))
  expect(second.error).toContain(one.path)
})

test("infer falls back to static html when package.json has no web script", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "package.json"), JSON.stringify({ scripts: { lint: "echo ok" } }))
      await Bun.write(path.join(dir, "pitch-deck.html"), "<html><body>hi</body></html>")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      expect(list).toHaveLength(1)
      expect(list[0]?.name).toBe("client")
      expect(list[0]?.type).toBe("web")
      expect(list[0]?.command).toBe("bun .trellis/_serve.js")
    },
  })
})

test("starting a configured static preview scaffolds the server script", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "pitch-deck.html"), "<html><body>deck</body></html>")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const port = await assign({ directory: tmp.path, name: "pitch-deck" })
      await Preview.writeConfig("pitch-deck", {
        port,
        type: "web",
        command: "bun .trellis/_serve.js",
        url: `http://localhost:${port}/pitch-deck.html`,
      })

      const info = await Preview.start("pitch-deck")
      expect(info?.status).toBe("running")
      expect(info?.url).toBe(`http://localhost:${port}/pitch-deck.html`)
      expect(await Filesystem.exists(path.join(tmp.path, ".trellis", "_serve.js"))).toBe(true)

      await Preview.stop("pitch-deck")
    },
  })
})

test("concurrent assign returns unique ports for distinct services", async () => {
  await using tmp = await tmpdir()
  const names = Array.from({ length: 10 }, (_, i) => `svc-${i}`)
  const ports = await Promise.all(names.map((name) => assign({ directory: tmp.path, name })))
  const unique = new Set(ports)
  expect(unique.size).toBe(names.length)
})

test("stop resolves quickly for a service with no pty", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await Preview.show("ephemeral", { url: "http://localhost:9999", type: "web" })
      const start = Date.now()
      await Preview.stop("ephemeral")
      expect(Date.now() - start).toBeLessThan(1000)
      expect(await Preview.status("ephemeral")).toBeUndefined()
    },
  })
})

test("start returns error status when port is reserved by another project", async () => {
  await using owner = await tmpdir()
  await using other = await tmpdir()

  const port = await free()
  await reserve({ directory: owner.path, name: "app", port })

  await Instance.provide({
    directory: other.path,
    fn: async () => {
      // Write config directly — bypasses writeConfig's own reserve check
      const cfg = path.join(other.path, ".trellis", "preview.json")
      await Bun.write(cfg, JSON.stringify({ services: { app: { port, type: "web", command: "echo ok" } } }))
      const info = await Preview.start("app")
      expect(info?.status).toBe("error")
      expect(info?.error).toContain(String(port))
    },
  })
})

test("infer detects PORT from .env", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, ".env"), "PORT=4321\n")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      const svc = list.find((s) => s.name === "server")
      expect(svc).toBeDefined()
      expect(svc?.port).toBe(4321)
      expect(svc?.type).toBe("web")
    },
  })
})

test("infer detects port from vite.config.ts", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "vite.config.ts"), "export default { server: { port: 5173 } }")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      const svc = list.find((s) => s.name === "client")
      expect(svc).toBeDefined()
      expect(svc?.port).toBe(5173)
      expect(svc?.type).toBe("web")
    },
  })
})

test("infer detects next.config.js as a web service", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "next.config.js"), "module.exports = {}")
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      const svc = list.find((s) => s.name === "client")
      expect(svc).toBeDefined()
      expect(svc?.type).toBe("web")
      expect(svc?.command).toBe("npm run dev")
    },
  })
})

test("infer detects api script from package.json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { api: "node server.js --port 8080" } }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      const svc = list.find((s) => s.name === "api")
      expect(svc).toBeDefined()
      expect(svc?.type).toBe("api")
      expect(svc?.port).toBe(8080)
    },
  })
})

test("infer deduplicates services with same port", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, ".env"), "PORT=3000\n")
      await Bun.write(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { dev: "vite --port 3000" } }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const list = await infer(tmp.path)
      const ports = list.map((s) => s.port)
      const unique = new Set(ports)
      expect(unique.size).toBe(ports.length)
    },
  })
})

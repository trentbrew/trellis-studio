import { existsSync } from "fs"
import path from "path"
import { Filesystem } from "@/util/filesystem"
import { hasHtml } from "./static"
import { assign } from "./port"

type Suggestion = {
  name: string
  port: number
  type: "web" | "api" | "terminal"
  command: string
}

export async function infer(dir: string): Promise<Suggestion[]> {
  const results: Suggestion[] = []
  const seen = new Set<number>()

  const add = (s: Suggestion) => {
    if (s.port && seen.has(s.port)) return
    if (s.port) seen.add(s.port)
    results.push(s)
  }

  await fromPackageJson(dir, add)
  await fromEnv(dir, add)
  await fromViteConfig(dir, add)
  await fromNextConfig(dir, add)
  if (!results.some((item) => item.type === "web")) await fromStaticHtml(dir, add)

  return results
}

async function fromPackageJson(dir: string, add: (s: Suggestion) => void) {
  const file = path.join(dir, "package.json")
  if (!existsSync(file)) return

  const pkg = await Filesystem.readJson<{
    scripts?: Record<string, string>
    name?: string
  }>(file).catch(() => null)
  if (!pkg?.scripts) return

  for (const [key, cmd] of Object.entries(pkg.scripts)) {
    if (!cmd) continue
    if (key === "dev" || key === "start" || key === "serve") {
      const name = key === "dev" ? "client" : key
      const port = extractPort(cmd) ?? (await assign({ directory: dir, name }))
      add({
        name,
        port,
        type: "web",
        command: `npm run ${key}`,
      })
    }
    if (key === "server" || key === "api") {
      const port = extractPort(cmd) ?? (await assign({ directory: dir, name: key }))
      add({
        name: key,
        port,
        type: "api",
        command: `npm run ${key}`,
      })
    }
  }
}

async function fromEnv(dir: string, add: (s: Suggestion) => void) {
  const file = path.join(dir, ".env")
  if (!existsSync(file)) return

  const text = await Bun.file(file)
    .text()
    .catch(() => "")
  const match = text.match(/^PORT\s*=\s*(\d+)/m)
  if (match) {
    const port = parseInt(match[1], 10)
    if (port > 0 && port < 65536) {
      add({ name: "server", port, type: "web", command: "npm run dev" })
    }
  }
}

async function fromViteConfig(dir: string, add: (s: Suggestion) => void) {
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mts"]) {
    const file = path.join(dir, name)
    if (!existsSync(file)) continue

    const text = await Bun.file(file)
      .text()
      .catch(() => "")
    const match = text.match(/port\s*:\s*(\d+)/)
    if (match) {
      const port = parseInt(match[1], 10)
      if (port > 0 && port < 65536) {
        add({ name: "client", port, type: "web", command: "npm run dev" })
      }
    }
    return
  }
}

async function fromNextConfig(dir: string, add: (s: Suggestion) => void) {
  for (const name of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    if (!existsSync(path.join(dir, name))) continue
    add({ name: "client", port: await assign({ directory: dir, name: "client" }), type: "web", command: "npm run dev" })
    return
  }
}

async function fromStaticHtml(dir: string, add: (s: Suggestion) => void) {
  if (!hasHtml(dir)) return
  const port = await assign({ directory: dir, name: "client" })
  add({ name: "client", port, type: "web", command: `bun .trellis/_serve.js` })
}

function extractPort(cmd: string): number | undefined {
  const patterns = [/--port[=\s]+(\d+)/, /-p[=\s]+(\d+)/, /PORT=(\d+)/]
  for (const pat of patterns) {
    const match = cmd.match(pat)
    if (match) {
      const port = parseInt(match[1], 10)
      if (port > 0 && port < 65536) return port
    }
  }
  return undefined
}

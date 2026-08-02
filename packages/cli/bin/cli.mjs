#!/usr/bin/env node

import { createServer, request as httpRequest } from "node:http"
import { createServer as netCreateServer } from "node:net"
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs"
import { join, extname, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { exec, spawn } from "node:child_process"
import { homedir } from "node:os"
import { createRequire } from "node:module"

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, "..", "assets")
const pkg = JSON.parse(readFileSync(join(__dir, "..", "package.json"), "utf-8"))
const require = createRequire(import.meta.url)

/**
 * Resolve the path to the platform-specific backend binary installed via
 * `optionalDependencies`. Returns null if no matching package is installed.
 *
 * Candidate order matches Bun's compile target naming:
 *   1. turtlecode-backend-<platform>-<arch>            (e.g. darwin-arm64)
 *   2. turtlecode-backend-<platform>-<arch>-<abi>      (linux musl)
 *   3. turtlecode-backend-<platform>-<arch>-baseline   (old x64 CPUs)
 */
function resolvePlatformBinary() {
  // Bun's compile targets use `windows` (not Node's `win32`) and `linux` with
  // optional `-musl` ABI suffix. We also publish `-baseline` variants for x64
  // CPUs that lack AVX2.
  const plat = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const ext = process.platform === "win32" ? ".exe" : ""
  const isMusl =
    process.platform === "linux" &&
    (() => {
      try {
        return require("node:child_process")
          .execSync("ldd --version 2>&1", { encoding: "utf8" })
          .toLowerCase()
          .includes("musl")
      } catch {
        return false
      }
    })()
  const base = `turtlecode-backend-${plat}-${arch}`
  const candidates = isMusl
    ? [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`]
    : [base, `${base}-baseline`]
  for (const name of candidates) {
    try {
      const pkgJson = require.resolve(`${name}/package.json`)
      const bin = join(dirname(pkgJson), "bin", `turtlecode-backend${ext}`)
      if (existsSync(bin)) return bin
    } catch {
      // optional dep not installed; try next
    }
  }
  // Also try the in-repo `platforms/` directory (for local dev without publish)
  const localPlatforms = join(__dir, "..", "platforms")
  for (const name of candidates) {
    const bin = join(localPlatforms, name, "bin", `turtlecode-backend${ext}`)
    if (existsSync(bin)) return bin
  }
  return null
}

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  turtlecode — AI-powered creative workspace

  Usage:
    npx turtlecode [dir] [options]

  Arguments:
    [dir]                    Directory to open as the workspace (default: current directory)

  Options:
    --port, -p <number>      Port to serve on (default: 3333)
    --backend, -b <url>      OpenCode backend URL (default: http://localhost:4096)
    --dir, -d <path>         Explicitly set the workspace directory (same as [dir])
    --new                    Open the new project prompt instead of the current directory
    --no-open                Don't auto-open the browser
    --tui                    Launch the terminal UI instead of the web interface
    --quiet-backend          Suppress backend stdout/stderr
    --help, -h               Show this help message
    --version, -v            Show version

  The backend is started automatically. Published builds of turtlecode
  include a native backend binary for your platform. If it's missing
  (e.g. running from a source checkout), the CLI falls back to a local
  turtlecode repo, then to a globally-installed \`opencode-ai\`.
`)
  process.exit(0)
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version)
  process.exit(0)
}

function flag(long, short) {
  const i = Math.max(args.indexOf(long), args.indexOf(short))
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined
}

// Resolve the workspace directory. Priority:
//   1. explicit --dir / -d flag
//   2. trailing positional <dir> argument
//   3. current working directory (default)
function resolveDir() {
  const d = flag("--dir", "-d")
  if (d) return resolve(d)

  // flags that consume the following token as a value
  const valueFlags = new Set(["--port", "-p", "--backend", "-b", "--dir", "-d"])
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (valueFlags.has(a)) {
      i++
      continue
    }
    if (a.startsWith("-")) continue
    return resolve(a)
  }
  return process.cwd()
}

let dir = resolveDir()
let actualPort = parseInt(flag("--port", "-p") || "3333", 10)
const open = !args.includes("--no-open")
const fresh = args.includes("--new")
const tui = args.includes("--tui")
let backend = new URL(flag("--backend", "-b") || process.env.OPENCODE_URL || "http://localhost:4096")

// URL-safe base64 encode (matches @opencode-ai/util/encode)
function encode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// Extract directory from base64-encoded path segment, returns { pathname, directory }
function extractDir(path) {
  const match = path.match(/^\/([A-Za-z0-9_-]{10,})(\/.*)?$/)
  if (!match) return { pathname: path }

  const encoded = match[1]
  const rest = match[2] || "/"

  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = Buffer.from(normalized, "base64").toString("utf-8")

    // Must be a valid absolute path with only printable ASCII
    if (!decoded.startsWith("/") || /[^\x20-\x7e]/.test(decoded)) return { pathname: path }

    return { pathname: rest, directory: decoded }
  } catch {
    return { pathname: path }
  }
}

function probe(origin) {
  return new Promise((ok) => {
    const req = httpRequest(origin, { method: "HEAD", timeout: 1000 }, (res) => {
      res.resume()
      ok(true)
    })
    req.on("error", () => ok(false))
    req.on("timeout", () => {
      req.destroy()
      ok(false)
    })
    req.end()
  })
}

function portInUse(port, host = "127.0.0.1") {
  return new Promise((ok) => {
    const srv = netCreateServer()
    srv.once("error", (err) => ok(err.code === "EADDRINUSE"))
    srv.once("listening", () => srv.close(() => ok(false)))
    srv.listen(port, host)
  })
}

async function findFreePort(start, span = 20) {
  for (let p = start; p < start + span; p++) {
    if (!(await portInUse(p))) return p
  }
  return null
}

function identifyPortHolder(port) {
  return new Promise((ok) => {
    const cmd =
      process.platform === "win32"
        ? `netstat -ano | findstr LISTENING | findstr :${port}`
        : `lsof -i :${port} -P -n -sTCP:LISTEN`
    exec(cmd, { timeout: 1500 }, (err, stdout) => {
      if (err || !stdout) return ok(null)
      const line = stdout
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
      if (!line) return ok(null)
      const parts = line.split(/\s+/)
      if (process.platform === "win32") {
        ok({ pid: parts[parts.length - 1], cmd: "(unknown)" })
      } else {
        // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
        ok({ pid: parts[1], cmd: parts[0] })
      }
    })
  })
}

function installOpencode() {
  return new Promise((resolve) => {
    console.log("\n  opencode-ai not found. Installing globally via npm...\n")
    const npm = spawn("npm", ["install", "-g", "opencode-ai"], {
      stdio: "inherit",
      env: { ...process.env },
    })
    npm.on("exit", (code) => resolve(code === 0))
    npm.on("error", () => resolve(false))
  })
}

async function boot(origin, retried = false) {
  if (await probe(origin)) return null

  const url = new URL(origin)
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    console.error(`\n  Error: Backend not reachable at ${origin}\n`)
    process.exit(1)
  }

  console.log(`  Starting backend on port ${url.port}...`)

  // Backend lookup priority:
  //   1. Platform-specific npm package (optionalDependencies) —
  //      `turtlecode-backend-<platform>-<arch>[-baseline]`
  //   2. Local turtlecode fork repo (dev workflow)
  //   3. Globally-installed `opencode` command (last resort; triggers auto-install on ENOENT)
  const platformBinary = resolvePlatformBinary()
  const hasBundled = platformBinary !== null

  const repoCandidates = [
    process.env.TURTLECODE_REPO,
    join(homedir(), ".turtlecode", "repo"),
    "/home/sprite/turtlecode",
  ].filter(Boolean)
  const repo = hasBundled
    ? null
    : repoCandidates.find((d) => existsSync(join(d, "packages", "opencode", "src", "index.ts")))

  let cmd
  let cmdArgs
  if (hasBundled) {
    cmd = platformBinary
    cmdArgs = ["serve", "--port", url.port]
  } else if (repo) {
    cmd = "bun"
    cmdArgs = [
      "run",
      "--conditions=browser",
      "--cwd",
      join(repo, "packages", "opencode"),
      "./src/index.ts",
      "serve",
      "--port",
      url.port,
    ]
  } else {
    cmd = "opencode"
    cmdArgs = ["serve", "--port", url.port]
  }

  const childEnv = { ...process.env }
  const bundledTemplates = join(root, "starter-templates", "projects")
  if (!childEnv.OPENCODE_PROJECT_TEMPLATE_DIR && existsSync(bundledTemplates)) {
    childEnv.OPENCODE_PROJECT_TEMPLATE_DIR = bundledTemplates
  }

  const child = spawn(cmd, cmdArgs, {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  })

  // Stream backend output so `Trellis init failed` and similar errors
  // surface to the terminal instead of being silently dropped.
  const showBackendLogs = !args.includes("--quiet-backend")
  if (showBackendLogs) {
    child.stdout?.on("data", (d) => process.stderr.write(`[backend] ${d}`))
    child.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`))
  }

  let exited = false
  let handled = false
  child.on("exit", (code) => {
    exited = true
    if (code && code !== 0) console.error(`\n  Backend exited with code ${code}`)
  })

  // Deferred so auto-install can race with the probe loop safely
  const errorPromise = new Promise((resolve) => {
    child.on("error", (err) => {
      handled = true
      resolve(err)
    })
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && !exited && !handled) {
    if (await probe(origin)) return child
    await new Promise((r) => setTimeout(r, 300))
  }

  if (handled) {
    const err = await errorPromise
    // Only auto-install when we were falling back to the global `opencode` command.
    const usingGlobalOpencode = !hasBundled && !repo
    if (err && err.code === "ENOENT" && usingGlobalOpencode && !retried) {
      const ok = await installOpencode()
      if (ok) return boot(origin, true)
      console.error(`\n  Error: Failed to install opencode-ai automatically.\n  Try manually: npm i -g opencode-ai\n`)
      process.exit(1)
    }
    console.error(`\n  Error: Could not start backend.\n  ${err?.message ?? "unknown error"}\n`)
    if (hasBundled) {
      console.error(
        `  Bundled binary failed to execute: ${platformBinary}\n  The binary may not match this platform (${process.platform}-${process.arch}).\n`,
      )
    } else if (!repo) {
      console.error(`  Install: npm i -g opencode-ai\n`)
    }
    process.exit(1)
  }

  if (!exited) child.kill()
  console.error("\n  Error: Backend failed to start within 60s.\n")
  process.exit(1)
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json",
}

if (!existsSync(join(root, "index.html"))) {
  console.error("\n  Error: No built assets found. Run `bun run build` in packages/cli first.\n")
  process.exit(1)
}

// Port-conflict pre-flight: if the requested backend port is bound by a
// non-Trellis process (probe failed but the socket is busy), fall back to the
// next free port instead of failing with EADDRINUSE. Skip for remote backends.
if ((backend.hostname === "localhost" || backend.hostname === "127.0.0.1") && !(await probe(backend.origin))) {
  const requested = parseInt(backend.port || "80", 10)
  if (await portInUse(requested)) {
    const holder = await identifyPortHolder(requested)
    const free = await findFreePort(requested + 1)
    if (!free) {
      console.error(`\n  Error: Port ${requested} is in use and no free port found within range.`)
      if (holder) console.error(`  Holder: pid ${holder.pid} (${holder.cmd})`)
      console.error(`  Free the port or pass --backend http://localhost:<port> with another port.\n`)
      process.exit(1)
    }
    const holderInfo = holder ? ` by pid ${holder.pid} (${holder.cmd})` : ""
    console.log(`  Port ${requested} is in use${holderInfo}; using ${free} instead.`)
    backend = new URL(`http://${backend.hostname}:${free}`)
  }
}

const spawned = await boot(backend.origin)

// TUI mode: launch opencode tui instead of web server
if (tui) {
  console.log(`
  🐢 turtlecode v${pkg.version}

  Backend:  ${backend.origin}
  Project:  ${fresh ? "New project" : dir}
  Starting TUI...
`)

  // Resolve opencode command using same priority as backend
  const platformBinary = resolvePlatformBinary()
  const hasBundled = platformBinary !== null

  const repoCandidates = [
    process.env.TURTLECODE_REPO,
    join(homedir(), ".turtlecode", "repo"),
    "/home/sprite/turtlecode",
  ].filter(Boolean)
  const repo = hasBundled
    ? null
    : repoCandidates.find((d) => existsSync(join(d, "packages", "opencode", "src", "index.ts")))

  let cmd
  let cmdArgs
  if (hasBundled) {
    cmd = platformBinary
    cmdArgs = ["tui", dir]
  } else if (repo) {
    cmd = "bun"
    cmdArgs = ["run", "--conditions=browser", "--cwd", join(repo, "packages", "opencode"), "./src/index.ts", "tui", dir]
  } else {
    cmd = "opencode"
    cmdArgs = ["tui", dir]
  }

  const childEnv = { ...process.env }
  const bundledTemplates = join(root, "starter-templates", "projects")
  if (!childEnv.OPENCODE_PROJECT_TEMPLATE_DIR && existsSync(bundledTemplates)) {
    childEnv.OPENCODE_PROJECT_TEMPLATE_DIR = bundledTemplates
  }

  const tuiChild = spawn(cmd, cmdArgs, {
    cwd: dir,
    stdio: "inherit",
    env: childEnv,
  })

  tuiChild.on("exit", (code) => {
    if (spawned) spawned.kill()
    process.exit(code ?? 0)
  })

  tuiChild.on("error", (err) => {
    console.error(`\n  Error: Failed to launch TUI.\n  ${err?.message ?? "unknown error"}\n`)
    if (hasBundled) {
      console.error(
        `  Bundled binary failed to execute: ${platformBinary}\n  The binary may not match this platform (${process.platform}-${process.arch}).\n`,
      )
    } else if (!repo) {
      console.error(`  Install: npm i -g opencode-ai\n`)
    }
    if (spawned) spawned.kill()
    process.exit(1)
  })

  // Keep process alive until TUI exits
  process.on("SIGINT", () => {
    tuiChild.kill("SIGINT")
  })
  process.on("SIGTERM", () => {
    tuiChild.kill("SIGTERM")
  })
}

// Ensure ~/.turtlecode exists for new project creation
const projectsDir = join(homedir(), ".turtlecode")
if (!existsSync(projectsDir)) {
  try {
    mkdirSync(projectsDir, { recursive: true })
  } catch {
    // Ignore errors (permissions, etc.) - backend will handle them
  }
}

// Determine whether a request should be proxied to the backend.
// Static assets are served directly; browser navigation gets the SPA
// index.html; everything else (API calls, SSE, etc.) is proxied.
function shouldProxy(req, file) {
  // Non-GET/HEAD methods are always API requests
  if (req.method !== "GET" && req.method !== "HEAD") return true

  // If the file exists as a static asset, serve it directly
  if (existsSync(file) && !statSync(file).isDirectory()) return false

  // GET requests that accept text/html are browser navigation → SPA fallback
  const accept = req.headers.accept || ""
  if (accept.includes("text/html")) return false

  // Everything else (JSON, SSE, etc.) → proxy
  return true
}

function proxy(req, res) {
  const url = new URL(req.url, `http://localhost:${actualPort}`)

  // Extract directory from base64 path segment; fall back to cwd for bare API calls
  const { pathname, directory } = extractDir(url.pathname)
  const headers = { ...req.headers, host: backend.host }
  delete headers.origin
  delete headers.referer
  headers["x-opencode-directory"] = directory || dir

  const target = `${backend.origin}${pathname}${url.search}`

  const proxyReq = httpRequest(target, { method: req.method, headers }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on("error", () => {
    if (res.headersSent) return res.end()
    res.writeHead(502, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: `Backend not reachable at ${backend.origin}. Start it with: opencode serve`,
      }),
    )
  })

  req.pipe(proxyReq)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${actualPort}`)
  const file = join(root, url.pathname === "/" ? "index.html" : url.pathname)

  if (shouldProxy(req, file)) return proxy(req, res)

  // Serve static file or SPA fallback
  const resolved = existsSync(file) && !statSync(file).isDirectory() ? file : join(root, "index.html")
  const ext = extname(resolved)
  const type = mime[ext] || "application/octet-stream"

  try {
    const body = readFileSync(resolved)
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    })
    res.end(body)
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not found")
  }
})

// Handle WebSocket upgrade (used by PTY terminal connections)
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${actualPort}`)

  // Extract directory from base64 path segment; fall back to cwd for bare API calls
  const { pathname, directory } = extractDir(url.pathname)
  const headers = { ...req.headers, host: backend.host }
  delete headers.origin
  delete headers.referer
  headers["x-opencode-directory"] = directory || dir

  const target = `${backend.origin}${pathname}${url.search}`
  const proxyReq = httpRequest(target, { method: "GET", headers })

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    )
    if (proxyHead.length) socket.write(proxyHead)
    proxySocket.pipe(socket)
    socket.pipe(proxySocket)
  })

  proxyReq.on("error", () => {
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
  })

  proxyReq.end()
})

function tryListen(p) {
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") resolve(false)
      else reject(err)
    })
    server.once("listening", () => resolve(true))
    server.listen(p)
  })
}

async function startServer() {
  const startPort = actualPort
  while (actualPort < 65535) {
    const ok = await tryListen(actualPort)
    if (ok) break
    if (actualPort === startPort) {
      console.log(`  Port ${actualPort} in use, trying ${actualPort + 1}...`)
    }
    actualPort++
  }

  const path = fresh ? "/" : `/${encode(dir)}`
  const url = `http://localhost:${actualPort}${path}`
  console.log(`
  🐢 turtlecode v${pkg.version}

  Local:    ${url}
  Backend:  ${backend.origin}
  Project:  ${fresh ? "New project" : dir}
  Press Ctrl+C to stop
`)

  if (open) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
    exec(`${cmd} ${url}`)
  }
}

startServer()

function cleanup() {
  if (spawned) spawned.kill()
  console.log("\n  Stopped.\n")
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

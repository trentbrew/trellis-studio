import { createServer } from "net"
import path from "path"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Flock } from "@/util/flock"
import { Log } from "../util/log"

const log = Log.create({ service: "preview.port" })

const MIN = 10000
const MAX = 60000
const STALE = 5 * 60_000

type Owner = {
  directory: string
  name: string
}

type Entry = Owner & {
  updated_at: string
}

type Registry = {
  ports: Record<string, Entry>
}

function random() {
  return MIN + Math.floor(Math.random() * (MAX - MIN))
}

function stateDir() {
  return path.join(Global.Path.state, "preview")
}

function lockDir() {
  return path.join(stateDir(), "locks")
}

function file() {
  return path.join(stateDir(), "ports.json")
}

function now() {
  return new Date().toISOString()
}

function fresh(entry: Entry) {
  const time = Date.parse(entry.updated_at)
  if (Number.isNaN(time)) return false
  return Date.now() - time < STALE
}

function normalize(input: Owner): Owner {
  return {
    directory: Filesystem.resolve(input.directory),
    name: input.name,
  }
}

function same(a: Owner, b: Owner) {
  return a.directory === b.directory && a.name === b.name
}

async function read(): Promise<Registry> {
  const target = file()
  if (!(await Filesystem.exists(target))) return { ports: {} }
  const data = await Filesystem.readJson<Registry>(target).catch(() => ({ ports: {} }))
  return data?.ports ? data : { ports: {} }
}

async function write(data: Registry) {
  await Filesystem.writeJson(file(), data)
}

async function configured(entry: Entry) {
  const target = path.join(entry.directory, ".trellis", "preview.json")
  if (!(await Filesystem.exists(target))) return
  const data = await Filesystem.readJson<{ services?: Record<string, { port?: number }> }>(target).catch(
    () => undefined,
  )
  return data?.services?.[entry.name]?.port
}

async function clean(data: Registry) {
  await Promise.all(
    Object.entries(data.ports).map(async ([port, entry]) => {
      const cfg = await configured(entry)
      if (cfg === Number(port)) return
      if (cfg === undefined && fresh(entry)) return
      delete data.ports[port]
    }),
  )
}

async function update<T>(fn: (data: Registry) => Promise<T>) {
  return Flock.withLock(
    "preview.port.registry",
    async () => {
      const data = await read()
      await clean(data)
      const result = await fn(data)
      await write(data)
      return result
    },
    { dir: lockDir() },
  )
}

function ownerPort(data: Registry, input: Owner) {
  const owner = normalize(input)
  const hit = Object.entries(data.ports).find(([, entry]) => same(entry, owner))
  if (!hit) return
  return Number(hit[0])
}

function conflict(data: Registry, port: number, input: Owner) {
  const owner = normalize(input)
  const entry = data.ports[String(port)]
  if (!entry) return
  if (same(entry, owner)) return
  return entry
}

function release(data: Registry, input: Owner) {
  const owner = normalize(input)
  for (const [port, entry] of Object.entries(data.ports)) {
    if (!same(entry, owner)) continue
    delete data.ports[port]
  }
}

function hold(data: Registry, port: number, input: Owner) {
  release(data, input)
  data.ports[String(port)] = {
    ...normalize(input),
    updated_at: now(),
  }
}

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once("error", () => resolve(false))
    srv.once("listening", () => {
      srv.close(() => resolve(true))
    })
    srv.listen(port, "127.0.0.1")
  })
}

export async function allocate(attempts = 20): Promise<number> {
  return update(async (data) => {
    for (let i = 0; i < attempts; i++) {
      const port = random()
      if (data.ports[String(port)]) continue
      if (!(await probe(port))) continue
      log.info("allocated port", { port })
      return port
    }
    throw new Error("failed to find available port")
  })
}

export async function available(port: number): Promise<boolean> {
  return update(async (data) => {
    if (data.ports[String(port)]) return false
    return probe(port)
  })
}

export async function assign(input: Owner & { preferred?: number; attempts?: number }): Promise<number> {
  const owner = normalize(input)
  const attempts = input.attempts ?? 20
  return update(async (data) => {
    const current = ownerPort(data, owner)
    if (current && (!input.preferred || input.preferred === current)) {
      hold(data, current, owner)
      log.info("reused reserved port", { port: current, directory: owner.directory, name: owner.name })
      return current
    }

    if (input.preferred && !conflict(data, input.preferred, owner) && (await probe(input.preferred))) {
      hold(data, input.preferred, owner)
      log.info("assigned preferred port", { port: input.preferred, directory: owner.directory, name: owner.name })
      return input.preferred
    }

    for (let i = 0; i < attempts; i++) {
      const port = random()
      if (conflict(data, port, owner)) continue
      if (!(await probe(port))) continue
      hold(data, port, owner)
      log.info("assigned reserved port", { port, directory: owner.directory, name: owner.name })
      return port
    }

    throw new Error("failed to assign unique preview port")
  })
}

export async function reserve(input: Owner & { port: number }) {
  const owner = normalize(input)
  return update(async (data) => {
    const hit = conflict(data, input.port, owner)
    if (hit) {
      return {
        ok: false as const,
        error: `Port ${input.port} is reserved by service \"${hit.name}\" in ${hit.directory}`,
      }
    }

    if (!(await probe(input.port))) {
      return {
        ok: false as const,
        error: `Port ${input.port} is already in use by another process`,
      }
    }

    hold(data, input.port, owner)
    log.info("reserved port", { port: input.port, directory: owner.directory, name: owner.name })
    return { ok: true as const }
  })
}

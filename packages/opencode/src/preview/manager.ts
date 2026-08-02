import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { GlobalBus } from "@/bus/global"
import { Instance } from "@/project/instance"
import { Pty } from "@/pty"
import { Filesystem } from "@/util/filesystem"
import z from "zod"
import path from "path"
import { Log } from "../util/log"
import type { PtyID } from "@/pty/schema"
import { assign, reserve } from "./port"
import { scaffold } from "./static"

export namespace Preview {
  const log = Log.create({ service: "preview" })

  export const Status = z.enum(["stopped", "starting", "running", "error"])
  export type Status = z.infer<typeof Status>

  export const ServiceConfig = z.object({
    port: z.number().optional(),
    type: z.enum(["web", "api", "terminal"]).default("web"),
    command: z.string(),
    url: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
  })
  export type ServiceConfig = z.infer<typeof ServiceConfig>

  export const ServiceInfo = z.object({
    name: z.string(),
    port: z.number().optional(),
    type: z.enum(["web", "api", "terminal"]),
    command: z.string(),
    url: z.string().optional(),
    status: Status,
    ptyId: z.string().optional(),
    pid: z.number().optional(),
    error: z.string().optional(),
  })
  export type ServiceInfo = z.infer<typeof ServiceInfo>

  export const ConsoleInput = z.object({
    level: z.string(),
    args: z.array(z.string()),
    timestamp: z.number().optional(),
    url: z.string().optional(),
    name: z.string().optional(),
  })
  export type ConsoleInput = z.infer<typeof ConsoleInput>

  export const ConsoleEntry = ConsoleInput.extend({
    id: z.number(),
    timestamp: z.number(),
  })
  export type ConsoleEntry = z.infer<typeof ConsoleEntry>

  export const Event = {
    Started: BusEvent.define("preview.started", z.object({ name: z.string(), info: ServiceInfo })),
    Stopped: BusEvent.define("preview.stopped", z.object({ name: z.string() })),
    Error: BusEvent.define("preview.error", z.object({ name: z.string(), error: z.string() })),
  }

  type Active = {
    name: string
    ptyId?: string
    port?: number
    type: "web" | "api" | "terminal"
    command: string
    url?: string
    status: Status
    pid?: number
    error?: string
  }

  const state = Instance.state(
    () => new Map<string, Active>(),
    async (map) => {
      await Promise.all(
        [...map.values()].map(async (svc) => {
          if (!svc.ptyId) return
          await Pty.remove(svc.ptyId as PtyID).catch(() => undefined)
        }),
      )
    },
  )

  const MAX_CONSOLE = 500
  const consoleState = Instance.state(() => ({ next: 0, entries: [] as ConsoleEntry[] }))

  function services() {
    return state()
  }

  function toInfo(svc: Active): ServiceInfo {
    return {
      name: svc.name,
      port: svc.port,
      type: svc.type,
      command: svc.command,
      url: svc.url ?? (svc.port ? `http://localhost:${svc.port}` : undefined),
      status: svc.status,
      ptyId: svc.ptyId,
      pid: svc.pid,
      error: svc.error,
    }
  }

  function configPath(): string {
    return path.join(Instance.directory, ".trellis", "preview.json")
  }

  async function cfg(): Promise<Record<string, ServiceConfig>> {
    const file = configPath()
    if (!(await Filesystem.exists(file))) return {}
    const text = await Filesystem.readText(file).catch(() => "{}")
    const data = JSON.parse(text) as { services?: Record<string, unknown> }
    const parsed = z.record(z.string(), ServiceConfig).safeParse(data.services)
    return parsed.success ? parsed.data : {}
  }

  function staticCmd(cmd: string) {
    return cmd === "bun .trellis/_serve.js"
  }

  function staticUrl(url: string | undefined, port: number) {
    if (!url) return `http://localhost:${port}`
    try {
      const next = new URL(url)
      next.port = String(port)
      return next.toString()
    } catch {
      return `http://localhost:${port}`
    }
  }

  async function prepare(name: string, svc: ServiceConfig): Promise<ServiceConfig> {
    if (svc.url && !svc.port) return svc
    if (svc.port) {
      const result = await reserve({ directory: Instance.directory, name, port: svc.port })
      if (!result.ok) throw new Error(result.error)
      return svc
    }
    return {
      ...svc,
      port: await assign({ directory: Instance.directory, name }),
    }
  }

  async function write(svcs: Record<string, ServiceConfig>) {
    const file = configPath()
    const existing = (await Filesystem.exists(file))
      ? (JSON.parse(await Filesystem.readText(file).catch(() => "{}")) as Record<string, unknown>)
      : {}
    const next = await Promise.all(
      Object.entries(svcs).map(async ([name, svc]) => [name, await prepare(name, svc)] as const),
    )
    const merged = {
      ...existing,
      services: {
        ...((existing.services ?? {}) as Record<string, unknown>),
        ...Object.fromEntries(next),
      },
    }
    await Filesystem.write(file, JSON.stringify(merged, null, 2))
    log.info("wrote preview config", { file, names: Object.keys(svcs) })
    return file
  }

  export async function writeConfig(name: string, svc: ServiceConfig): Promise<string> {
    return write({ [name]: svc })
  }

  export async function writeMany(services: Record<string, ServiceConfig>): Promise<string | undefined> {
    if (Object.keys(services).length === 0) return
    return write(services)
  }

  export async function show(
    name: string,
    input: { url: string; type?: "web" | "api" | "terminal"; command?: string },
  ) {
    if (services().has(name)) await stop(name)

    const svc: Active = {
      name,
      type: input.type ?? "web",
      command: input.command ?? input.url,
      url: input.url,
      status: "running",
    }

    services().set(name, svc)
    const info = toInfo(svc)
    void Bus.publish(Event.Started, { name, info })
    return info
  }

  GlobalBus.on("event", (evt) => {
    if (evt.payload?.type !== Pty.Event.Exited.type) return
    if (!evt.directory) return
    void Instance.provide({
      directory: evt.directory,
      fn: async () => {
        for (const [name, svc] of services()) {
          if (svc.ptyId !== evt.payload.properties.id) continue
          svc.status = "stopped"
          services().delete(name)
          GlobalBus.emit("event", {
            directory: evt.directory,
            payload: {
              type: Event.Stopped.type,
              properties: { name },
            },
          })
          log.info("preview service exited", { name, directory: evt.directory })
          break
        }
      },
    }).catch(() => undefined)
  })

  export async function list(): Promise<ServiceInfo[]> {
    const configured = await cfg()
    const result: ServiceInfo[] = []
    const seen = new Set<string>()

    for (const [name, c] of Object.entries(configured)) {
      seen.add(name)
      const active = services().get(name)
      if (active) {
        result.push(toInfo(active))
      } else {
        result.push({
          name,
          port: c.port,
          type: c.type ?? "web",
          command: c.command,
          url: c.url ?? (c.port ? `http://localhost:${c.port}` : undefined),
          status: "stopped",
        })
      }
    }

    for (const [name, svc] of services()) {
      if (seen.has(name)) continue
      result.push(toInfo(svc))
    }

    return result
  }

  export function appendConsole(input: ConsoleInput): ConsoleEntry {
    const state = consoleState()
    const entry: ConsoleEntry = {
      id: state.next,
      level: input.level,
      args: input.args,
      timestamp: input.timestamp ?? Date.now(),
      url: input.url,
      name: input.name,
    }
    state.next++
    state.entries.push(entry)
    if (state.entries.length > MAX_CONSOLE) state.entries.splice(0, state.entries.length - MAX_CONSOLE)
    return entry
  }

  export function listConsole(input: { level?: string; limit?: number; name?: string } = {}): ConsoleEntry[] {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), MAX_CONSOLE)
    return consoleState()
      .entries.filter(
        (entry) => (!input.level || entry.level === input.level) && (!input.name || entry.name === input.name),
      )
      .slice(-limit)
  }

  export function clearConsole() {
    const state = consoleState()
    state.entries = []
    state.next = 0
  }

  export async function start(name: string): Promise<ServiceInfo | undefined> {
    const configured = await cfg()
    let c = configured[name]
    if (!c) return undefined

    const existing = services().get(name)
    if (existing && existing.status === "running") return toInfo(existing)

    if (staticCmd(c.command)) {
      const result = await scaffold(Instance.directory, name, c.port)
      c = {
        ...c,
        port: result.port,
        command: result.command,
        url: staticUrl(c.url, result.port),
      }
      await writeConfig(name, c)
      configured[name] = c
    }

    if (c.port) {
      const result = await reserve({ directory: Instance.directory, name, port: c.port })
      if (!result.ok) {
        log.warn("port unavailable", { name, port: c.port, error: result.error })
        void Bus.publish(Event.Error, { name, error: result.error })
        return { name, port: c.port, type: c.type ?? "web", command: c.command, status: "error", error: result.error }
      }
    }

    log.info("starting preview service", { name, command: c.command })

    const parts = c.command.split(/\s+/)
    const cmd = parts[0]
    const args = parts.slice(1)
    const dir = c.cwd ? path.resolve(Instance.directory, c.cwd) : Instance.directory

    const pty = await Pty.create({
      command: cmd,
      args,
      cwd: dir,
      title: `preview:${name}`,
      env: {
        ...(c.port ? { PORT: c.port.toString() } : {}),
        ...(c.env as Record<string, string> | undefined),
      },
    })

    const svc: Active = {
      name,
      ptyId: pty.id,
      port: c.port,
      type: c.type ?? "web",
      command: c.command,
      url: c.url ?? (c.port ? `http://localhost:${c.port}` : undefined),
      status: "running",
      pid: pty.pid,
    }

    services().set(name, svc)
    const info = toInfo(svc)
    void Bus.publish(Event.Started, { name, info })
    return info
  }

  const STOP_TIMEOUT_MS = 5_000

  export async function stop(name: string): Promise<void> {
    const svc = services().get(name)
    if (!svc) return
    log.info("stopping preview service", { name })
    if (svc.ptyId) {
      await Promise.race([
        Pty.remove(svc.ptyId as PtyID),
        new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
      ])
    }
    services().delete(name)
    void Bus.publish(Event.Stopped, { name })
  }

  export async function status(name: string): Promise<ServiceInfo | undefined> {
    const active = services().get(name)
    if (active) return toInfo(active)

    const configured = await cfg()
    const c = configured[name]
    if (!c) return undefined

    return {
      name,
      port: c.port,
      type: c.type ?? "web",
      command: c.command,
      url: c.url ?? (c.port ? `http://localhost:${c.port}` : undefined),
      status: "stopped",
    }
  }
}

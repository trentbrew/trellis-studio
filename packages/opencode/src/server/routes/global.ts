import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import fs from "fs/promises"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { SyncEvent } from "@/sync"
import { GlobalBus } from "@/bus/global"
import { EventLog } from "@/bus/event-log"
import { AsyncQueue } from "@/util/queue"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import { ProjectTemplate } from "../../project/template"

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

type Frame = { id?: number; data: string }

async function streamEvents(
  c: Context,
  subscribe: (q: AsyncQueue<Frame | null>) => () => void,
  // Replay frames the client missed while disconnected, keyed off Last-Event-ID.
  replay?: (lastId: number) => Frame[],
) {
  return streamSSE(c, async (stream) => {
    const q = new AsyncQueue<Frame | null>()
    let done = false

    q.push({ data: JSON.stringify({ payload: { type: "server.connected", properties: {} } }) })

    // Send heartbeat every 10s to prevent stalled proxy streams.
    const heartbeat = setInterval(() => {
      q.push({ data: JSON.stringify({ payload: { type: "server.heartbeat", properties: {} } }) })
    }, 10_000)

    const stop = () => {
      if (done) return
      done = true
      clearInterval(heartbeat)
      unsub()
      q.push(null)
      log.info("global event disconnected")
    }

    // Replay must run synchronously before live subscription so no event slips
    // between the buffer snapshot and the live feed (EventEmitter is sync).
    if (replay) {
      const header = c.req.header("last-event-id")
      const lastId = header ? Number.parseInt(header, 10) : NaN
      if (Number.isFinite(lastId)) for (const frame of replay(lastId)) q.push(frame)
    }

    const unsub = subscribe(q)

    stream.onAbort(stop)

    try {
      for await (const frame of q) {
        if (frame === null) return
        await stream.writeSSE(frame.id !== undefined ? { id: String(frame.id), data: frame.data } : { data: frame.data })
      }
    } finally {
      stop()
    }
  })
}

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the OpenCode server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        const mem = process.memoryUsage()
        return c.json({
          healthy: true,
          version: Installation.VERSION,
          memory: {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
          },
        })
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the OpenCode system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamEvents(
          c,
          (q) => EventLog.subscribe((frame) => q.push(frame)),
          (lastId) => EventLog.since(lastId),
        )
      },
    )
    .get(
      "/sync-event",
      describeRoute({
        summary: "Subscribe to global sync events",
        description: "Get global sync events",
        operationId: "global.sync-event.subscribe",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      payload: SyncEvent.payloads(),
                    })
                    .meta({
                      ref: "SyncEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global sync event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamEvents(c, (q) => {
          return SyncEvent.subscribeAll(({ def, event }) => {
            // TODO: don't pass def, just pass the type (and it should
            // be versioned)
            q.push({
              data: JSON.stringify({
                payload: {
                  ...event,
                  type: SyncEvent.versionedType(def.type, def.version),
                },
              }),
            })
          })
        })
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get global configuration",
        description: "Retrieve the current global OpenCode configuration settings and preferences.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Get global config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/config",
      describeRoute({
        summary: "Update global configuration",
        description: "Update global OpenCode configuration settings and preferences.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Successfully updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const next = await Config.updateGlobal(config)
        return c.json(next)
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    )
    .post(
      "/upgrade",
      describeRoute({
        summary: "Upgrade opencode",
        description: "Upgrade opencode to the specified version or latest if not specified.",
        operationId: "global.upgrade",
        responses: {
          200: {
            description: "Upgrade result",
            content: {
              "application/json": {
                schema: resolver(
                  z.union([
                    z.object({
                      success: z.literal(true),
                      version: z.string(),
                    }),
                    z.object({
                      success: z.literal(false),
                      error: z.string(),
                    }),
                  ]),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          target: z.string().optional(),
        }),
      ),
      async (c) => {
        const method = await Installation.method()
        if (method === "unknown") {
          return c.json({ success: false, error: "Unknown installation method" }, 400)
        }
        const target = c.req.valid("json").target || (await Installation.latest(method))
        const result = await Installation.upgrade(method, target)
          .then(() => ({ success: true as const, version: target }))
          .catch((e) => ({ success: false as const, error: e instanceof Error ? e.message : String(e) }))
        if (result.success) {
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: Installation.Event.Updated.type,
              properties: { version: target },
            },
          })
          return c.json(result)
        }
        return c.json(result, 500)
      },
    )
    .get(
      "/templates",
      describeRoute({
        summary: "List project templates",
        description: "List available local starter templates for new projects.",
        operationId: "global.templates",
        responses: {
          200: {
            description: "Project templates",
            content: {
              "application/json": {
                schema: resolver(ProjectTemplate.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await ProjectTemplate.list())
      },
    )
    .post(
      "/template",
      describeRoute({
        summary: "Create project from template",
        description: "Materialize a starter template into a local project directory.",
        operationId: "global.template",
        responses: {
          200: {
            description: "Project created",
            content: {
              "application/json": {
                schema: resolver(ProjectTemplate.CreateResult),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ProjectTemplate.CreateInput),
      async (c) => {
        try {
          const result = await ProjectTemplate.create(c.req.valid("json"))
          return c.json(result)
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
        }
      },
    )
    .post(
      "/clone",
      describeRoute({
        summary: "Clone a git repository",
        description: "Clone a remote git repository into the specified directory.",
        operationId: "global.clone",
        responses: {
          200: {
            description: "Repository cloned",
            content: {
              "application/json": {
                schema: resolver(z.object({ path: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          url: z.string().min(1),
          dir: z.string().optional(),
        }),
      ),
      async (c) => {
        const { url, dir } = c.req.valid("json")
        const home = process.env.HOME || ""
        const base = dir || `${home}/.turtlecode`
        const name =
          url
            .split("/")
            .pop()
            ?.replace(/\.git$/, "") ?? "repo"
        const target = `${base}/${name}`
        await fs.mkdir(base, { recursive: true })
        const proc = Bun.spawn(["git", "clone", url, target], { stderr: "pipe" })
        await proc.exited
        if (proc.exitCode !== 0) {
          const err = await new Response(proc.stderr).text()
          return c.json({ error: err || "Clone failed" }, 400)
        }
        return c.json({ path: target })
      },
    )
    .post(
      "/mkdir",
      describeRoute({
        summary: "Create directory",
        description: "Create a directory at the specified absolute path, including any missing parent directories.",
        operationId: "global.mkdir",
        responses: {
          200: {
            description: "Directory created",
            content: {
              "application/json": {
                schema: resolver(z.object({ path: z.string() })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string().min(1),
        }),
      ),
      async (c) => {
        const target = c.req.valid("json").path
        await fs.mkdir(target, { recursive: true })
        return c.json({ path: target })
      },
    ),
)

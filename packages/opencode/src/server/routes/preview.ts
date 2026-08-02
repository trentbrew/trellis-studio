import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { Preview } from "../../preview/manager"
import { infer } from "../../preview/infer"
import { assign, available } from "../../preview/port"
import { Instance } from "../../project/instance"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { allowed as browseAllowed, injectBrowse } from "../../preview/browse"
import { CONSOLE_BRIDGE, injectBridge } from "../../preview/proxy"

export const PreviewRoutes = lazy(() =>
  new Hono()
    .get(
      "/services",
      describeRoute({
        summary: "List preview services",
        description: "Get all configured preview services and their current status.",
        operationId: "preview.services.list",
        responses: {
          200: {
            description: "List of preview services",
            content: {
              "application/json": {
                schema: resolver(z.array(Preview.ServiceInfo)),
              },
            },
          },
        },
      }),
      async (c) => {
        const services = await Preview.list()
        return c.json(services)
      },
    )
    .get(
      "/services/:name",
      describeRoute({
        summary: "Get preview service status",
        description: "Get the status of a specific preview service.",
        operationId: "preview.services.status",
        responses: {
          200: {
            description: "Service status",
            content: {
              "application/json": {
                schema: resolver(Preview.ServiceInfo),
              },
            },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const info = await Preview.status(name)
        if (!info) return c.json({ error: "Service not found" }, 404)
        return c.json(info)
      },
    )
    .get(
      "/console",
      describeRoute({
        summary: "List preview console messages",
        description: "Returns JavaScript console messages captured from IDE preview browser panes.",
        operationId: "preview.console.list",
        responses: {
          200: {
            description: "Captured preview console messages",
            content: {
              "application/json": {
                schema: resolver(z.array(Preview.ConsoleEntry)),
              },
            },
          },
        },
      }),
      async (c) => {
        const raw = Number(c.req.query("limit") ?? 100)
        const limit = Number.isFinite(raw) ? raw : 100
        const level = c.req.query("level")
        return c.json(
          Preview.listConsole({
            limit,
            level: level && level !== "all" ? level : undefined,
            name: c.req.query("name"),
          }),
        )
      },
    )
    .post(
      "/console",
      describeRoute({
        summary: "Record a preview console message",
        description: "Stores a JavaScript console message captured by the preview console bridge.",
        operationId: "preview.console.create",
        responses: {
          200: {
            description: "Stored preview console message",
            content: {
              "application/json": {
                schema: resolver(Preview.ConsoleEntry),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const parsed = Preview.ConsoleInput.safeParse(await c.req.json().catch(() => undefined))
        if (!parsed.success) return c.json({ error: "Invalid console entry" }, 400 as any)
        return c.json(Preview.appendConsole(parsed.data))
      },
    )
    .delete(
      "/console",
      describeRoute({
        summary: "Clear preview console messages",
        description: "Clears JavaScript console messages captured from IDE preview browser panes.",
        operationId: "preview.console.clear",
        responses: {
          200: {
            description: "Console messages cleared",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean() })),
              },
            },
          },
        },
      }),
      (c) => {
        Preview.clearConsole()
        return c.json({ ok: true })
      },
    )
    .post(
      "/services/:name/start",
      describeRoute({
        summary: "Start a preview service",
        description: "Start a configured preview service by name.",
        operationId: "preview.services.start",
        responses: {
          200: {
            description: "Service started",
            content: {
              "application/json": {
                schema: resolver(Preview.ServiceInfo),
              },
            },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const info = await Preview.start(name)
        if (!info) return c.json({ error: "Service not found" }, 404)
        return c.json(info)
      },
    )
    .post(
      "/services/:name/stop",
      describeRoute({
        summary: "Stop a preview service",
        description: "Stop a running preview service by name.",
        operationId: "preview.services.stop",
        responses: {
          200: {
            description: "Service stopped",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean() })),
              },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        await Preview.stop(name)
        return c.json({ ok: true })
      },
    )
    .post(
      "/infer",
      describeRoute({
        summary: "Infer preview services",
        description: "Scan project files to suggest preview service configurations.",
        operationId: "preview.infer",
        responses: {
          200: {
            description: "Inferred service suggestions",
            content: {
              "application/json": {
                schema: resolver(
                  z.array(
                    z.object({
                      name: z.string(),
                      port: z.number(),
                      type: z.enum(["web", "api", "terminal"]),
                      command: z.string(),
                    }),
                  ),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const dir = Instance.directory
        const suggestions = await infer(dir)
        return c.json(suggestions)
      },
    )
    .post(
      "/setup",
      describeRoute({
        summary: "Auto-configure preview services",
        description: "Infer preview services for the current project and persist them into the project config.",
        operationId: "preview.setup",
        responses: {
          200: {
            description: "Configured preview services",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    file: z.string().optional(),
                    services: z.array(Preview.ServiceInfo),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const dir = Instance.directory
        const suggestions = await infer(dir)
        const file = await Preview.writeMany(
          Object.fromEntries(
            suggestions.map((svc) => [
              svc.name,
              {
                port: svc.port,
                type: svc.type,
                command: svc.command,
              },
            ]),
          ),
        )
        const services = await Preview.list()
        return c.json({ file, services })
      },
    )
    .post(
      "/port/allocate",
      describeRoute({
        summary: "Allocate a random available port",
        description: "Returns a unique preview port reserved for the current project.",
        operationId: "preview.port.allocate",
        responses: {
          200: {
            description: "Allocated port",
            content: {
              "application/json": {
                schema: resolver(z.object({ port: z.number() })),
              },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.query("name") || "preview"
        const port = await assign({ directory: Instance.directory, name })
        return c.json({ port })
      },
    )
    .get(
      "/port/check/:port",
      describeRoute({
        summary: "Check if a port is available",
        description: "Returns whether a specific port is currently available.",
        operationId: "preview.port.check",
        responses: {
          200: {
            description: "Port availability",
            content: {
              "application/json": {
                schema: resolver(z.object({ port: z.number(), available: z.boolean() })),
              },
            },
          },
        },
      }),
      async (c) => {
        const port = parseInt(c.req.param("port"), 10)
        const free = await available(port)
        return c.json({ port, available: free })
      },
    )
    .get(
      "/browse",
      describeRoute({
        summary: "Browse an external URL inside the IDE browser",
        description:
          "Fetches public HTML and rewrites it for embedded browsing when sites block direct iframe embedding.",
        operationId: "preview.browse",
        responses: {
          200: { description: "Proxied HTML suitable for embedded browsing" },
          ...errors(400, 502),
        },
      }),
      async (c) => {
        const raw = c.req.query("url")
        if (!raw) return c.json({ error: "Missing URL" }, 400 as any)

        const target = browseAllowed(raw)
        if (!target) return c.json({ error: "Invalid or blocked URL" }, 400 as any)

        const res = await fetch(target.href, {
          redirect: "follow",
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; TrellisStudio/1.0; +https://trellis.computer) AppleWebKit/537.36 (KHTML, like Gecko)",
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
        }).catch(() => null)
        if (!res || !res.ok) return c.json({ error: "Failed to fetch URL" }, 502 as any)

        const ct = res.headers.get("content-type") ?? ""
        if (!ct.includes("text/html")) {
          return new Response(res.body as any, {
            status: res.status,
            headers: { "content-type": ct || "application/octet-stream" },
          })
        }

        const html = await res.text()
        return c.html(injectBrowse(html, target))
      },
    )
    .get(
      "/proxy-url",
      describeRoute({
        summary: "Proxy a local preview URL with console bridge",
        description:
          "Fetches local preview HTML and injects a console bridge script that forwards console output via postMessage.",
        operationId: "preview.proxyUrl",
        responses: {
          200: { description: "Proxied local HTML with console bridge injected" },
          ...errors(400),
        },
      }),
      async (c) => {
        const raw = c.req.query("url")
        if (!raw) return c.json({ error: "Missing URL" }, 400 as any)
        if (!URL.canParse(raw)) return c.json({ error: "Invalid proxy URL" }, 400 as any)

        const target = new URL(raw)
        const hosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]
        if (!["http:", "https:"].includes(target.protocol)) return c.json({ error: "Invalid proxy URL" }, 400 as any)
        if (!hosts.includes(target.hostname) && !target.hostname.endsWith(".local")) {
          return c.json({ error: "Proxy URL must be local" }, 400 as any)
        }

        const res = await fetch(target.href).catch(() => null)
        if (!res || !res.ok) return c.json({ error: "Failed to reach preview service" }, 502 as any)

        const ct = res.headers.get("content-type") ?? ""
        if (!ct.includes("text/html")) {
          return new Response(res.body as any, {
            status: res.status,
            headers: { "content-type": ct },
          })
        }

        const html = await res.text()
        const base = `<base href="${target.href.replace(/"/g, "%22")}">`
        const script = `<script>${CONSOLE_BRIDGE}</script>`
        return c.html(injectBridge(html, base, script))
      },
    )
    .get(
      "/proxy/:name",
      describeRoute({
        summary: "Proxy preview HTML with console bridge",
        description:
          "Fetches the root HTML from a running preview service and injects a console bridge script that forwards console output via postMessage.",
        operationId: "preview.proxy",
        responses: {
          200: { description: "Proxied HTML with console bridge injected" },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const info = await Preview.status(name)
        if (!info?.url) return c.json({ error: "Service not found or has no URL" }, 404)

        const root = new URL(info.url)
        const path = c.req.query("path") ?? ""
        const target = path ? new URL(path, root) : root
        if (target.origin !== root.origin) return c.json({ error: "Invalid proxy path" }, 400 as any)

        const res = await fetch(target.href).catch(() => null)
        if (!res || !res.ok) return c.json({ error: "Failed to reach preview service" }, 502 as any)

        const ct = res.headers.get("content-type") ?? ""
        if (!ct.includes("text/html")) {
          return new Response(res.body as any, {
            status: res.status,
            headers: { "content-type": ct },
          })
        }

        const raw = await res.text()
        const base = `<base href="${target.href.replace(/"/g, "%22")}">`
        const script = `<script>${CONSOLE_BRIDGE}</script>`
        return c.html(injectBridge(raw, base, script))
      },
    ),
)

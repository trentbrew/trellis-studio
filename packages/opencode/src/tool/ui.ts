import z from "zod"
import path from "path"
import { existsSync } from "fs"
import { Tool } from "./tool"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Preview } from "@/preview/manager"
import { check, format } from "@/preview/health"
import { scaffold } from "@/preview/static"

function resolveLocal(url: string): string | undefined {
  if (url.startsWith("file://")) {
    const stripped = url.replace(/^file:\/\//, "")
    if (existsSync(stripped)) return stripped
    return undefined
  }
  if (url.startsWith("/") && !url.startsWith("//")) {
    if (existsSync(url)) return url
    return undefined
  }
  return undefined
}

export const UIEvent = {
  Navigate: BusEvent.define(
    "ui.navigate",
    z.object({
      sessionID: z.string(),
      tab: z.string().optional(),
      filePath: z.string().optional(),
      preview: z
        .object({
          name: z.string(),
          url: z.string(),
        })
        .optional(),
      cms: z
        .object({
          collection: z.string().optional(),
          entry: z.string().optional(),
        })
        .optional(),
    }),
  ),
}

export const PreviewTool = Tool.define("preview", {
  description:
    "Opens a URL in the IDE's built-in browser route. " +
    "Use this whenever the user wants to preview a web page, local server, or HTML file inside the IDE browser. " +
    "For local HTML projects, pass the absolute file path (e.g. /path/to/index.html) " +
    "and a local HTTP server will be started automatically with hot-reload. " +
    "For remote URLs, pass the full http:// or https:// URL. " +
    "Do NOT pass file:// URLs — use plain file paths for local files instead.",
  parameters: z.object({
    url: z.string().describe("The URL (http/https) or absolute file path to preview"),
    name: z.string().optional().describe("Name for the preview tab (default: 'preview')"),
  }),
  async execute(args, ctx) {
    const name = args.name ?? "preview"
    let url = args.url

    const local = resolveLocal(url)
    if (local) {
      const existing = await Preview.status(name)
      if (existing && existing.status === "running" && existing.url) {
        url = existing.url
        const health = await check(existing)
        if (!health.ok) {
          return {
            title: "Preview not reachable",
            metadata: { name, url, ok: false, error: health.error },
            output: [
              format(health),
              "",
              "The app URL is not reachable. Fix the runtime issue or retry after the dev server finishes booting, then run `preview_status` before finishing.",
            ].join("\n"),
          }
        }
      } else {
        const root = path.dirname(local)
        const file = path.basename(local)
        const { port, command } = await scaffold(root, name)
        const isIndex = file === "index.html" || file === "index.htm"
        const svcUrl = isIndex ? `http://localhost:${port}` : `http://localhost:${port}/${file}`
        await Preview.writeConfig(name, { port, type: "web", command, url: svcUrl })
        const info = await Preview.start(name)
        url = info?.url ?? svcUrl
        if (info) {
          const health = await check(info)
          if (!health.ok) {
            return {
              title: "Preview not reachable",
              metadata: { name, url, ok: false, error: health.error },
              output: [
                format(health),
                "",
                "The app URL is not reachable. Fix the runtime issue or retry after the dev server finishes booting, then run `preview_status` before finishing.",
              ].join("\n"),
            }
          }
        }
      }
    } else {
      await Preview.show(name, { url, type: "web", command: url })
    }

    await Bus.publish(UIEvent.Navigate, {
      sessionID: ctx.sessionID,
      tab: "browser",
      preview: {
        name,
        url,
      },
    })
    return {
      title: `Browser: ${url}`,
      metadata: { name, url, ok: true, error: undefined },
      output: `Opened browser: ${url}`,
    }
  },
})

const refresh = z.object({
  name: z
    .string()
    .optional()
    .describe("Preview service name to refresh. Omit to refresh the first running web preview."),
  url: z.string().optional().describe("Explicit URL to refresh when no registered service should be used."),
})

export const PreviewRefreshTool = Tool.define<typeof refresh, Record<string, unknown>>("preview_refresh", {
  description: [
    "Refresh the IDE browser/preview pane for a running app.",
    "Use this after code changes, before checking `javascript_console`, and before finalizing web/UI work.",
    "After refreshing, run `preview_status` to confirm the app is healthy and reachable.",
  ].join("\n"),
  parameters: refresh,
  async execute(args, ctx) {
    const svc = args.name
      ? await Preview.status(args.name)
      : (await Preview.list()).find((item) => item.type === "web" && item.status === "running" && item.url)
    const name = args.name ?? svc?.name ?? "preview"
    const url = args.url ?? svc?.url ?? (svc?.port ? `http://localhost:${svc.port}` : undefined)
    if (!url) {
      return {
        title: "Preview refresh failed",
        metadata: { ok: false, name, error: "No preview URL available" },
        output: args.name
          ? `Preview service "${args.name}" has no URL to refresh.`
          : "No running web preview URL was found.",
      }
    }

    const health = svc ? await check(svc) : undefined
    await Bus.publish(UIEvent.Navigate, {
      sessionID: ctx.sessionID,
      tab: "browser",
      preview: { name, url },
    })
    return {
      title: `Preview refreshed: ${url}`,
      metadata: { ok: health?.ok ?? true, name, url, error: health?.error },
      output: health
        ? [`Refreshed "${name}" at ${url}.`, format(health), "Run `preview_status` before finishing."].join("\n")
        : `Refreshed "${name}" at ${url}. Run \`preview_status\` before finishing.`,
    }
  },
})

export const NavigateTool = Tool.define("navigate", {
  description:
    "Navigate the IDE to a specific tab or open a file in the code editor. " +
    "Use `tab` to switch top-level panels: home, plan, explore, files, code, browser, review, ship. " +
    "The 'preview' tab is deprecated for web previews; use 'browser' instead. " +
    "Use `file_path` to open a file in the editor. Both can be combined.",
  parameters: z.object({
    tab: z
      .enum(["home", "plan", "explore", "files", "code", "browser", "preview", "review", "ship", "cms", "graph"])
      .optional()
      .describe("Top-level IDE tab to switch to"),
    file_path: z.string().optional().describe("Absolute path of a file to open in the editor"),
  }),
  async execute(args, ctx) {
    const tab = args.tab === "preview" ? "browser" : args.tab
    await Bus.publish(UIEvent.Navigate, {
      sessionID: ctx.sessionID,
      tab,
      filePath: args.file_path,
    })
    const target = tab ?? args.file_path ?? "IDE"
    return {
      title: `Navigate: ${target}`,
      metadata: {},
      output: `Navigated to ${target}`,
    }
  },
})

import z from "zod"
import path from "path"
import { Tool } from "./tool"
import { Bus } from "@/bus"
import { UIEvent } from "./ui"
import { Preview } from "@/preview/manager"
import { check, format } from "@/preview/health"
import { infer } from "@/preview/infer"
import { Instance } from "@/project/instance"

const args = z.object({
  cwd: z
    .string()
    .optional()
    .describe("Subdirectory containing the app (relative to project root). Defaults to project root."),
  name: z.string().optional().describe("Service name. Defaults to the inferred or directory-derived name."),
  command: z
    .string()
    .optional()
    .describe("Override the dev command (e.g. 'pnpm dev'). Default: inferred from package.json scripts."),
  port: z.number().optional().describe("Override the port. Default: inferred from config or auto-assigned."),
})

function defaultName(dir: string): string {
  const base = path.basename(dir)
  return base.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "client"
}

export const PreviewAppTool = Tool.define<typeof args, Record<string, any>>("preview_app", {
  description: [
    "Start a dev server and open the IDE browser pane at its URL. Use this at the end of feature work to show the user what you built.",
    "",
    "Auto-detects the dev command and port by reading package.json scripts, .env, vite.config, and next.config.",
    "Pass `cwd` if the app lives in a subdirectory (e.g. 'blog-ui'). Pass `command` only if auto-detection picks the wrong script — for example to use `pnpm dev` instead of `npm run dev`.",
    "",
    "Prefer this over running `pnpm dev` / `npm run dev` directly via Bash — this tool registers the service with the IDE preview manager, opens the browser pane automatically, and surfaces the URL. Bash dev-server invocations leave the agent guessing about the port and the user staring at terminal output.",
  ].join("\n"),
  parameters: args,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "write",
      patterns: ["preview"],
      always: ["preview"],
      metadata: {},
    })

    const absDir = input.cwd ? path.resolve(Instance.directory, input.cwd) : Instance.directory
    const relCwd = path.relative(Instance.directory, absDir) || undefined

    const suggestions = await infer(absDir)
    const web = suggestions.find((s) => s.type === "web") ?? suggestions[0]

    const command = input.command ?? web?.command
    if (!command) {
      return {
        title: "No command",
        output: `Could not infer a dev command in ${absDir}. Pass \`command\` explicitly.`,
        metadata: {},
      }
    }
    const port = input.port ?? web?.port
    const name = input.name ?? web?.name ?? defaultName(absDir)

    await Preview.writeConfig(name, {
      port,
      type: "web",
      command,
      cwd: relCwd,
    })

    const info = await Preview.start(name)
    if (!info) {
      return { title: "Failed", output: `Could not start preview "${name}".`, metadata: {} }
    }
    if (info.status === "error") {
      return {
        title: "Failed",
        output: `Preview "${name}" failed to start: ${info.error ?? "unknown error"}`,
        metadata: { name, error: info.error },
      }
    }

    const url = info.url ?? (info.port ? `http://localhost:${info.port}` : undefined)
    if (!url) {
      return { title: "No URL", output: `Started "${name}" but no URL is available.`, metadata: { name } }
    }

    const health = await check(info)
    if (!health.ok) {
      return {
        title: "Preview not reachable",
        output: [
          format(health),
          "",
          "The preview process was registered, but the app URL is not reachable yet. Fix the runtime issue or retry after the dev server finishes booting, then run `preview_status` before finishing.",
        ].join("\n"),
        metadata: { name, url, ok: false, status: info.status, error: health.error },
      }
    }

    await Bus.publish(UIEvent.Navigate, {
      sessionID: ctx.sessionID,
      tab: "browser",
      preview: { name, url },
    })

    return {
      title: `Preview: ${url}`,
      output: `Started "${name}" at ${url}. Browser opened.\n${format(health)}`,
      metadata: { name, url, port: info.port, command, ok: true },
    }
  },
})

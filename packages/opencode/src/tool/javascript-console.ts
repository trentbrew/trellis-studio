import z from "zod"
import { Tool } from "./tool"
import { Preview } from "@/preview/manager"

const params = z.object({
  level: z.enum(["all", "error", "warn", "info", "debug", "log"]).optional().describe("Console level to read."),
  limit: z.number().min(1).max(200).optional().describe("Maximum number of entries to return."),
  name: z.string().optional().describe("Optional preview service/browser tab name to filter by."),
  clear: z.boolean().optional().describe("Clear captured entries after reading them."),
})

const time = (ts: number) => new Date(ts).toISOString()

const line = (entry: Preview.ConsoleEntry) =>
  [
    `[${time(entry.timestamp)}] ${entry.level.toUpperCase()}`,
    entry.name ? `(${entry.name})` : "",
    entry.url ?? "",
    entry.args.join(" "),
  ]
    .filter(Boolean)
    .join(" ")

export const JavaScriptConsoleTool = Tool.define<typeof params, Record<string, unknown>>("javascript_console", {
  description: [
    "Read JavaScript console output captured from the IDE preview/browser pane.",
    "Use this after opening a web app with `preview` or `preview_app`, especially before asking the user to check the page.",
    "It includes console.error, warnings, uncaught runtime errors, and unhandled promise rejections from pages where the preview bridge is active.",
  ].join("\n"),
  parameters: params,
  async execute(input) {
    const entries = Preview.listConsole({
      level: input.level && input.level !== "all" ? input.level : undefined,
      limit: input.limit ?? 50,
      name: input.name,
    })
    if (input.clear) Preview.clearConsole()
    if (entries.length === 0) {
      return {
        title: "JavaScript console",
        metadata: { count: 0 },
        output: "No captured JavaScript console entries.",
      }
    }
    return {
      title: "JavaScript console",
      metadata: {
        count: entries.length,
        errors: entries.filter((entry) => entry.level === "error").length,
        warnings: entries.filter((entry) => entry.level === "warn").length,
      },
      output: entries.map(line).join("\n"),
    }
  },
})

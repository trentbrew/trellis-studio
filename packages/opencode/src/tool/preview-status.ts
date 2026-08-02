import z from "zod"
import { Tool } from "./tool"
import { Preview } from "@/preview/manager"
import { check, format } from "@/preview/health"

const params = z.object({
  name: z.string().optional().describe("Preview service name to check. Omit to check all configured services."),
  expect: z.enum(["any", "stopped", "starting", "running", "error"]).optional().describe("Expected preview state."),
  start: z.boolean().optional().describe("Start stopped services before checking when expecting running."),
  timeout: z.number().min(250).max(30_000).optional().describe("HTTP reachability timeout in milliseconds."),
})

export const PreviewStatusTool = Tool.define<typeof params, Record<string, unknown>>("preview_status", {
  description: [
    "Check IDE preview/app runtime state and URL reachability.",
    "Use this before finishing web or UI work to confirm the app is actually running and reachable, not just that code changed.",
    "If the result is NOT OK, inspect the service status, restart or fix the app, then check again before claiming completion.",
  ].join("\n"),
  parameters: params,
  async execute(input) {
    const expected = input.expect ?? "running"
    const services = input.name ? [await Preview.status(input.name)].filter((x) => !!x) : await Preview.list()
    if (services.length === 0) {
      return {
        title: "Preview status",
        metadata: { ok: false, count: 0 },
        output: input.name ? `Preview service "${input.name}" was not found.` : "No preview services are configured.",
      }
    }

    const started = await Promise.all(
      services.map(async (svc) =>
        input.start && expected === "running" && svc.status !== "running" ? (await Preview.start(svc.name)) ?? svc : svc,
      ),
    )
    const health = await Promise.all(started.map((svc) => check(svc, expected, input.timeout)))
    const ok = health.every((item) => item.ok)
    return {
      title: ok ? "Preview status: OK" : "Preview status: NOT OK",
      metadata: {
        ok,
        count: health.length,
        running: health.filter((item) => item.service.status === "running").length,
        reachable: health.filter((item) => item.reachable).length,
      },
      output: health.map(format).join("\n"),
    }
  },
})

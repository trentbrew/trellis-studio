import z from "zod"
import { Tool } from "./tool"
import { Instance } from "@/project/instance"
import { listActiveProcesses, refreshListeners, startMonitor } from "@/workspace-process"

const params = z.object({
  refresh: z
    .boolean()
    .optional()
    .describe("Run a listener poll before returning results (default: true)."),
})

function format(processes: ReturnType<typeof listActiveProcesses>) {
  if (processes.length === 0) {
    return "No active TCP listeners are tracked for this workspace host."
  }

  const lines = processes.map((p) => {
    const cmd = p.command || "unknown"
    const pid = p.pid > 0 ? String(p.pid) : "?"
    return `  :${p.port}  pid=${pid}  ${cmd}`
  })

  return [`Active port-bound listeners (${processes.length}):`, ...lines].join("\n")
}

export const ListWorkspaceProcessesTool = Tool.define<typeof params, Record<string, unknown>>(
  "list_workspace_processes",
  {
    description: [
      "List long-lived TCP listeners (dev servers, watchers, tunnels) for the current workspace.",
      "Use before starting a dev server or binding a port to avoid conflicts (e.g. port 3000 already in use).",
      "Data comes from periodic lsof polls stored in the Trellis graph (ComputeHost / Process entities).",
    ].join("\n"),
    parameters: params,
    async execute(input) {
      startMonitor()
      if (input.refresh !== false) await refreshListeners()

      const processes = listActiveProcesses(Instance.directory)
      const ports = processes.map((p) => p.port)

      return {
        title: `Workspace listeners (${processes.length})`,
        metadata: {
          count: processes.length,
          ports,
        },
        output: format(processes),
      }
    },
  },
)

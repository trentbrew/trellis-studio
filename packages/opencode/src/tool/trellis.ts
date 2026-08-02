import z from "zod"
import { Tool } from "./tool"
import { Trellis } from "../trellis"

export const TrellisIssueTool = Tool.define("trellis_issue", {
  description:
    "Create a trellis issue for task tracking. Use this to break work into trackable units with acceptance criteria. Issues default to backlog status.",
  parameters: z.object({
    title: z.string().describe("Short issue title"),
    priority: z
      .enum(["critical", "high", "medium", "low"])
      .optional()
      .describe("Issue priority (default: medium)"),
    labels: z.array(z.string()).optional().describe("Labels for categorization"),
    description: z.string().optional().describe("Brief description of the task"),
    criteria: z
      .array(
        z.object({
          description: z.string().describe("Acceptance criterion description"),
          command: z.string().optional().describe("Optional test command to verify"),
        }),
      )
      .optional()
      .describe("Acceptance criteria for closing"),
  }),
  async execute(args) {
    const op = await Trellis.createIssue(args.title, {
      priority: args.priority,
      labels: args.labels,
      description: args.description,
      criteria: args.criteria,
    })
    if (!op) {
      return {
        title: "Issue creation failed",
        output: "Trellis is not initialized for this workspace.",
        metadata: {},
      }
    }
    const id = (op as any).vcs?.issueId ?? "unknown"
    return {
      title: `Created ${id}: ${args.title}`,
      output: `Created trellis issue ${id}: "${args.title}" [${args.priority ?? "medium"}]${args.labels?.length ? ` labels: ${args.labels.join(", ")}` : ""}${args.criteria?.length ? ` (${args.criteria.length} AC)` : ""}`,
      metadata: { id },
    }
  },
})

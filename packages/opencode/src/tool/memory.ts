import z from "zod"
import { Tool } from "./tool"
import { Memory } from "../trellis/memory"

const params = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("remember"),
    title: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(8000),
    scope: z.enum(["user", "project"]).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  }),
  z.object({
    action: z.literal("list"),
    scope: z.enum(["user", "project"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  z.object({
    action: z.literal("recall"),
    query: z.string().trim().min(1).max(500),
    scope: z.enum(["user", "project"]).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
])

export const MemoryTool = Tool.define<typeof params, Record<string, any>>("memory", {
  description: [
    "Persist durable facts about the user and project in the Trellis graph (type: memory).",
    "",
    "**remember** — Save a stable fact silently. Do not ask the user for permission.",
    "Call this when you learn:",
    "- User preferences (stack, style, workflow, naming)",
    "- Project conventions (architecture, patterns, ports, env)",
    "- Decisions that should survive future sessions",
    "",
    "Do NOT remember: ephemeral task progress, guesses, or information already in project-memory.",
    "",
    "**recall** — Semantically search stored memories by topic. Use when project-memory",
    "does not contain what you need (older facts, specific conventions, past decisions).",
    "",
    "**list** — Read stored memory entities chronologically (usually unnecessary; project-memory is injected automatically).",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "memory",
      patterns: ["trellis-memory"],
      always: ["trellis-memory"],
      metadata: { action: input.action },
    })

    if (input.action === "list") {
      const items = Memory.list({ limit: input.limit ?? 20, scope: input.scope })
      if (!items.length) return { title: "Memory", output: "No memory entities stored yet.", metadata: {} }
      const lines = items.map((item) => `${item.id}\n  ${item.title}: ${item.content}`)
      return {
        title: `${items.length} memories`,
        output: lines.join("\n\n"),
        metadata: { count: items.length },
      }
    }

    if (input.action === "recall") {
      const items = await Memory.recall(input.query, { limit: input.limit ?? 8, scope: input.scope })
      if (!items.length) {
        return {
          title: "Memory",
          output: `No memories matched "${input.query}".`,
          metadata: { count: 0 },
        }
      }
      const lines = items.map(
        (item) => `${item.id} (score ${item.score.toFixed(2)})\n  ${item.title}: ${item.content}`,
      )
      return {
        title: `${items.length} recalled`,
        output: lines.join("\n\n"),
        metadata: { count: items.length, query: input.query },
      }
    }

    const saved = Memory.remember({
      title: input.title,
      content: input.content,
      scope: input.scope,
      tags: input.tags,
      source: "agent",
      sessionID: ctx.sessionID,
    })
    if (!saved) return { title: "Error", output: "Trellis store not available.", metadata: {} }

    return {
      title: saved.title,
      output: `Remembered ${saved.id}: ${saved.content}`,
      metadata: saved,
    }
  },
})

import z from "zod"
import { Tool } from "./tool"
import { SchemaKit } from "./schema-kit"
import { Cron as Expr } from "../cron/expr"
import { Runner } from "../cron/runner"
import { Journal } from "../cron/journal"
import { CronJob, CRON_ACTIONS } from "../trellis/cron-job"

const action = SchemaKit.looseEnum(CRON_ACTIONS)
const bool = SchemaKit.boolishOptional
const schedule = z
  .string()
  .trim()
  .min(1)
  .refine((val) => Expr.valid(val), {
    message: "Expected a valid five-field cron expression, e.g. 0 9 * * *",
  })

const params = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
  }),
  z.object({
    action: z.literal("runs"),
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1),
    schedule,
    type: action.default("journal"),
    preset: z.string().trim().optional(),
    enabled: bool,
    command: z.string().optional(),
    cwd: z.string().optional(),
    env: z.string().optional(),
    prompt: z.string().optional(),
    agent: z.string().optional(),
    journalDir: z.string().optional(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1),
    name: z.string().trim().optional(),
    schedule: schedule.optional(),
    type: action.optional(),
    preset: z.string().trim().optional(),
    enabled: bool,
    command: z.string().optional(),
    cwd: z.string().optional(),
    env: z.string().optional(),
    prompt: z.string().optional(),
    agent: z.string().optional(),
    journalDir: z.string().optional(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("run"),
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("journal"),
    journalDir: z.string().optional(),
  }),
  z.object({
    action: z.literal("journals"),
    journalDir: z.string().optional(),
  }),
])

function lines(jobs: CronJob.Item[]) {
  if (!jobs.length) return "No cron jobs."
  return jobs
    .map((job) => {
      const state = job.enabled ? "enabled" : "disabled"
      const next = job.nextRunAt ? ` next ${job.nextRunAt}` : ""
      const last = job.lastRunAt ? ` last ${job.lastStatus} at ${job.lastRunAt}` : ""
      return `${job.id}  ${state}  ${job.schedule}  [${job.action}] ${job.name}${next}${last}`
    })
    .join("\n")
}

export const CronTool = Tool.define<typeof params, Record<string, unknown>>("cron", {
  description: [
    "Create, manage, and run cron-style jobs stored in the Trellis graph (entity type: cron_job).",
    "Jobs run while the IDE/server is open. Missed schedules catch up at most once on boot.",
    "",
    "Actions:",
    "- list: show configured jobs",
    "- create/update/delete: manage jobs",
    "- run: run a job immediately",
    "- runs: show recent run history for a job",
    "- journal: create today's blank journal file with frontmatter",
    "- journals: list existing journal files in the journal directory",
    "",
    "Job types: shell, agent, journal. Schedules are standard five-field cron strings.",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "write",
      patterns: ["cron"],
      always: ["cron"],
      metadata: { action: input.action },
    })

    if (input.action === "list") {
      const jobs = CronJob.list()
      return { title: `${jobs.length} cron jobs`, output: lines(jobs), metadata: { count: jobs.length } }
    }

    if (input.action === "runs") {
      const runs = CronJob.runs(input.id)
      const output = runs.length
        ? runs
            .map((run) => `${run.ranAt}  ${run.status}  ${run.durationMs}ms${run.error ? `  ${run.error}` : ""}`)
            .join("\n")
        : "No runs."
      return { title: `${runs.length} runs`, output, metadata: { count: runs.length } }
    }

    if (input.action === "create") {
      const job = CronJob.create({
        name: input.name,
        schedule: input.schedule,
        action: input.type,
        preset: input.preset,
        enabled: input.enabled,
        command: input.command,
        cwd: input.cwd,
        env: input.env,
        prompt: input.prompt,
        agent: input.agent,
        journalDir: input.journalDir,
      })
      if (!job) return { title: "Cron unavailable", output: "Trellis store not available.", metadata: {} }
      return { title: `Created ${job.name}`, output: lines([job]), metadata: { id: job.id } }
    }

    if (input.action === "update") {
      const job = CronJob.update(input.id, {
        name: input.name,
        schedule: input.schedule,
        action: input.type,
        preset: input.preset,
        enabled: input.enabled,
        command: input.command,
        cwd: input.cwd,
        env: input.env,
        prompt: input.prompt,
        agent: input.agent,
        journalDir: input.journalDir,
      })
      if (!job) return { title: "Not found", output: `Cron job "${input.id}" not found.`, metadata: {} }
      return { title: `Updated ${job.name}`, output: lines([job]), metadata: { id: job.id } }
    }

    if (input.action === "delete") {
      const removed = CronJob.remove(input.id)
      if (!removed) return { title: "Not found", output: `Cron job "${input.id}" not found.`, metadata: {} }
      return { title: "Deleted cron job", output: `Deleted ${input.id}`, metadata: { id: input.id } }
    }

    if (input.action === "journal") {
      const res = await Journal.ensure({ dir: input.journalDir })
      return { title: res.created ? "Created journal" : "Journal exists", output: res.path, metadata: res }
    }

    if (input.action === "journals") {
      const dir = input.journalDir ?? "journal"
      const { File } = await import("../file")
      const files = await File.search({ query: dir })
      const journals = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f.split("/").pop() ?? ""))
      const output = journals.length ? journals.map((j) => `${j}`).join("\n") : "No journal entries found."
      return { title: `${journals.length} journal entries`, output, metadata: { count: journals.length } }
    }

    const job = CronJob.get(input.id)
    if (!job) return { title: "Not found", output: `Cron job "${input.id}" not found.`, metadata: {} }
    const res = await Runner.run(job, { reason: "manual" })
    return {
      title: `${res.run?.status ?? "ok"} ${job.name}`,
      output: res.run?.error || res.run?.output || "Run finished.",
      metadata: { id: job.id, run: res.run?.id },
    }
  },
})

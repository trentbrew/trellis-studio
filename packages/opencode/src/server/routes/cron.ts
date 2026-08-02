import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Cron as Expr } from "../../cron/expr"
import { Journal } from "../../cron/journal"
import { Runner } from "../../cron/runner"
import { CronJob, CRON_ACTIONS, CRON_STATUSES } from "../../trellis/cron-job"
import { lazy } from "../../util/lazy"
import { errors } from "../error"

const Job = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  schedule: z.string(),
  preset: z.string(),
  action: z.enum(CRON_ACTIONS),
  command: z.string(),
  cwd: z.string(),
  env: z.string(),
  prompt: z.string(),
  agent: z.string(),
  journalDir: z.string(),
  lastRunAt: z.string(),
  lastStatus: z.enum(CRON_STATUSES),
  lastError: z.string(),
  nextRunAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const Run = z.object({
  id: z.string(),
  jobId: z.string(),
  ranAt: z.string(),
  status: z.enum(["ok", "error"]),
  durationMs: z.number(),
  output: z.string(),
  error: z.string(),
})

const Input = z.object({
  name: z.string().trim().min(1),
  schedule: z.string().trim().min(1),
  action: z.enum(CRON_ACTIONS).default("journal"),
  preset: z.string().trim().optional(),
  enabled: z.boolean().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  env: z.string().optional(),
  prompt: z.string().optional(),
  agent: z.string().optional(),
  journalDir: z.string().optional(),
})

const Patch = Input.partial()

const JournalInput = z.object({
  journalDir: z.string().optional(),
})

function sync(job: CronJob.Item) {
  const next = Expr.next(job.schedule, new Date())
  return CronJob.update(job.id, { nextRunAt: next?.toISOString() ?? "" }) ?? job
}

function valid(expr: string) {
  return Expr.valid(expr)
}

export const CronRoutes = lazy(() =>
  new Hono()
    .get(
      "/jobs",
      describeRoute({
        summary: "List cron jobs",
        operationId: "cron.jobs.list",
        responses: {
          200: {
            description: "Cron jobs",
            content: { "application/json": { schema: resolver(z.array(Job)) } },
          },
        },
      }),
      (c) => c.json(CronJob.list()),
    )
    .post(
      "/jobs",
      describeRoute({
        summary: "Create cron job",
        operationId: "cron.jobs.create",
        responses: {
          200: {
            description: "Created cron job",
            content: { "application/json": { schema: resolver(Job) } },
          },
          ...errors(400),
        },
      }),
      validator("json", Input),
      (c) => {
        const input = c.req.valid("json")
        if (!valid(input.schedule)) return c.json({ error: "Invalid cron expression" }, 400 as any)
        const job = CronJob.create(input)
        if (!job) return c.json({ error: "Trellis store not available" }, 503 as any)
        return c.json(sync(job))
      },
    )
    .patch(
      "/jobs/:id",
      describeRoute({
        summary: "Update cron job",
        operationId: "cron.jobs.update",
        responses: {
          200: {
            description: "Updated cron job",
            content: { "application/json": { schema: resolver(Job) } },
          },
          ...errors(400),
          ...errors(404),
        },
      }),
      validator("json", Patch),
      (c) => {
        const input = c.req.valid("json")
        if (input.schedule && !valid(input.schedule)) return c.json({ error: "Invalid cron expression" }, 400 as any)
        const job = CronJob.update(c.req.param("id"), input)
        if (!job) return c.json({ error: "Cron job not found" }, 404 as any)
        return c.json(input.schedule ? sync(job) : job)
      },
    )
    .delete(
      "/jobs/:id",
      describeRoute({
        summary: "Delete cron job",
        operationId: "cron.jobs.delete",
        responses: {
          200: {
            description: "Deleted cron job",
            content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } },
          },
          ...errors(404),
        },
      }),
      (c) => {
        const removed = CronJob.remove(c.req.param("id"))
        if (!removed) return c.json({ error: "Cron job not found" }, 404 as any)
        return c.json({ ok: true })
      },
    )
    .get(
      "/jobs/:id/runs",
      describeRoute({
        summary: "List cron job runs",
        operationId: "cron.jobs.runs",
        responses: {
          200: {
            description: "Cron job runs",
            content: { "application/json": { schema: resolver(z.array(Run)) } },
          },
        },
      }),
      (c) => c.json(CronJob.runs(c.req.param("id"))),
    )
    .post(
      "/jobs/:id/run",
      describeRoute({
        summary: "Run cron job now",
        operationId: "cron.jobs.run",
        responses: {
          200: {
            description: "Cron run",
            content: { "application/json": { schema: resolver(Run.optional()) } },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const job = CronJob.get(c.req.param("id"))
        if (!job) return c.json({ error: "Cron job not found" }, 404 as any)
        const res = await Runner.run(job, { reason: "manual" })
        return c.json(res.run)
      },
    )
    .post(
      "/journal/today",
      describeRoute({
        summary: "Create today's journal entry",
        operationId: "cron.journal.today",
        responses: {
          200: {
            description: "Journal file",
            content: {
              "application/json": { schema: resolver(z.object({ path: z.string(), created: z.boolean() })) },
            },
          },
        },
      }),
      validator("json", JournalInput),
      async (c) => c.json(await Journal.ensure({ dir: c.req.valid("json").journalDir })),
    ),
)

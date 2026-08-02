import path from "node:path"
import z from "zod"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Instance } from "@/project/instance"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { CronJob } from "@/trellis/cron-job"
import { Journal } from "./journal"

export namespace Runner {
  const LIMIT = 4000
  const TIMEOUT = 2 * 60 * 1000

  export const Event = {
    Started: BusEvent.define(
      "cron.run.started",
      z.object({
        id: z.string(),
        jobId: z.string(),
        reason: z.string(),
      }),
    ),
    Finished: BusEvent.define(
      "cron.run.finished",
      z.object({
        id: z.string(),
        jobId: z.string(),
        reason: z.string(),
        status: z.enum(["ok", "error"]),
      }),
    ),
  }

  function msg(err: unknown) {
    if (err instanceof Error && err.message) return err.message
    return String(err)
  }

  function vars(raw: string) {
    if (!raw.trim()) return {}
    try {
      const data = JSON.parse(raw) as unknown
      if (!data || typeof data !== "object" || Array.isArray(data)) return {}
      return Object.fromEntries(
        Object.entries(data)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .map(([key, val]) => [key, val]),
      )
    } catch {
      return {}
    }
  }

  async function shell(job: CronJob.Item) {
    if (!job.command.trim()) throw new Error("Shell job has no command")
    const cwd = job.cwd.trim()
    const dir = cwd ? (path.isAbsolute(cwd) ? cwd : path.resolve(Instance.directory, cwd)) : Instance.directory
    const bin = process.env.SHELL || "/bin/sh"
    const proc = Bun.spawn({
      cmd: [bin, "-lc", job.command],
      cwd: dir,
      env: { ...process.env, ...vars(job.env) },
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("")
    const err = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("")
    const timer = setTimeout(() => proc.kill(), TIMEOUT)
    const code = await proc.exited.finally(() => clearTimeout(timer))
    const stdout = await out
    const stderr = await err
    const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
    if (code !== 0) throw new Error(text || `Command exited with ${code}`)
    return text || `Command exited with ${code}`
  }

  async function agent(job: CronJob.Item) {
    if (!job.prompt.trim()) throw new Error("Agent job has no prompt")
    const session = await Session.create({
      title: `Cron: ${job.name}`,
      permission: [],
    })
    await SessionPrompt.prompt({
      sessionID: session.id,
      agent: job.agent.trim() || undefined,
      parts: [{ type: "text", text: job.prompt }],
    })
    return `Started session ${session.id}`
  }

  async function journal(job: CronJob.Item) {
    const res = await Journal.ensure({ dir: job.journalDir })
    return `${res.created ? "Created" : "Found"} ${res.path}`
  }

  async function dispatch(job: CronJob.Item) {
    if (job.action === "journal") return journal(job)
    if (job.action === "agent") return agent(job)
    return shell(job)
  }

  export async function run(job: CronJob.Item, opts?: { reason?: string }) {
    const reason = opts?.reason ?? "schedule"
    const id = `cron_run:${crypto.randomUUID()}`
    const start = Date.now()
    CronJob.update(job.id, { lastStatus: "running", lastError: "" })
    await Bus.publish(Event.Started, { id, jobId: job.id, reason }).catch(() => undefined)

    const done = async (status: "ok" | "error", output: string, error = "") => {
      const run = CronJob.recordRun(
        {
          jobId: job.id,
          status,
          durationMs: Date.now() - start,
          output: output.slice(0, LIMIT),
          error: error.slice(0, LIMIT),
        },
        Instance.directory,
      )
      CronJob.update(job.id, {
        lastRunAt: new Date().toISOString(),
        lastStatus: status,
        lastError: error,
      })
      await Bus.publish(Event.Finished, { id: run?.id ?? id, jobId: job.id, reason, status }).catch(() => undefined)
      return { job: CronJob.get(job.id) ?? job, run }
    }

    try {
      return await done("ok", await dispatch(job))
    } catch (err) {
      return await done("error", "", msg(err))
    }
  }
}

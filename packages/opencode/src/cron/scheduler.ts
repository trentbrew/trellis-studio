import { Instance } from "@/project/instance"
import { CronJob } from "@/trellis/cron-job"
import { Cron } from "./expr"
import { Runner } from "./runner"

export namespace Scheduler {
  const active = new Set<string>()
  let timer: ReturnType<typeof setInterval> | undefined

  function date(raw: string | undefined, fallback: Date) {
    if (!raw) return fallback
    const next = new Date(raw)
    if (Number.isNaN(next.getTime())) return fallback
    return next
  }

  async function check(job: CronJob.Item, now: Date) {
    let next: Date | undefined
    try {
      next = Cron.next(job.schedule, date(job.lastRunAt || job.createdAt, now))
    } catch (err) {
      CronJob.update(job.id, {
        lastStatus: "error",
        lastError: err instanceof Error ? err.message : String(err),
        nextRunAt: "",
      })
      return
    }

    if (!next) {
      CronJob.update(job.id, { nextRunAt: "" })
      return
    }

    if (next.getTime() > now.getTime()) {
      if (job.nextRunAt !== next.toISOString()) CronJob.update(job.id, { nextRunAt: next.toISOString() })
      return
    }

    const key = `${Instance.directory}:${job.id}`
    if (active.has(key)) return
    active.add(key)
    try {
      await Runner.run(job, { reason: "schedule" })
      const after = Cron.next(job.schedule, now)
      CronJob.update(job.id, { nextRunAt: after?.toISOString() ?? "" })
    } finally {
      active.delete(key)
    }
  }

  async function tickDir(dir: string) {
    await Instance.provide({
      directory: dir,
      async fn() {
        const now = new Date()
        await Promise.all(CronJob.list().filter((job) => job.enabled).map((job) => check(job, now)))
      },
    })
  }

  async function tick() {
    await Promise.all(Instance.directories().map((dir) => tickDir(dir).catch(() => undefined)))
  }

  export function init() {
    if (timer) return
    timer = setInterval(() => void tick(), 30_000)
    void tick()
  }
}

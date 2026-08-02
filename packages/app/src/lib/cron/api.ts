import type { Fetcher } from "@/utils/server"

export type CronAction = "shell" | "agent" | "journal"
export type CronStatus = "idle" | "running" | "ok" | "error"

export type CronJob = {
  id: string
  name: string
  enabled: boolean
  schedule: string
  preset: string
  action: CronAction
  command: string
  cwd: string
  env: string
  prompt: string
  agent: string
  journalDir: string
  lastRunAt: string
  lastStatus: CronStatus
  lastError: string
  nextRunAt: string
  createdAt: string
  updatedAt: string
}

export type CronRun = {
  id: string
  jobId: string
  ranAt: string
  status: "ok" | "error"
  durationMs: number
  output: string
  error: string
}

export type CronInput = {
  name: string
  schedule: string
  action: CronAction
  preset?: string
  enabled?: boolean
  command?: string
  cwd?: string
  env?: string
  prompt?: string
  agent?: string
  journalDir?: string
}

async function readError(res: Response) {
  try {
    const body = (await res.json()) as { error?: string; reason?: string }
    return body.reason ?? body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

function url(base: string, dir: string, path: string) {
  const req = new URL(`/cron${path}`, base)
  req.searchParams.set("directory", dir)
  return req.toString()
}

export async function apiListCronJobs(run: Fetcher, base: string, dir: string): Promise<CronJob[]> {
  const res = await run(url(base, dir, "/jobs"))
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CronJob[]
}

export async function apiCreateCronJob(run: Fetcher, base: string, dir: string, input: CronInput): Promise<CronJob> {
  const res = await run(url(base, dir, "/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CronJob
}

export async function apiUpdateCronJob(
  run: Fetcher,
  base: string,
  dir: string,
  id: string,
  input: Partial<CronInput>,
): Promise<CronJob> {
  const res = await run(url(base, dir, `/jobs/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CronJob
}

export async function apiDeleteCronJob(run: Fetcher, base: string, dir: string, id: string) {
  const res = await run(url(base, dir, `/jobs/${encodeURIComponent(id)}`), { method: "DELETE" })
  if (!res.ok) throw new Error(await readError(res))
}

export async function apiListCronRuns(run: Fetcher, base: string, dir: string, id: string): Promise<CronRun[]> {
  const res = await run(url(base, dir, `/jobs/${encodeURIComponent(id)}/runs`))
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CronRun[]
}

export async function apiRunCronJob(run: Fetcher, base: string, dir: string, id: string): Promise<CronRun | undefined> {
  const res = await run(url(base, dir, `/jobs/${encodeURIComponent(id)}/run`), { method: "POST" })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as CronRun | undefined
}

export async function apiTodayJournal(
  run: Fetcher,
  base: string,
  dir: string,
  input?: { journalDir?: string },
): Promise<{ path: string; created: boolean }> {
  const res = await run(url(base, dir, "/journal/today"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as { path: string; created: boolean }
}

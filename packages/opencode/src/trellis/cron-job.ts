import { createHash, randomUUID } from "crypto"
import { Instance } from "../project/instance"
import { StoreSDK } from "./store-sdk"
import { Trellis } from "./index"

export const CRON_ACTIONS = ["shell", "agent", "journal"] as const
export type CronAction = (typeof CRON_ACTIONS)[number]

export const CRON_STATUSES = ["idle", "running", "ok", "error"] as const
export type CronStatus = (typeof CRON_STATUSES)[number]

/** Cap on how many run records to retain per job. */
const RUN_RETENTION = 50
/** Cap on captured output stored per run. */
const OUTPUT_LIMIT = 4000

export namespace CronJob {
  export type Item = {
    id: string
    name: string
    enabled: boolean
    /** Standard 5-field cron expression. */
    schedule: string
    /** Optional UI preset label that compiled to the schedule (e.g. "daily"). */
    preset: string
    action: CronAction
    /** shell: command line to run. */
    command: string
    /** shell: working directory relative to the project root (or absolute). */
    cwd: string
    /** shell: extra environment as JSON object string. */
    env: string
    /** agent: prompt to send. */
    prompt: string
    /** agent: agent name (defaults to the build agent when empty). */
    agent: string
    /** journal: directory the entry is written to (relative to project root). */
    journalDir: string
    lastRunAt: string
    lastStatus: CronStatus
    lastError: string
    nextRunAt: string
    createdAt: string
    updatedAt: string
  }

  export type Run = {
    id: string
    jobId: string
    ranAt: string
    status: "ok" | "error"
    durationMs: number
    output: string
    error: string
  }

  function projectId(root: string) {
    return `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
  }

  function normalizeAction(value: unknown): CronAction {
    const raw = String(value ?? "shell").toLowerCase()
    if ((CRON_ACTIONS as readonly string[]).includes(raw)) return raw as CronAction
    return "shell"
  }

  function normalizeStatus(value: unknown): CronStatus {
    const raw = String(value ?? "idle").toLowerCase()
    if ((CRON_STATUSES as readonly string[]).includes(raw)) return raw as CronStatus
    return "idle"
  }

  function normalizeBool(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null) return fallback
    if (typeof value === "boolean") return value
    if (typeof value === "number") return value !== 0
    if (typeof value === "string") {
      const s = value.trim().toLowerCase()
      if (s === "true" || s === "1" || s === "yes") return true
      if (s === "false" || s === "0" || s === "no") return false
    }
    return fallback
  }

  function itemFromEntity(id: string, root: string): Item | undefined {
    const detail = Trellis.storeEntity(id, root)
    if (!detail) return undefined
    const fact = (a: string) => detail.facts.find((f: { a: string; v: unknown }) => f.a === a)?.v
    return {
      id,
      name: String(fact("name") ?? "Untitled job"),
      enabled: normalizeBool(fact("enabled"), true),
      schedule: String(fact("schedule") ?? ""),
      preset: String(fact("preset") ?? ""),
      action: normalizeAction(fact("action")),
      command: String(fact("command") ?? ""),
      cwd: String(fact("cwd") ?? ""),
      env: String(fact("env") ?? ""),
      prompt: String(fact("prompt") ?? ""),
      agent: String(fact("agent") ?? ""),
      journalDir: String(fact("journalDir") ?? "journal"),
      lastRunAt: String(fact("lastRunAt") ?? ""),
      lastStatus: normalizeStatus(fact("lastStatus")),
      lastError: String(fact("lastError") ?? ""),
      nextRunAt: String(fact("nextRunAt") ?? ""),
      createdAt: String(fact("createdAt") ?? ""),
      updatedAt: String(fact("updatedAt") ?? fact("createdAt") ?? ""),
    }
  }

  export function get(id: string, dir?: string): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    return itemFromEntity(id, root)
  }

  export function list(dir?: string): Item[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    return Trellis.storeEntities(root, { type: "cron_job", limit: 500 })
      .map((entity) => itemFromEntity(entity.id, root))
      .filter((item): item is Item => !!item)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  export function create(
    input: {
      name: string
      schedule: string
      action?: CronAction
      preset?: string
      enabled?: boolean
      command?: string
      cwd?: string
      env?: string
      prompt?: string
      agent?: string
      journalDir?: string
      id?: string
    },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const now = new Date().toISOString()
    const id = input.id ?? `cron_job:${randomUUID()}`
    StoreSDK.defineEntity(
      "cron_job",
      id,
      {
        name: input.name.trim() || "Untitled job",
        enabled: normalizeBool(input.enabled, true),
        schedule: input.schedule.trim(),
        preset: input.preset?.trim() ?? "",
        action: normalizeAction(input.action),
        command: input.command?.trim() ?? "",
        cwd: input.cwd?.trim() ?? "",
        env: input.env?.trim() ?? "",
        prompt: input.prompt?.trim() ?? "",
        agent: input.agent?.trim() ?? "",
        journalDir: input.journalDir?.trim() || "journal",
        lastRunAt: "",
        lastStatus: "idle",
        lastError: "",
        nextRunAt: "",
        createdAt: now,
        updatedAt: now,
      },
      root,
    )
    StoreSDK.relate(projectId(root), "knows", id, root)
    return itemFromEntity(id, root)
  }

  export function update(
    id: string,
    patch: Partial<Omit<Item, "id" | "createdAt">>,
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    const existing = itemFromEntity(id, root)
    if (!existing) return undefined

    const attrs: Record<string, string | number | boolean | null> = { updatedAt: new Date().toISOString() }
    const set = (key: keyof Item, value: string | number | boolean | undefined) => {
      if (value !== undefined) attrs[key] = value
    }
    set("name", patch.name?.trim())
    set("enabled", patch.enabled)
    set("schedule", patch.schedule?.trim())
    set("preset", patch.preset?.trim())
    set("action", patch.action ? normalizeAction(patch.action) : undefined)
    set("command", patch.command?.trim())
    set("cwd", patch.cwd?.trim())
    set("env", patch.env?.trim())
    set("prompt", patch.prompt?.trim())
    set("agent", patch.agent?.trim())
    set("journalDir", patch.journalDir?.trim())
    set("lastRunAt", patch.lastRunAt)
    set("lastStatus", patch.lastStatus ? normalizeStatus(patch.lastStatus) : undefined)
    set("lastError", patch.lastError)
    set("nextRunAt", patch.nextRunAt)

    StoreSDK.updateEntity(id, attrs, root)
    return itemFromEntity(id, root)
  }

  export function remove(id: string, dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    for (const run of runs(id, root)) StoreSDK.deleteEntity(run.id, root)
    return StoreSDK.deleteEntity(id, root)
  }

  // --- run history -----------------------------------------------------------

  function runFromEntity(id: string, root: string): Run | undefined {
    const detail = Trellis.storeEntity(id, root)
    if (!detail) return undefined
    const fact = (a: string) => detail.facts.find((f: { a: string; v: unknown }) => f.a === a)?.v
    return {
      id,
      jobId: String(fact("jobId") ?? ""),
      ranAt: String(fact("ranAt") ?? ""),
      status: fact("status") === "error" ? "error" : "ok",
      durationMs: Number(fact("durationMs") ?? 0),
      output: String(fact("output") ?? ""),
      error: String(fact("error") ?? ""),
    }
  }

  export function runs(jobId: string, dir?: string): Run[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    return Trellis.storeEntities(root, { type: "cron_run", limit: 1000 })
      .map((entity) => runFromEntity(entity.id, root))
      .filter((run): run is Run => !!run && run.jobId === jobId)
      .sort((a, b) => b.ranAt.localeCompare(a.ranAt))
  }

  export function recordRun(
    input: { jobId: string; status: "ok" | "error"; durationMs: number; output?: string; error?: string },
    dir?: string,
  ) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    const id = `cron_run:${randomUUID()}`
    StoreSDK.defineEntity(
      "cron_run",
      id,
      {
        jobId: input.jobId,
        ranAt: new Date().toISOString(),
        status: input.status,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        output: (input.output ?? "").slice(0, OUTPUT_LIMIT),
        error: (input.error ?? "").slice(0, OUTPUT_LIMIT),
      },
      root,
    )
    StoreSDK.relate(input.jobId, "ran", id, root)

    // Trim history beyond retention.
    const history = runs(input.jobId, root)
    for (const old of history.slice(RUN_RETENTION)) StoreSDK.deleteEntity(old.id, root)
    return runFromEntity(id, root)
  }
}

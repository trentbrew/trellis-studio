import { TrellisVcsEngine } from "trellis"
import { TrellisKernel, SqliteKernelBackend, type EAVStore } from "trellis/core"
import { createHash } from "node:crypto"
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { listLaneMetas } from "trellis/vcs"
import {
  summary as evalSummaryFn,
  agentReport as evalAgentFn,
  sessionReport as evalSessionFn,
  scoreIssue as evalIssueFn,
} from "./eval"
import * as Dogfood from "./dogfood"
import { registerTrellisGate } from "@/hooks/trellis-gate"
import { registerTrellisLifecycle } from "@/hooks/trellis-lifecycle"
import * as Imports from "./imports"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { Log } from "../util/log"
import { Process } from "../util/process"
import { Account } from "../account"
import z from "zod"
import ignore from "ignore"

export namespace Trellis {
  const log = Log.create({ service: "trellis" })

  const trellisRequire = createRequire(import.meta.url)
  let TRELLIS_PKG_ROOT: string | null = null
  try {
    TRELLIS_PKG_ROOT = dirname(trellisRequire.resolve("trellis/package.json"))
  } catch {
    TRELLIS_PKG_ROOT = null
  }

  /** Prefer bundled trellis CLI over PATH global (format-skew footgun). */
  function trellisCliArgs(args: string[]): string[] {
    if (TRELLIS_PKG_ROOT) {
      const cliTs = join(TRELLIS_PKG_ROOT, "src/cli/index.ts")
      const cliDist = join(TRELLIS_PKG_ROOT, "dist/cli/index.js")
      if (existsSync(cliTs)) return ["bun", cliTs, ...args]
      if (existsSync(cliDist)) return [process.execPath, cliDist, ...args]
    }
    log.warn("bundled trellis CLI missing; falling back to PATH trellis")
    return ["trellis", ...args]
  }

  // ---------------------------------------------------------------------------
  // Bus events
  // ---------------------------------------------------------------------------

  export const Event = {
    Initialized: BusEvent.define(
      "trellis.initialized",
      z.object({
        directory: z.string(),
        opsCreated: z.number(),
      }),
    ),
    StatusUpdated: BusEvent.define(
      "trellis.status.updated",
      z.object({
        branch: z.string(),
        totalOps: z.number(),
        trackedFiles: z.number(),
      }),
    ),
  }

  // ---------------------------------------------------------------------------
  // Zod schemas for API responses
  // ---------------------------------------------------------------------------

  export const Status = z
    .object({
      branch: z.string(),
      totalOps: z.number(),
      trackedFiles: z.number(),
      lastOp: z
        .object({
          kind: z.string(),
          timestamp: z.string(),
          hash: z.string(),
        })
        .nullable(),
      recentOps: z.array(
        z.object({
          kind: z.string(),
          timestamp: z.string(),
          hash: z.string(),
        }),
      ),
    })
    .meta({ ref: "TrellisStatus" })

  export const Issue = z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
      labels: z.array(z.string()),
      description: z.string().optional(),
      assignee: z.string().optional(),
      branch: z.string().optional(),
      isBlocked: z.boolean().optional(),
      blockedBy: z.array(z.string()).optional(),
      blocking: z.array(z.string()).optional(),
      criteriaCount: z.number(),
      criteriaPassed: z.number(),
      criteria: z
        .array(
          z.object({
            id: z.string(),
            description: z.string().optional(),
            command: z.string().optional(),
            status: z.string().optional(),
            lastRunAt: z.string().optional(),
            lastOutput: z.string().optional(),
          }),
        )
        .optional(),
      createdAt: z.string(),
    })
    .meta({ ref: "TrellisIssue" })

  export const WorkUnit = z
    .object({
      id: z.string(),
      title: z.string(),
      cycle: z.string().optional(),
      specPath: z.string(),
      status: z.enum(["backlog", "in_progress", "done"]),
      priority: z.enum(["critical", "high", "medium", "low"]),
      tags: z.array(z.string()),
      assignee: z.string().optional(),
      unassigned: z.boolean(),
      criteriaCount: z.number(),
      criteriaPassed: z.number(),
      criteria: z
        .array(
          z.object({
            id: z.string(),
            description: z.string(),
            command: z.string().optional(),
            status: z.enum(["pending", "passed", "failed"]),
            lastRunAt: z.string().optional(),
            lastOutput: z.string().optional(),
            verifiedBy: z.string().optional(),
          }),
        )
        .optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      closedAt: z.string().optional(),
    })
    .meta({ ref: "WorkUnit" })

  export const Cycle = z
    .object({
      id: z.string(),
      title: z.string(),
      milestone: z.string().optional(),
      purpose: z.string(),
      criteria: z.array(
        z.object({
          id: z.string(),
          intent: z.string(),
          metric: z.string().optional(),
          verifiable: z.boolean(),
        }),
      ),
      status: z.enum(["backlog", "in_progress", "done"]),
      horizon: z.enum(["now", "next", "later"]),
      createdAt: z.string(),
    })
    .meta({ ref: "Cycle" })

  // Milestone in this context = Epic
  export const MilestoneEpic = z
    .object({
      id: z.string(),
      title: z.string(),
      roadmap: z.string(),
      targetDate: z.string().optional(),
      status: z.enum(["active", "completed"]),
      unassigned: z.boolean(),
      createdAt: z.string(),
    })
    .meta({ ref: "Milestone" })

  export const Roadmap = z
    .object({
      id: z.string(),
      title: z.string(),
      horizon: z.enum(["now", "next", "later"]),
      status: z.enum(["active", "completed"]),
      createdAt: z.string(),
    })
    .meta({ ref: "Roadmap" })

  // ---------------------------------------------------------------------------
  // WorkUnit / Cycle / Milestone / Roadmap store helpers
  // ---------------------------------------------------------------------------

  // StoreCompat — thin wrappers over addFacts/deleteFacts/addLinks/deleteLinks
  // (EAVStore.define/update/relate/unrelate/delete were removed in trellis 3.x)
  const compat = {
    define(s: EAVStore, type: string, id: string, attrs: Record<string, string | number | boolean>) {
      const facts: Array<{ e: string; a: string; v: string | number | boolean }> = [{ e: id, a: "type", v: type }]
      for (const [a, v] of Object.entries(attrs)) facts.push({ e: id, a, v })
      s.addFacts(facts)
    },
    update(s: EAVStore, id: string, attrs: Record<string, string | number | boolean | null>) {
      const del: Array<{ e: string; a: string; v: string | number | boolean }> = []
      const add: Array<{ e: string; a: string; v: string | number | boolean }> = []
      for (const [a, v] of Object.entries(attrs)) {
        const old = s.getFactsByEntity(id).filter((f: any) => f.a === a)
        for (const f of old) del.push({ e: f.e, a: f.a, v: f.v as string | number | boolean })
        if (v !== null) add.push({ e: id, a, v })
      }
      if (del.length) s.deleteFacts(del)
      if (add.length) s.addFacts(add)
    },
    remove(s: EAVStore, id: string) {
      const facts = s.getFactsByEntity(id)
      if (facts.length) s.deleteFacts(facts.map((f: any) => ({ e: f.e, a: f.a, v: f.v })))
      const links = s.getLinksByEntity(id)
      if (links.length) s.deleteLinks(links.map((l: any) => ({ e1: l.e1, a: l.a, e2: l.e2 })))
    },
    relate(s: EAVStore, e1: string, rel: string, e2: string) {
      s.addLinks([{ e1, a: rel, e2 }])
    },
    unrelate(s: EAVStore, e1: string, rel: string, e2: string) {
      s.deleteLinks([{ e1, a: rel, e2 }])
    },
  }

  const store = {
    query(type?: string, limit = 100) {
      return storeEntities(undefined, { type, limit })
    },
    entity(id: string) {
      return storeEntity(id)
    },
  }

  // ---------------------------------------------------------------------------
  // WorkUnit CRUD
  // ---------------------------------------------------------------------------

  const SPEC_DIR = ".agent/plans"

  function nextId(prefix: string, entityType: string, dir?: string): string {
    const existing = storeEntities(dir, { type: entityType, limit: 1000 })
    const nums = existing
      .map((e) => {
        const match = e.id.match(new RegExp(`^${prefix}-(\\d+)$`))
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => n > 0)
    const next = nums.length ? Math.max(...nums) + 1 : 1
    return `${prefix}-${next}`
  }

  function mapWorkUnit(detail: ReturnType<typeof storeEntity>): z.infer<typeof WorkUnit> | undefined {
    if (!detail) return undefined
    const facts = new Map(detail.facts.map((f: any) => [f.a, f.v]))
    const criteria: z.infer<typeof WorkUnit>["criteria"] = []
    const criteriaJson = facts.get("criteria")
    if (typeof criteriaJson === "string") {
      try {
        const parsed = JSON.parse(criteriaJson)
        if (Array.isArray(parsed)) criteria.push(...parsed)
      } catch { }
    }
    return {
      id: detail.id,
      title: (facts.get("title") as string) ?? "",
      cycle: facts.get("cycle") as string | undefined,
      specPath: (facts.get("specPath") as string) ?? "",
      status: (facts.get("status") as any) ?? "backlog",
      priority: (facts.get("priority") as any) ?? "medium",
      tags: ((facts.get("tags") as string) ?? "").split(",").filter(Boolean),
      assignee: facts.get("assignee") as string | undefined,
      unassigned: facts.get("unassigned") === "true",
      criteriaCount: criteria.length,
      criteriaPassed: criteria.filter((c) => c.status === "passed").length,
      criteria,
      createdAt: (facts.get("createdAt") as string) ?? "",
      updatedAt: (facts.get("updatedAt") as string) ?? "",
      closedAt: facts.get("closedAt") as string | undefined,
    }
  }

  export async function createWorkUnit(
    title: string,
    opts?: {
      cycle?: string
      priority?: "critical" | "high" | "medium" | "low"
      tags?: string[]
      criteria?: Array<{ description: string; command?: string }>
    },
    dir?: string,
  ): Promise<z.infer<typeof WorkUnit> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const id = nextId("WU", "WorkUnit", dir)
    const specPath = `${SPEC_DIR}/${id}.md`
    const now = new Date().toISOString()
    const attrs = {
      type: "WorkUnit",
      title,
      status: "backlog",
      priority: opts?.priority ?? "medium",
      tags: opts?.tags?.join(",") ?? "",
      cycle: opts?.cycle ?? "",
      cycle_id: opts?.cycle ?? "",
      unassigned: opts?.cycle ? "false" : "true",
      specPath,
      criteria: JSON.stringify(
        (opts?.criteria ?? []).map((c, i) => ({
          id: `${id}-c${i + 1}`,
          description: c.description,
          command: c.command ?? "",
          status: "pending",
        })),
      ),
      createdAt: now,
      updatedAt: now,
    }
    try {
      compat.define(eng.getStore(), "WorkUnit", id, attrs)
      log.info("workunit created", { id, title })
      return {
        id,
        title,
        cycle: opts?.cycle,
        specPath,
        status: "backlog",
        priority: opts?.priority ?? "medium",
        tags: opts?.tags ?? [],
        assignee: undefined,
        unassigned: !opts?.cycle,
        criteriaCount: opts?.criteria?.length ?? 0,
        criteriaPassed: 0,
        criteria: opts?.criteria?.map((c, i) => ({
          id: `${id}-c${i + 1}`,
          description: c.description,
          command: c.command,
          status: "pending" as const,
        })),
        createdAt: now,
        updatedAt: now,
      }
    } catch (err) {
      log.warn("workunit create failed", { title, error: String(err) })
      return undefined
    }
  }

  export function workUnits(dir?: string): z.infer<typeof WorkUnit>[] {
    const eng = engine(dir)
    if (!eng) return []
    const list = storeEntities(dir, { type: "WorkUnit" })
    return list
      .map((e) => storeEntity(e.id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(mapWorkUnit)
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
  }

  export function getWorkUnit(id: string, dir?: string): z.infer<typeof WorkUnit> | undefined {
    return mapWorkUnit(storeEntity(id, dir))
  }

  export async function updateWorkUnit(
    id: string,
    updates: {
      title?: string
      status?: "backlog" | "in_progress" | "done"
      priority?: "critical" | "high" | "medium" | "low"
      tags?: string[]
      cycle?: string | null
    },
    dir?: string,
  ): Promise<z.infer<typeof WorkUnit> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const patch: Record<string, string | number | boolean | null> = { updatedAt: new Date().toISOString() }
    if (updates.title !== undefined) patch.title = updates.title
    if (updates.status !== undefined) {
      patch.status = updates.status
      if (updates.status === "done") patch.closedAt = new Date().toISOString()
    }
    if (updates.priority !== undefined) patch.priority = updates.priority
    if (updates.tags !== undefined) patch.tags = updates.tags.join(",")
    if (updates.cycle !== undefined) {
      patch.cycle = updates.cycle ?? ""
      patch.cycle_id = updates.cycle ?? ""
      patch.unassigned = updates.cycle ? "false" : "true"
    }
    try {
      compat.update(eng.getStore(), id, patch)
      log.info("workunit updated", { id })
      return getWorkUnit(id, dir)
    } catch (err) {
      log.warn("workunit update failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function deleteWorkUnit(id: string, dir?: string): Promise<boolean> {
    const eng = engine(dir)
    if (!eng) return false
    try {
      compat.remove(eng.getStore(), id)
      log.info("workunit deleted", { id })
      return true
    } catch (err) {
      log.warn("workunit delete failed", { id, error: String(err) })
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Cycle CRUD
  // ---------------------------------------------------------------------------

  function mapCycle(detail: ReturnType<typeof storeEntity>): z.infer<typeof Cycle> | undefined {
    if (!detail) return undefined
    const facts = new Map(detail.facts.map((f: any) => [f.a, f.v]))
    const criteria: z.infer<typeof Cycle>["criteria"] = []
    const criteriaJson = facts.get("criteria")
    if (typeof criteriaJson === "string") {
      try {
        const parsed = JSON.parse(criteriaJson)
        if (Array.isArray(parsed)) criteria.push(...parsed)
      } catch { }
    }
    return {
      id: detail.id,
      title: (facts.get("title") as string) ?? "",
      milestone: facts.get("milestone") as string | undefined,
      purpose: (facts.get("purpose") as string) ?? "",
      criteria,
      status: (facts.get("status") as any) ?? "backlog",
      horizon: (facts.get("horizon") as any) ?? "now",
      createdAt: (facts.get("createdAt") as string) ?? "",
    }
  }

  export async function createCycle(
    title: string,
    opts?: {
      milestone?: string
      purpose?: string
      horizon?: "now" | "next" | "later"
      criteria?: Array<{ intent: string; metric?: string; verifiable: boolean }>
    },
    dir?: string,
  ): Promise<z.infer<typeof Cycle> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const id = nextId("CYCLE", "Cycle", dir)
    const now = new Date().toISOString()
    const attrs = {
      type: "Cycle",
      title,
      milestone: opts?.milestone ?? "",
      purpose: opts?.purpose ?? "",
      status: "backlog",
      horizon: opts?.horizon ?? "now",
      criteria: JSON.stringify(
        (opts?.criteria ?? []).map((c, i) => ({
          id: `${id}-p${i + 1}`,
          intent: c.intent,
          metric: c.metric ?? "",
          verifiable: c.verifiable,
        })),
      ),
      createdAt: now,
    }
    try {
      compat.define(eng.getStore(), "Cycle", id, attrs)
      log.info("cycle created", { id, title })
      return mapCycle(storeEntity(id))
    } catch (err) {
      log.warn("cycle create failed", { title, error: String(err) })
      return undefined
    }
  }

  export function cycles(dir?: string): z.infer<typeof Cycle>[] {
    const eng = engine(dir)
    if (!eng) return []
    const list = storeEntities(dir, { type: "Cycle" })
    return list
      .map((e) => storeEntity(e.id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(mapCycle)
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
  }

  export function getCycle(id: string, dir?: string): z.infer<typeof Cycle> | undefined {
    return mapCycle(storeEntity(id, dir))
  }

  export async function updateCycle(
    id: string,
    updates: {
      title?: string
      status?: "backlog" | "in_progress" | "done"
      milestone?: string | null
      purpose?: string
    },
    dir?: string,
  ): Promise<z.infer<typeof Cycle> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const patch: Record<string, string | number | boolean | null> = {}
    if (updates.title !== undefined) patch.title = updates.title
    if (updates.status !== undefined) patch.status = updates.status
    if (updates.milestone !== undefined) {
      patch.milestone = updates.milestone ?? ""
    }
    if (updates.purpose !== undefined) patch.purpose = updates.purpose
    try {
      compat.update(eng.getStore(), id, patch)
      log.info("cycle updated", { id })
      return getCycle(id, dir)
    } catch (err) {
      log.warn("cycle update failed", { id, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // MilestoneEpic CRUD
  // ---------------------------------------------------------------------------

  function mapMilestoneEpic(detail: ReturnType<typeof storeEntity>): z.infer<typeof MilestoneEpic> | undefined {
    if (!detail) return undefined
    const facts = new Map(detail.facts.map((f: any) => [f.a, f.v]))
    return {
      id: detail.id,
      title: (facts.get("title") as string) ?? "",
      roadmap: (facts.get("roadmap") as string) ?? "",
      targetDate: facts.get("targetDate") as string | undefined,
      status: (facts.get("status") as any) ?? "active",
      unassigned: facts.get("unassigned") === "true",
      createdAt: (facts.get("createdAt") as string) ?? "",
    }
  }

  export async function createMilestoneEpic(
    title: string,
    opts?: { roadmap?: string; targetDate?: string },
    dir?: string,
  ): Promise<z.infer<typeof MilestoneEpic> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const id = nextId("MS", "MilestoneEpic", dir)
    const now = new Date().toISOString()
    const attrs = {
      type: "MilestoneEpic",
      title,
      roadmap: opts?.roadmap ?? "roadmap:default",
      targetDate: opts?.targetDate ?? "",
      status: "active",
      unassigned: "true",
      createdAt: now,
    }
    try {
      compat.define(eng.getStore(), "MilestoneEpic", id, attrs)
      log.info("milestone created", { id, title })
      return mapMilestoneEpic(storeEntity(id))
    } catch (err) {
      log.warn("milestone create failed", { title, error: String(err) })
      return undefined
    }
  }

  export function epics(dir?: string): z.infer<typeof MilestoneEpic>[] {
    const eng = engine(dir)
    if (!eng) return []
    const list = storeEntities(dir, { type: "MilestoneEpic" })
    return list
      .map((e) => storeEntity(e.id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(mapMilestoneEpic)
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
  }

  export function getMilestone(id: string, dir?: string): z.infer<typeof MilestoneEpic> | undefined {
    return mapMilestoneEpic(storeEntity(id, dir))
  }

  // ---------------------------------------------------------------------------
  // Roadmap CRUD
  // ---------------------------------------------------------------------------

  function mapRoadmap(detail: ReturnType<typeof storeEntity>): z.infer<typeof Roadmap> | undefined {
    if (!detail) return undefined
    const facts = new Map(detail.facts.map((f: any) => [f.a, f.v]))
    return {
      id: detail.id,
      title: (facts.get("title") as string) ?? "",
      horizon: (facts.get("horizon") as any) ?? "now",
      status: (facts.get("status") as any) ?? "active",
      createdAt: (facts.get("createdAt") as string) ?? "",
    }
  }

  export async function createRoadmap(
    title: string,
    opts?: { horizon?: "now" | "next" | "later" },
    dir?: string,
  ): Promise<z.infer<typeof Roadmap> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const id = "roadmap:" + title.toLowerCase().replace(/\s+/g, "-")
    const now = new Date().toISOString()
    const attrs = {
      type: "Roadmap",
      title,
      horizon: opts?.horizon ?? "now",
      status: "active",
      createdAt: now,
    }
    try {
      compat.define(eng.getStore(), "Roadmap", id, attrs)
      log.info("roadmap created", { id, title })
      return mapRoadmap(storeEntity(id))
    } catch (err) {
      log.warn("roadmap create failed", { title, error: String(err) })
      return undefined
    }
  }

  export function roadmaps(dir?: string): z.infer<typeof Roadmap>[] {
    const eng = engine(dir)
    if (!eng) return []
    const list = storeEntities(dir, { type: "Roadmap" })
    return list
      .map((e) => storeEntity(e.id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map(mapRoadmap)
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
  }

  export function getRoadmap(id: string, dir?: string): z.infer<typeof Roadmap> | undefined {
    return mapRoadmap(storeEntity(id, dir))
  }

  // ---------------------------------------------------------------------------
  // Telos config (not an entity - ambient project config)
  // ---------------------------------------------------------------------------

  const TELOS_FILE = ".trellis/telos.md"

  export interface Telos {
    mission: string
    vision?: string
    createdAt: string
    updatedAt: string
  }

  function parseTelos(content: string): Telos | undefined {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return undefined
    const frontmatter = match[1]
    const missionMatch = frontmatter.match(/mission:\s*(.+)/)
    const visionMatch = frontmatter.match(/vision:\s*(.+)/)
    const createdMatch = frontmatter.match(/createdAt:\s*(.+)/)
    const updatedMatch = frontmatter.match(/updatedAt:\s*(.+)/)
    if (!missionMatch) return undefined
    return {
      mission: missionMatch[1].trim(),
      vision: visionMatch?.[1].trim(),
      createdAt: createdMatch?.[1].trim() ?? new Date().toISOString(),
      updatedAt: updatedMatch?.[1].trim() ?? new Date().toISOString(),
    }
  }

  function formatTelos(t: Telos): string {
    return `---
mission: ${t.mission}
vision: ${t.vision ?? ""}
createdAt: ${t.createdAt}
updatedAt: ${t.updatedAt}
---

The mission is the telos. Everything we do serves it.`
  }

  export function getTelos(dir?: string): Telos | undefined {
    const d = dir ?? Instance.directory
    const { join } = require("path")
    const { readFileSync, existsSync } = require("fs")
    const path = join(d, TELOS_FILE)
    if (!existsSync(path)) return undefined
    try {
      const content = readFileSync(path, "utf-8")
      return parseTelos(content)
    } catch {
      return undefined
    }
  }

  export async function setTelos(mission: string, vision?: string, dir?: string): Promise<Telos | undefined> {
    const d = dir ?? Instance.directory
    const { join } = require("path")
    const { writeFileSync, mkdirSync, existsSync } = require("fs")
    const path = join(d, TELOS_FILE)
    const dirPath = join(d, ".trellis")
    const now = new Date().toISOString()
    const telos: Telos = {
      mission,
      vision,
      createdAt: getTelos(dir)?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
      writeFileSync(path, formatTelos(telos), "utf-8")
      log.info("telos updated", { mission: telos.mission })
      return telos
    } catch (err) {
      log.warn("telos update failed", { error: String(err) })
      return undefined
    }
  }

  export const TrackedFile = z
    .object({
      path: z.string(),
      hash: z.string().optional(),
      size: z.number().optional(),
      language: z.string().optional(),
    })
    .meta({ ref: "TrellisTrackedFile" })

  export const GraphStats = z
    .object({
      branch: z.string(),
      totalOps: z.number(),
      trackedFiles: z.number(),
      hiddenFiles: z.number(),
      hiddenDirs: z.number(),
      hiddenNodes: z.number(),
      issueCount: z.number(),
      activeIssues: z.number(),
      nodeCount: z.number(),
      edgeCount: z.number(),
      avgIssueHealth: z.number(),
    })
    .meta({ ref: "TrellisGraphStats" })

  // ---------------------------------------------------------------------------
  // Engine cache — one engine per workspace directory
  // ---------------------------------------------------------------------------

  const engines = new Map<string, TrellisVcsEngine>()
  const initInflight = new Map<string, Promise<TrellisVcsEngine | undefined>>()
  const agentIds = new Map<string, string>()
  const kernels = new Map<string, InstanceType<typeof TrellisKernel>>()
  const planManagers = new Map<string, any>()

  type Raw = string | number | boolean
  type Fact = { e: string; a: string; v: Raw }
  type Link = { e1: string; a: string; e2: string }

  function key(dir: string) {
    return Filesystem.resolve(dir)
  }

  export function engine(dir?: string): TrellisVcsEngine | undefined {
    const d = dir ?? Instance.directory
    return engines.get(key(d))
  }

  function pickFacts(input: unknown): Fact[] {
    if (!Array.isArray(input)) return []
    return input.filter((item): item is Fact => {
      const fact = item as Partial<Fact>
      return (
        typeof fact.e === "string" &&
        typeof fact.a === "string" &&
        (typeof fact.v === "string" || typeof fact.v === "number" || typeof fact.v === "boolean")
      )
    })
  }

  function pickLinks(input: unknown): Link[] {
    if (!Array.isArray(input)) return []
    return input.filter((item): item is Link => {
      const link = item as Partial<Link>
      return typeof link.e1 === "string" && typeof link.a === "string" && typeof link.e2 === "string"
    })
  }

  function raw(input: unknown): input is Raw {
    return typeof input === "string" || typeof input === "number" || typeof input === "boolean"
  }

  function attrs(input: unknown) {
    const out: Record<string, Raw> = {}
    if (!input || typeof input !== "object" || Array.isArray(input)) return out
    for (const [a, v] of Object.entries(input)) {
      if (raw(v)) out[a] = v
    }
    return out
  }

  function parse(input: unknown) {
    if (typeof input !== "string") return undefined
    try {
      const value = JSON.parse(input)
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
      return value as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  function obj(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {}
    return input as Record<string, unknown>
  }

  function mutate(eng: TrellisVcsEngine, op: { kind?: string; vcs?: Record<string, unknown> }) {
    if (!op.vcs) return
    if (op.kind === "vcs:storeAssert") {
      const facts = pickFacts(op.vcs.facts)
      if (facts.length) eng.getStore().addFacts(facts)
      return
    }
    if (op.kind === "vcs:storeRetract") {
      const facts = pickFacts(op.vcs.facts)
      if (facts.length) eng.getStore().deleteFacts(facts)
      return
    }
    if (op.kind === "vcs:storeLink") {
      const links = pickLinks(op.vcs.links)
      if (links.length) eng.getStore().addLinks(links)
      return
    }
    if (op.kind === "vcs:storeUnlink") {
      const links = pickLinks(op.vcs.links)
      if (links.length) eng.getStore().deleteLinks(links)
    }
  }

  function replay(eng: TrellisVcsEngine) {
    for (const op of eng.log() as Array<{ kind?: string; vcs?: Record<string, unknown> }>) mutate(eng, op)
  }

  function legacy(eng: TrellisVcsEngine) {
    const store = eng.getStore()
    const ops = eng.log() as Array<{ kind?: string; vcs?: Record<string, unknown> }>
    for (const op of ops) {
      const vcs = op.vcs
      if (op.kind !== "vcs:decisionRecord" || vcs?.decisionToolName !== "trellis_store_mutate") continue
      const args = parse(vcs.decisionToolInput)
      const output = typeof vcs.decisionToolOutput === "string" ? vcs.decisionToolOutput : ""
      if (!args) continue
      if (args.action === "define" && typeof args.id === "string" && typeof args.type === "string") {
        if (!output.startsWith(`Created entity ${args.id} [${args.type}]`)) continue
        const facts: Fact[] = [{ e: args.id, a: "type", v: args.type }]
        for (const [a, v] of Object.entries(attrs(args.attrs))) facts.push({ e: args.id, a, v })
        store.addFacts(facts)
        continue
      }
      if (args.action === "update" && typeof args.id === "string") {
        if (!output.startsWith(`Updated ${args.id}:`)) continue
        for (const [a, v] of Object.entries(obj(args.attrs))) {
          const old = pickFacts(store.getFactsByEntity(args.id)).filter((fact) => fact.a === a)
          if (old.length) store.deleteFacts(old)
          if (raw(v)) store.addFacts([{ e: args.id, a, v }])
        }
        continue
      }
      if (args.action === "delete" && typeof args.id === "string") {
        if (!output.startsWith(`Deleted ${args.id}:`)) continue
        const facts = pickFacts(store.getFactsByEntity(args.id))
        const links = pickLinks(store.getLinksByEntity(args.id))
        if (facts.length) store.deleteFacts(facts)
        if (links.length) store.deleteLinks(links)
        continue
      }
      if (
        args.action === "assert" &&
        typeof args.entity === "string" &&
        typeof args.attribute === "string" &&
        raw(args.value)
      ) {
        if (!output.startsWith(`Asserted: ${args.entity}.${args.attribute} =`)) continue
        store.addFacts([{ e: args.entity, a: args.attribute, v: args.value }])
        continue
      }
      if (
        args.action === "retract" &&
        typeof args.entity === "string" &&
        typeof args.attribute === "string" &&
        raw(args.value)
      ) {
        if (!output.startsWith(`Retracted: ${args.entity}.${args.attribute} =`)) continue
        store.deleteFacts([{ e: args.entity, a: args.attribute, v: args.value }])
        continue
      }
      if (
        args.action === "link" &&
        typeof args.source === "string" &&
        typeof args.relation === "string" &&
        typeof args.target === "string"
      ) {
        if (!output.startsWith(`Linked: ${args.source} --[${args.relation}]--> ${args.target}`)) continue
        store.addLinks([{ e1: args.source, a: args.relation, e2: args.target }])
        continue
      }
      if (
        args.action === "unlink" &&
        typeof args.source === "string" &&
        typeof args.relation === "string" &&
        typeof args.target === "string"
      ) {
        if (!output.startsWith(`Unlinked: ${args.source} --[${args.relation}]--> ${args.target}`)) continue
        store.deleteLinks([{ e1: args.source, a: args.relation, e2: args.target }])
      }
    }
  }

  function clean(meta?: StoreMeta) {
    if (!meta) return {}
    return Object.fromEntries(Object.entries(meta).filter((entry) => entry[1] !== undefined))
  }

  function append(eng: TrellisVcsEngine, dir: string, kind: string, vcs: Record<string, unknown>, meta?: StoreMeta) {
    const actor = meta?.actor ?? agentIds.get(key(dir)) ?? "unknown"
    const log = (eng as unknown as { opLog: { getLastOp(): { hash?: string } | undefined; append(op: object): void } })
      .opLog
    const base = {
      kind,
      timestamp: new Date().toISOString(),
      agentId: actor,
      previousHash: log.getLastOp()?.hash,
      vcs: { ...vcs, ...clean(meta) },
    }
    const digest = createHash("sha256").update(JSON.stringify(base)).digest("hex")
    const op = { ...base, hash: `trellis:op:${digest}` }
    log.append(op)
    return op
  }

  // ---------------------------------------------------------------------------
  // Init / Open
  // ---------------------------------------------------------------------------

  export async function init(dir?: string) {
    const k = key(dir ?? Instance.directory)

    if (engines.has(k)) return engines.get(k)!

    const pending = initInflight.get(k)
    if (pending) return pending

    const run = (async () => {
      if (!existsSync(k) || !statSync(k).isDirectory()) {
        log.warn("skipping trellis init: directory does not exist or is not a directory", { directory: k })
        return undefined
      }

      const eng = new TrellisVcsEngine({ rootPath: k })

      if (!TrellisVcsEngine.isRepo(k)) {
        log.info("initializing trellis repo", { directory: k })
        const result = await eng.initRepo()
        log.info("trellis repo initialized", { directory: k, opsCreated: result.opsCreated })
        Bus.publish(Event.Initialized, { directory: k, opsCreated: result.opsCreated })
      } else {
        log.info("opening existing trellis repo", { directory: k })
        eng.open()
      }
      legacy(eng)
      replay(eng)

      eng.watch()
      log.info("trellis file watcher started", { directory: k })

      // Hard-deny gate: kernel authority (canToolRun) enforced at preToolUse.
      registerTrellisGate()
      // Lifecycle: plan-first nudge (sessionStart) + checkpoint (sessionEnd).
      registerTrellisLifecycle()

      engines.set(k, eng)
      const active = await Account.active()
      const agentId = active?.id ?? "unknown"
      agentIds.set(k, agentId)

      // Initialize kernel for plugin use (plan-approval, etc.)
      try {
        const { join } = require("path")
        const backend = new SqliteKernelBackend(join(k, ".trellis", "kernel.db"))
        const kernel = new TrellisKernel({ backend, agentId })
        kernel.boot()
        kernels.set(k, kernel)

        const { PlanManager } = require("trellis/plugins/plan-approval")
        planManagers.set(k, new PlanManager(kernel))
        log.info("trellis kernel + plan manager initialized", { directory: k })
      } catch (err) {
        log.warn("kernel/plan-manager init failed (non-fatal)", { error: String(err) })
      }

      Dogfood.start()

      try {
        const { DesignSeed } = await import("./design-seed")
        DesignSeed.ensure(k)
      } catch (err) {
        log.warn("design seed failed (non-fatal)", { error: String(err) })
      }

      return eng
    })()

    initInflight.set(k, run)
    try {
      return await run
    } finally {
      initInflight.delete(k)
    }
  }

  export function dispose(dir?: string) {
    const k = key(dir ?? Instance.directory)
    const eng = engines.get(k)
    if (eng) {
      Dogfood.stop()
      const kernel = kernels.get(k)
      if (kernel) {
        try {
          kernel.close()
        } catch { }
        kernels.delete(k)
      }
      planManagers.delete(k)
      try {
        eng.stop()
      } catch {
        // ignore
      }
      engines.delete(k)
      log.info("trellis engine disposed", { directory: k })
    }
  }

  // ---------------------------------------------------------------------------
  // Decision trace capture
  // ---------------------------------------------------------------------------

  export interface ToolDecision {
    tool: string
    sessionID: string
    callID?: string
    args?: Record<string, unknown>
    output?: string
    agent?: string
  }

  export async function record(input: ToolDecision) {
    const eng = engine()
    if (!eng) return
    try {
      await eng.recordDecision({
        toolName: input.tool,
        input: sanitize(input.args),
        outputSummary: truncate(input.output),
        context: input.sessionID,
        relatedEntities: [],
        custom: {
          callID: input.callID,
          agent: input.agent,
        },
      })
    } catch (err) {
      log.warn("decision record failed", { tool: input.tool, error: String(err) })
    }
  }

  function sanitize(params?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!params) return undefined
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(params)) {
      out[k] = typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) + "…" : v
    }
    return out
  }

  function truncate(val?: string): string | undefined {
    if (!val) return undefined
    return val.length > 500 ? val.slice(0, 500) + "…" : val
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  export function status(dir?: string): z.infer<typeof Status> | undefined {
    const eng = engine(dir)
    if (!eng) return undefined
    const s = eng.status()
    return {
      branch: s.branch,
      totalOps: s.totalOps,
      trackedFiles: s.trackedFiles,
      lastOp: s.lastOp ? { kind: s.lastOp.kind, timestamp: s.lastOp.timestamp, hash: s.lastOp.hash } : null,
      recentOps: s.recentOps.map((op: any) => ({
        kind: op.kind,
        timestamp: op.timestamp,
        hash: op.hash,
      })),
    }
  }

  export function stats(dir?: string): z.infer<typeof GraphStats> | undefined {
    const eng = engine(dir)
    if (!eng) return undefined
    const s = eng.status()
    const issues = eng.listIssues()
    const active = issues.filter((i: any) => i.status === "in_progress" || i.status === "open" || i.status === "queue")
    const store = storeStats(dir)
    let hiddenFiles = 0
    let hiddenDirs = 0
    let hiddenNodes = 0
    try {
      const tracked = graphFiles(eng.getRootPath(), eng.trackedFiles() as { path: string; contentHash?: string }[])
      hiddenFiles = tracked.hiddenFiles
      hiddenDirs = tracked.hiddenDirs
      hiddenNodes = tracked.hiddenNodes
    } catch {
      // Stats must stay cheap and resilient; hidden counts are best-effort.
    }

    // Calculate average issue health if possible
    let avgIssueHealth = 1.0
    try {
      const summary = evalSummary(dir)
      if (summary) avgIssueHealth = summary.avgIssueHealth
    } catch {
      // ignore
    }

    return {
      branch: s.branch,
      totalOps: s.totalOps,
      trackedFiles: s.trackedFiles,
      hiddenFiles,
      hiddenDirs,
      hiddenNodes,
      issueCount: issues.length,
      activeIssues: active.length,
      nodeCount: 1 + (store?.uniqueEntities ?? 0) + issues.length,
      edgeCount: (store?.totalLinks ?? 0) + (store?.uniqueEntities ?? 0),
      avgIssueHealth,
    }
  }

  export function issues(dir?: string, filter?: { status?: string }): z.infer<typeof Issue>[] {
    const eng = engine(dir)
    if (!eng) return []
    const list = eng.listIssues(filter)
    return list.map(mapIssue)
  }

  export async function getIssue(id: string, dir?: string): Promise<z.infer<typeof Issue> | undefined> {
    const eng = engine(dir)
    if (!eng) return undefined
    const i = eng.getIssue(id)
    if (i) return mapIssue(i)

    // CLI Fallback if engine doesn't have it or we need fresh data
    try {
      const d = dir ?? Instance.directory
      await Process.run(trellisCliArgs(["issue", "show", id, "--path", d]))
      // The CLI output is currently human-readable, but we can parse the basics
      // For now, we'll try to find the issue in the list which IS served by the engine
      const list = eng.listIssues()
      const match = list.find((item: any) => item.id === id)
      if (match) return mapIssue(match)
    } catch {
      // ignore
    }
    return undefined
  }

  export async function checkIssue(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const results = await eng.runCriteria(id)
      log.info("trellis issue check complete", { id, count: results.length })
      return results
    } catch (err) {
      log.warn("issue criteria check failed", { id, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // Desk affordances (Phase 2): lane status, presence, lane ops, usage rollup
  // ---------------------------------------------------------------------------

  export type LaneStatusInfo = {
    laneID: string
    status: string
    issueId?: string
    worktreePath?: string
    dirty: boolean
  }

  export function laneStatus(sessionID: string | undefined, dir?: string): LaneStatusInfo | undefined {
    const eng = engine(dir)
    if (!eng) return undefined
    const metas = listLaneMetas(join(dir ?? Instance.directory, ".trellis"))
    const lane = sessionID
      ? metas.find((l) => l.sessionId === sessionID)
      : metas.find((l) => l.status === "active")
    if (!lane) return undefined
    return {
      laneID: lane.id,
      status: lane.status,
      issueId: lane.issueId,
      worktreePath: lane.worktreePath,
      dirty: Boolean(lane.headOpHash && lane.headOpHash !== lane.baseOpHash),
    }
  }

  export function presence(dir?: string) {
    const base = join(dir ?? Instance.directory, ".trellis", "presence")
    let files: string[] = []
    try {
      files = readdirSync(base)
    } catch {
      return []
    }
    const staleAfter = 5 * 60_000
    const now = Date.now()
    const metas = listLaneMetas(join(dir ?? Instance.directory, ".trellis"))
    const rows: Array<Record<string, unknown>> = []
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const rec = JSON.parse(readFileSync(join(base, file), "utf-8"))
        const last = Number(rec.lastHeartbeat ?? rec.heartbeats?.[0]?.at ?? 0)
        if (now - last > staleAfter) continue
        const lane = rec.laneId ? metas.find((l) => l.id === rec.laneId) : undefined
        rows.push({
          sessionId: rec.sessionId,
          agentId: rec.agentId,
          displayName: rec.displayName ?? rec.agentId,
          client: rec.client,
          laneId: rec.laneId,
          laneStatus: lane?.status,
          issueId: rec.claimedIssueId ?? lane?.issueId,
          issueTitle: rec.claimedIssueTitle,
          status: rec.status,
        })
      } catch {
        // skip malformed presence files
      }
    }
    return rows.sort((a, b) => String(a.agentId).localeCompare(String(b.agentId)))
  }

  export async function promoteLane(laneId: string, dir?: string, opts?: { message?: string }) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const result = await eng.promoteLane(laneId, { requireTest: true })
      if (opts?.message) {
        try {
          await eng.createMilestone(opts.message)
        } catch {
          // milestone is a nicety — promote already succeeded
        }
      }
      log.info("trellis lane promoted", { laneId })
      return { promoted: true, laneId }
    } catch (err) {
      log.warn("lane promote failed", { laneId, error: String(err) })
      return { promoted: false, laneId, error: err instanceof Error ? err.message : String(err) }
    }
  }

  export async function closeIssueGated(id: string, dir?: string, opts?: { confirm?: boolean }) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const results = await eng.runCriteria(id)
      const readiness = eng.checkCompletionReadiness()
      const passed = readiness.readyToClose ?? false
      if (!passed) {
        return { closed: false, reason: "criteria-not-passed", results }
      }
      if (!opts?.confirm) {
        return { closed: false, reason: "needs-confirm", results }
      }
      const outcome = await eng.closeIssue(id, { confirm: true })
      return { closed: true, results, promoteResult: Boolean(outcome.promoteResult) }
    } catch (err) {
      log.warn("issue close failed", { id, error: String(err) })
      return { closed: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  export function recordUsage(
    input: {
      sessionId: string
      laneId?: string
      tokens: number
      inputTokens?: number
      outputTokens?: number
      cost?: number
      model?: string
    },
    dir?: string,
  ) {
    const eng = engine(dir)
    if (!eng) return false
    try {
      eng.recordSessionUsage(input)
      return true
    } catch (err) {
      log.warn("usage record failed", { error: String(err) })
      return false
    }
  }

  export function reentryStatus(dir?: string) {
    const eng = engine(dir)
    if (!eng) return { checkpoint: null, activeLaneId: undefined, issueIds: [] }
    return eng.reentryStatus()
  }

  export async function updateIssue(
    id: string,
    updates: {
      status?: string
      priority?: string
      title?: string
      description?: string
      labels?: string[]
    },
    dir?: string,
  ) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.updateIssue(id, updates as any)
      log.info("trellis issue updated", { id, status: updates.status })
      return op
    } catch (err) {
      log.warn("issue update failed", { id, error: String(err) })
      return undefined
    }
  }

  function mapIssue(i: any): z.infer<typeof Issue> {
    return {
      id: i.id,
      title: i.title,
      status: i.status,
      priority: i.priority,
      labels: i.labels ?? [],
      description: i.description,
      assignee: i.assignee,
      branch: i.branchName ?? i.branch,
      isBlocked: i.isBlocked,
      blockedBy: i.blockedBy ?? [],
      blocking: i.blocking ?? [],
      criteriaCount: i.criteria?.length ?? 0,
      criteriaPassed: i.criteria?.filter((c: any) => c.status === "passed").length ?? 0,
      criteria: i.criteria?.map((c: any) => ({
        id: c.id,
        description: c.description,
        command: c.command,
        status: c.status,
        lastRunAt: c.lastRunAt,
        lastOutput: c.lastOutput,
      })),
      createdAt: i.createdAt,
    }
  }

  export function files(dir?: string): z.infer<typeof TrackedFile>[] {
    const eng = engine(dir)
    if (!eng) return []
    return eng.trackedFiles().map((f: any) => ({
      path: f.path,
      hash: f.contentHash,
    }))
  }

  function storeTouch(op: any) {
    const facts = op.vcs?.facts
    if (!Array.isArray(facts)) return undefined
    const entities = new Set<string>()
    const attrs = new Set<string>()
    for (const raw of facts) {
      if (typeof raw?.e === "string") entities.add(raw.e)
      if (typeof raw?.a === "string") attrs.add(raw.a)
    }
    if (entities.size === 0 && attrs.size === 0) return undefined
    return { entities: [...entities], attrs: [...attrs] }
  }

  export function ops(dir?: string, opts?: { limit?: number; file?: string; entity?: string }) {
    const eng = engine(dir)
    if (!eng) return []
    let all = eng.getOps() as any[]
    if (opts?.file) all = all.filter((op) => op.vcs?.filePath === opts.file)
    if (opts?.entity) {
      const id = opts.entity.includes(":") ? opts.entity : `schema:${opts.entity}`
      all = all.filter((op) => storeTouch(op)?.entities.includes(id))
    }
    if (opts?.limit) all = all.slice(-opts.limit)
    return all.map((op) => {
      const touch = storeTouch(op)
      return {
        kind: op.kind,
        timestamp: op.timestamp,
        hash: op.hash,
        filePath: op.vcs?.filePath,
        branchName: op.vcs?.branchName,
        milestoneMessage: op.vcs?.milestoneMessage,
        toolName: typeof op.vcs?.decisionToolName === "string" ? op.vcs.decisionToolName : undefined,
        outputSummary: typeof op.vcs?.decisionToolOutput === "string" ? op.vcs.decisionToolOutput : undefined,
        storeEntities: touch?.entities,
        storeAttrs: touch?.attrs,
      }
    })
  }

  export async function createIssue(
    title: string,
    opts?: {
      priority?: "critical" | "high" | "medium" | "low"
      labels?: string[]
      description?: string
      criteria?: Array<{ description: string; command?: string }>
    },
    dir?: string,
  ) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.createIssue(title, { ...opts, status: "backlog" })
      log.info("trellis issue created", { title })
      return op
    } catch (err) {
      log.warn("issue creation failed", { title, error: String(err) })
      return undefined
    }
  }

  export async function startIssue(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.startIssue(id)
      log.info("trellis issue started", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue start failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function pauseIssue(id: string, note?: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.pauseIssue(id, note ?? "")
      log.info("trellis issue paused", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue pause failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function resumeIssue(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.resumeIssue(id)
      log.info("trellis issue resumed", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue resume failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function triageIssue(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.triageIssue(id)
      log.info("trellis issue triaged", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue triage failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function closeIssue(id: string, confirm?: boolean, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const result = await eng.closeIssue(id, { confirm })
      log.info("trellis issue closed", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue close failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function reopenIssue(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.reopenIssue(id)
      log.info("trellis issue reopened", { id })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue reopen failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function assignIssue(id: string, agent: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.assignIssue(id, agent)
      log.info("trellis issue assigned", { id, agent })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("issue assign failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function blockIssue(id: string, blockedBy: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.blockIssue(id, blockedBy)
      log.info("trellis issue blocked", { id, blockedBy })
      return { success: true }
    } catch (err) {
      log.warn("issue block failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function unblockIssue(id: string, blockedBy: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.unblockIssue(id, blockedBy)
      log.info("trellis issue unblocked", { id, blockedBy })
      return { success: true }
    } catch (err) {
      log.warn("issue unblock failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function addCriterion(id: string, description: string, command?: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.addCriterion(id, description, command)
      log.info("trellis criterion added", { id, description })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("criterion add failed", { id, error: String(err) })
      return undefined
    }
  }

  export async function milestone(message: string, opts?: { dueAt?: string }, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.createMilestone(message, { dueAt: opts?.dueAt })
      log.info("trellis milestone created", { message, dueAt: opts?.dueAt })
      return op
    } catch (err) {
      log.warn("milestone creation failed", { message, error: String(err) })
      return undefined
    }
  }

  export function decisions(dir?: string, filter?: { tool?: string; agent?: string; limit?: number }) {
    const eng = engine(dir)
    if (!eng) return []
    return eng.queryDecisions({
      toolPattern: filter?.tool,
      agentId: filter?.agent,
      limit: filter?.limit,
    })
  }

  export function chain(entity: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return []
    return eng.getDecisionChain(entity)
  }

  // ---------------------------------------------------------------------------
  // Backlinks
  // ---------------------------------------------------------------------------

  export const Backlink = z.object({
    filePath: z.string(),
    line: z.number(),
    context: z.string(),
  })

  export function backlinks(entity: string, dir?: string): z.infer<typeof Backlink>[] {
    const eng = engine(dir)
    if (!eng) return []
    try {
      const { readFileSync } = require("fs")
      const { join } = require("path")
      const { buildRefIndex, getBacklinks, createResolverContext } = require("trellis/links")
      const ctx = createResolverContext(eng)
      const root = eng.getRootPath()
      const tracked = eng.trackedFiles()
      const contents: Array<{ path: string; content: string }> = []
      for (const f of tracked) {
        try {
          contents.push({ path: f.path, content: readFileSync(join(root, f.path), "utf-8") })
        } catch { }
      }
      const index = buildRefIndex(contents, ctx)
      const candidates = [entity, entity.replace(":", ":")]
      for (const eid of candidates) {
        const sources = getBacklinks(index, eid)
        if (sources.length > 0)
          return sources.map((s: any) => ({ filePath: s.filePath, line: s.line, context: s.context }))
      }
      return []
    } catch (err) {
      log.warn("backlinks lookup failed", { entity, error: String(err) })
      return []
    }
  }

  // ---------------------------------------------------------------------------
  // Graph data (nodes + edges for force-directed visualization)
  // ---------------------------------------------------------------------------

  export const GraphNode = z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
    status: z.string().optional(),
    priority: z.string().optional(),
    size: z.number().optional(),
  })

  export const GraphEdge = z.object({
    source: z.string(),
    target: z.string(),
    type: z.string(),
  })

  export const GraphData = z.object({
    nodes: GraphNode.array(),
    edges: GraphEdge.array(),
    hiddenFiles: z.number(),
    hiddenDirs: z.number(),
    hiddenNodes: z.number(),
  })

  function dot(item: string) {
    return item
      .replaceAll("\\", "/")
      .replace(/\/+$/, "")
      .split("/")
      .some((part) => part.startsWith(".") && part.length > 1)
  }

  function parents(file: string) {
    const out: string[] = []
    const parts = file.split("/")
    parts.pop()
    let dir = ""
    for (const part of parts) {
      dir = dir ? `${dir}/${part}` : part
      out.push(dir)
    }
    return out
  }

  function graphFiles(
    root: string,
    list: Array<{ path: string; contentHash?: string }>,
    opts?: { includeHidden?: boolean },
  ) {
    const { join } = require("path")
    const { readFileSync } = require("fs")
    const ig = ignore()
    for (const file of [".gitignore", ".ignore"]) {
      try {
        const text = readFileSync(join(root, file), "utf-8")
        if (text) ig.add(text)
      } catch { }
    }

    const all = new Set<string>()
    const seen = new Set<string>()
    const dirs = new Set<string>()
    const files: Array<{ path: string; contentHash?: string }> = []
    const include = !!opts?.includeHidden

    for (const item of list) {
      const file = item.path.replaceAll("\\", "/")
      if (seen.has(file)) continue
      seen.add(file)
      const chain = parents(file)
      for (const dir of chain) all.add(dir)
      if (!include && (dot(file) || ig.ignores(file))) continue
      files.push({ ...item, path: file })
      for (const dir of chain) dirs.add(dir)
    }

    let hiddenDirs = 0
    for (const dir of all) {
      if (dirs.has(dir)) continue
      hiddenDirs += 1
    }

    const hiddenFiles = list.length - files.length
    return {
      files,
      hiddenFiles,
      hiddenDirs,
      hiddenNodes: hiddenFiles + hiddenDirs,
    }
  }

  function encodeProjectPath(rootPath: string): string {
    return rootPath.replace(/\//g, "-")
  }

  const graphHiddenPrefixes = ["branch:", "decision:", "dir:", "file:", "issue:", "mcp:", "session:", "sprite:"]
  const graphHiddenTypes = new Set([
    "Branch",
    "Decision",
    "DirectoryNode",
    "FileNode",
    "Issue",
    "Session",
    "Sprite",
    "TypeSchema",
    "WorkUnit",
    "Cycle",
    "MilestoneEpic",
    "Roadmap",
  ])

  function graphEntity(e: { id: string; type: string }) {
    if (graphHiddenTypes.has(e.type)) return false
    return !graphHiddenPrefixes.some((prefix) => e.id.startsWith(prefix))
  }

  export function graph(
    dir?: string,
    opts?: {
      includeHidden?: boolean
      includeImports?: boolean
      includeLinks?: boolean
      includeOps?: boolean
      opsLimit?: number
    },
  ): z.infer<typeof GraphData> {
    const eng = engine(dir)
    if (!eng) return { nodes: [], edges: [], hiddenFiles: 0, hiddenDirs: 0, hiddenNodes: 0 }

    const nodes: z.infer<typeof GraphNode>[] = []
    const edges: z.infer<typeof GraphEdge>[] = []
    const nodeSet = new Set<string>()

    // --- Project node ---
    const rootPath = eng.getRootPath()
    const { basename } = require("path")
    const { readdirSync, readFileSync, existsSync, statSync: fsStat } = require("fs")
    const { homedir } = require("os")
    const { join } = require("path")
    const projectName = basename(rootPath)
    const projectId = `project:${projectName}`
    nodes.push({ id: projectId, label: projectName, type: "project" })
    nodeSet.add(projectId)

    for (const e of storeEntities(dir, { limit: 10000 }).filter(graphEntity)) {
      if (nodeSet.has(e.id)) continue
      nodes.push({ id: e.id, label: e.label ?? e.id, type: e.type })
      nodeSet.add(e.id)
      edges.push({ source: projectId, target: e.id, type: "contains" })
    }

    if (opts?.includeLinks !== false) {
      for (const l of storeLinks(dir)) {
        if (!nodeSet.has(l.e1) || !nodeSet.has(l.e2)) continue
        edges.push({ source: l.e1, target: l.e2, type: l.a })
      }
    }

    // --- Issue nodes ---
    const issueList = eng.listIssues()
    for (const i of issueList) {
      const id = `issue:${i.id}`
      nodes.push({ id, label: i.id, type: "issue", status: i.status, priority: i.priority })
      nodeSet.add(id)
      edges.push({ source: projectId, target: id, type: "contains" })

      if (i.assignee) {
        if (!nodeSet.has(i.assignee)) {
          nodes.push({ id: i.assignee, label: i.assignee.replace("agent:", ""), type: "agent" })
          nodeSet.add(i.assignee)
        }
        edges.push({ source: id, target: i.assignee, type: "assigns" })
      }

      for (const blocked of i.blockedBy ?? []) {
        const blockedId = `issue:${blocked}`
        edges.push({ source: id, target: blockedId, type: "blocks" })
      }

      // Sprite issues (labeled 'sprite')
      if ((i.labels ?? []).includes("sprite")) {
        const spriteId = `sprite:${i.id}`
        if (!nodeSet.has(spriteId)) {
          nodes.push({ id: spriteId, label: i.title ?? i.id, type: "sprite", status: i.status })
          nodeSet.add(spriteId)
          edges.push({ source: projectId, target: spriteId, type: "contains" })
        }
      }
    }

    // --- Memory nodes (from ~/.claude/projects/<encoded>/memory/*.md) ---
    try {
      const encoded = encodeProjectPath(rootPath)
      const memoryDir = join(homedir(), ".claude", "projects", encoded, "memory")
      if (existsSync(memoryDir)) {
        const files = readdirSync(memoryDir).filter((f: string) => f.endsWith(".md") && f !== "MEMORY.md")
        for (const file of files) {
          try {
            const content = readFileSync(join(memoryDir, file), "utf-8")
            const nameMatch = content.match(/^name:\s*(.+)$/m)
            const name = nameMatch ? nameMatch[1].trim() : file.replace(".md", "")
            const memId = `memory:${file.replace(".md", "")}`
            if (!nodeSet.has(memId)) {
              nodes.push({ id: memId, label: name, type: "memory" })
              nodeSet.add(memId)
              edges.push({
                source: `agent:${agentIds.get(key(rootPath)) ?? "unknown"}`,
                target: memId,
                type: "remembers",
              })
            }
          } catch { }
        }
      }
    } catch { }

    // --- WorkUnit nodes ---
    const workUnitList = workUnits(dir)
    for (const w of workUnitList) {
      const id = `workunit:${w.id}`
      if (!nodeSet.has(id)) {
        nodes.push({ id, label: w.title ?? w.id, type: "workunit", status: w.status, priority: w.priority })
        nodeSet.add(id)
        edges.push({ source: projectId, target: id, type: "contains" })
      }
    }

    // --- Cycle nodes ---
    const cycleList = cycles(dir)
    for (const c of cycleList) {
      const id = `cycle:${c.id}`
      if (!nodeSet.has(id)) {
        nodes.push({ id, label: c.title ?? c.id, type: "cycle", status: c.status })
        nodeSet.add(id)
        edges.push({ source: projectId, target: id, type: "contains" })
      }
    }

    // --- MilestoneEpic nodes ---
    const epicList = epics(dir)
    for (const e of epicList) {
      const id = `epic:${e.id}`
      if (!nodeSet.has(id)) {
        nodes.push({ id, label: e.title ?? e.id, type: "epic", status: e.unassigned ? "unassigned" : "active" })
        nodeSet.add(id)
        edges.push({ source: projectId, target: id, type: "contains" })
      }
    }

    // --- Roadmap nodes ---
    const roadmapList = roadmaps(dir)
    for (const r of roadmapList) {
      const id = `roadmap:${r.id}`
      if (!nodeSet.has(id)) {
        nodes.push({ id, label: r.title ?? r.id, type: "roadmap", status: r.status })
        nodeSet.add(id)
        edges.push({ source: projectId, target: id, type: "contains" })
      }
    }

    // --- Suggestion nodes ---
    const suggestionList = watcherSuggestions(dir)
    for (const s of suggestionList) {
      const id = `suggestion:${s.id}`
      if (!nodeSet.has(id)) {
        nodes.push({
          id,
          label: s.description.slice(0, 30) + (s.description.length > 30 ? "..." : ""),
          type: "suggestion",
          status: "active",
        })
        nodeSet.add(id)
        edges.push({ source: projectId, target: id, type: "contains" })
      }
    }

    // --- File & directory nodes ---
    try {
      const tracked = graphFiles(rootPath, eng.trackedFiles() as { path: string; contentHash?: string }[], opts)
      const dirs = new Set<string>()
      for (const f of tracked.files) {
        const id = `file:${f.path}`
        const name = basename(f.path)
        const isWhiteboard = name.toLowerCase().endsWith(".whiteboard")
        if (!nodeSet.has(id)) {
          let size: number | undefined
          try {
            size = fsStat(join(rootPath, f.path)).size
          } catch { }
          nodes.push({ id, label: name, type: isWhiteboard ? "whiteboard" : "file", size })
          nodeSet.add(id)
        }
        // collect parent directories
        const parts = f.path.split("/")
        parts.pop()
        let dir = ""
        for (const part of parts) {
          dir = dir ? `${dir}/${part}` : part
          dirs.add(dir)
        }
        // link file to its immediate parent directory
        if (parts.length > 0) {
          const parentDir = parts.join("/")
          edges.push({ source: `dir:${parentDir}`, target: id, type: "parent" })
        } else {
          edges.push({ source: projectId, target: id, type: "tracks" })
        }
      }
      // create directory nodes
      for (const dir of dirs) {
        const id = `dir:${dir}`
        if (!nodeSet.has(id)) {
          nodes.push({ id, label: basename(dir), type: "directory" })
          nodeSet.add(id)
        }
        // link to parent dir or project
        const parts = dir.split("/")
        if (parts.length > 1) {
          parts.pop()
          edges.push({ source: `dir:${parts.join("/")}`, target: id, type: "parent" })
        } else {
          edges.push({ source: projectId, target: id, type: "tracks" })
        }
      }

      // --- Import / markdown-link edges (best-effort, cached by contentHash) ---
      const wantImports = opts?.includeImports !== false
      const wantLinks = opts?.includeLinks !== false
      if (wantImports || wantLinks) {
        try {
          const { join } = require("path")
          const { readFileSync, statSync } = require("fs")
          const trackedSet = new Set(tracked.files.map((f) => f.path))
          const seenEdge = new Set<string>()
          const MAX_FILES = 8000
          let scanned = 0
          for (const f of tracked.files) {
            if (scanned++ > MAX_FILES) break
            if (!Imports.shouldScan(f.path)) continue
            const isMd = f.path.endsWith(".md") || f.path.endsWith(".mdx")
            if (isMd && !wantLinks) continue
            if (!isMd && !wantImports) continue
            // Fast path: reuse cached specs if we've seen this contentHash before.
            let specs = Imports.peekCache(f.path, f.contentHash)
            if (!specs) {
              try {
                const abs = join(rootPath, f.path)
                const st = statSync(abs)
                if (st.size > 512 * 1024) continue
                const content = readFileSync(abs, "utf-8") as string
                specs = Imports.extractCached(f.path, content, f.contentHash)
              } catch {
                continue
              }
            }
            const edgeType = isMd ? "links" : "imports"
            for (const spec of specs) {
              const target = Imports.resolve(f.path, spec, trackedSet)
              if (!target || target === f.path) continue
              const key = `${f.path}→${target}`
              if (seenEdge.has(key)) continue
              seenEdge.add(key)
              edges.push({ source: `file:${f.path}`, target: `file:${target}`, type: edgeType })
            }
          }
        } catch (err) {
          log.error("import scan failed", { err: String(err) })
        }
      }

      // --- Op nodes (opt-in, bounded) ---
      // Ops are the causal stream — each entry represents an immutable action
      // in the log. We keep them out of the default view because even small
      // projects rack up hundreds quickly, but surface them behind a toggle
      // so users can see which ops touched which files.
      if (opts?.includeOps) {
        try {
          const cap = Math.max(1, Math.min(500, opts.opsLimit ?? 100))
          const recent = ops(dir, { limit: cap })
          const trackedSet = new Set(tracked.files.map((f) => `file:${f.path}`))
          for (const op of recent) {
            const id = `op:${op.hash}`
            if (nodeSet.has(id)) continue
            const label = op.milestoneMessage ?? op.branchName ?? op.filePath ?? op.kind
            nodes.push({ id, label: String(label), type: "op", status: op.kind })
            nodeSet.add(id)
            const fileTarget = op.filePath ? `file:${op.filePath}` : undefined
            if (fileTarget && trackedSet.has(fileTarget)) {
              edges.push({ source: id, target: fileTarget, type: "touches" })
            } else {
              edges.push({ source: projectId, target: id, type: "contains" })
            }
          }
        } catch (err) {
          log.debug("op node emit failed", { err: String(err) })
        }
      }

      return {
        nodes,
        edges,
        hiddenFiles: tracked.hiddenFiles,
        hiddenDirs: tracked.hiddenDirs,
        hiddenNodes: tracked.hiddenNodes,
      }
    } catch { }

    return { nodes, edges, hiddenFiles: 0, hiddenDirs: 0, hiddenNodes: 0 }
  }

  export async function createSprite(name: string, opts?: { url?: string; description?: string }, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const desc = [opts?.description ?? `Deployment target: ${name}`, opts?.url ? `URL: ${opts.url}` : ""]
        .filter(Boolean)
        .join("\n")
      const op = await eng.createIssue(name, {
        description: desc,
        labels: ["sprite"],
        priority: "medium",
      })
      log.info("trellis sprite created", { name })
      return op
    } catch (err) {
      log.warn("sprite creation failed", { name, error: String(err) })
      return undefined
    }
  }

  export async function deleteSprite(name: string, dir?: string): Promise<boolean> {
    const eng = engine(dir)
    if (!eng) return false
    try {
      const sprites = eng.listIssues({ label: "sprite" })
      const sprite = sprites.find((i: any) => i.title === name || i.id === name)
      if (!sprite) return false
      compat.remove(eng.getStore(), sprite.id)
      log.info("trellis sprite deleted", { name })
      return true
    } catch (err) {
      log.warn("sprite deletion failed", { name, error: String(err) })
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Outgoing refs (resolved references from an entity's content)
  // ---------------------------------------------------------------------------

  export const ResolvedRef = z.object({
    namespace: z.string(),
    target: z.string(),
    state: z.enum(["resolved", "stale", "broken"]),
    entityId: z.string().optional(),
    title: z.string().optional(),
    staleReason: z.enum(["renamed", "deleted"]).optional(),
    source: z.object({
      filePath: z.string(),
      line: z.number(),
      col: z.number(),
      context: z.string(),
    }),
  })

  export function outgoingRefs(entityId: string, dir?: string): z.infer<typeof ResolvedRef>[] {
    const eng = engine(dir)
    if (!eng) return []
    try {
      const { parseMarkdownRefs } = require("trellis/links")
      const { resolveRef, createResolverContext } = require("trellis/links")
      const ctx = createResolverContext(eng)

      // Extract the content to parse — for issues, use description
      let content = ""
      const issueId = entityId.startsWith("issue:") ? entityId.slice(6) : null
      if (issueId) {
        const issue = eng.getIssue(issueId)
        if (!issue) return []
        content = [issue.title, issue.description].filter(Boolean).join("\n")
      } else {
        return []
      }

      const refs = parseMarkdownRefs(content, `entity:${entityId}`)
      return refs.map((ref: any) => {
        const resolved = resolveRef(ref, ctx)
        return {
          namespace: resolved.namespace,
          target: resolved.target,
          state: resolved.state ?? "broken",
          entityId: resolved.entityId,
          title: resolved.title,
          staleReason: resolved.staleReason,
          source: {
            filePath: resolved.source.filePath,
            line: resolved.source.line,
            col: resolved.source.col,
            context: resolved.source.context ?? "",
          },
        }
      })
    } catch (err) {
      log.warn("outgoing refs lookup failed", { entityId, error: String(err) })
      return []
    }
  }

  // ---------------------------------------------------------------------------
  // Branch schemas & functions
  // ---------------------------------------------------------------------------

  export const Branch = z.object({
    name: z.string(),
    isCurrent: z.boolean(),
    createdAt: z.string().optional(),
  })

  function mapBranch(b: any): z.infer<typeof Branch> {
    return {
      name: b.name ?? "",
      isCurrent: b.isCurrent ?? false,
      createdAt: b.createdAt,
    }
  }

  export function branches(dir?: string): z.infer<typeof Branch>[] {
    const eng = engine(dir)
    if (!eng) return []
    return eng.listBranches().map(mapBranch)
  }

  export function currentBranch(dir?: string): string | undefined {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.getCurrentBranch()
  }

  export async function createBranch(name: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.createBranch(name)
      log.info("trellis branch created", { name })
      return op
    } catch (err) {
      log.warn("branch create failed", { name, error: String(err) })
      return undefined
    }
  }

  export function switchBranch(name: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      eng.switchBranch(name)
      log.info("trellis branch switched", { name })
      return { success: true, branch: name }
    } catch (err) {
      log.warn("branch switch failed", { name, error: String(err) })
      return undefined
    }
  }

  export async function deleteBranch(name: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const op = await eng.deleteBranch(name)
      log.info("trellis branch deleted", { name })
      return op
    } catch (err) {
      log.warn("branch delete failed", { name, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // Milestone schemas & functions
  // ---------------------------------------------------------------------------

  export const Milestone = z.object({
    id: z.string(),
    message: z.string().optional(),
    createdAt: z.string().optional(),
    createdBy: z.string().optional(),
    dueAt: z.string().optional(),
    fromOpHash: z.string().optional(),
    toOpHash: z.string().optional(),
    affectedFiles: z.array(z.string()),
  })

  function mapMilestone(m: any): z.infer<typeof Milestone> {
    return {
      id: m.id ?? m.hash ?? "",
      message: m.message ?? m.milestoneMessage,
      createdAt: m.createdAt ?? m.timestamp,
      createdBy: m.createdBy,
      dueAt: m.dueAt,
      fromOpHash: m.fromOpHash,
      toOpHash: m.toOpHash,
      affectedFiles: m.affectedFiles ?? [],
    }
  }

  export function milestones(dir?: string): z.infer<typeof Milestone>[] {
    const eng = engine(dir)
    if (!eng) return []
    return eng.listMilestones().map(mapMilestone)
  }

  // ---------------------------------------------------------------------------
  // Idea Garden schemas & functions
  // ---------------------------------------------------------------------------

  export const GardenCluster = z.object({
    id: z.string(),
    firstOp: z.string(),
    lastOp: z.string(),
    affectedFiles: z.array(z.string()),
    affectedSymbols: z.array(z.string()),
    estimatedIntent: z.string(),
    createdAt: z.string(),
    abandonedAt: z.string(),
    status: z.enum(["abandoned", "draft", "revived"]),
    detectedBy: z.string(),
    opCount: z.number(),
  })

  export const GardenStats = z.object({
    total: z.number(),
    abandoned: z.number(),
    draft: z.number(),
    revived: z.number(),
    totalOps: z.number(),
    totalFiles: z.number(),
  })

  function mapCluster(c: any): z.infer<typeof GardenCluster> {
    return {
      id: c.id,
      firstOp: c.firstOp,
      lastOp: c.lastOp,
      affectedFiles: c.affectedFiles ?? [],
      affectedSymbols: c.affectedSymbols ?? [],
      estimatedIntent: c.estimatedIntent ?? "",
      createdAt: c.createdAt ?? "",
      abandonedAt: c.abandonedAt ?? "",
      status: c.status ?? "abandoned",
      detectedBy: c.detectedBy ?? "",
      opCount: c.ops?.length ?? 0,
    }
  }

  export function gardenList(
    dir?: string,
    filter?: { status?: string; keyword?: string; file?: string; limit?: number },
  ) {
    const eng = engine(dir)
    if (!eng) return []
    const g = eng.garden()
    const clusters = g.search({
      status: filter?.status as any,
      keyword: filter?.keyword,
      file: filter?.file,
      limit: filter?.limit,
    })
    return clusters.map(mapCluster)
  }

  export function gardenStats(dir?: string): z.infer<typeof GardenStats> | undefined {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.garden().stats()
  }

  export function gardenRevive(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const ops = eng.garden().revive(id)
      if (!ops) return undefined
      log.info("trellis garden cluster revived", { id })
      return { success: true, opCount: ops.length }
    } catch (err) {
      log.warn("garden revive failed", { id, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // Eval schemas & functions
  // ---------------------------------------------------------------------------

  export const EvalSummarySchema = z.object({
    totalDecisions: z.number(),
    avgDecisionQuality: z.number(),
    totalIssues: z.number(),
    avgIssueHealth: z.number(),
    totalSessions: z.number(),
    avgSessionEfficiency: z.number(),
    topAgent: z.string().nullable(),
    worstIssue: z.string().nullable(),
    gardenClusters: z.number(),
  })

  export const AgentReportSchema = z.object({
    agent: z.string(),
    decisions: z.number(),
    avgQuality: z.number(),
    toolDistribution: z.record(z.string(), z.number()),
    issuesClosed: z.number(),
    issuesReopened: z.number(),
    avgCriteriaRate: z.number(),
    sessions: z.number(),
    avgSessionEfficiency: z.number(),
  })

  export const SessionReportSchema = z.object({
    session: z.string(),
    efficiency: z.object({
      session: z.string(),
      efficiency: z.number(),
      metrics: z.object({ density: z.number(), diversity: z.number(), progress: z.number(), backtrack: z.number() }),
      decisions: z.number(),
      issues: z.array(z.string()),
    }),
    decisions: z.array(
      z.object({
        id: z.string(),
        quality: z.number(),
        signals: z.object({
          output: z.number(),
          resolved: z.number(),
          notReverted: z.number(),
          convergence: z.number(),
          rationale: z.number(),
        }),
      }),
    ),
    issues: z.array(
      z.object({
        id: z.string(),
        health: z.number(),
        metrics: z.object({
          timeToClose: z.number().nullable(),
          criteriaRate: z.number(),
          reopens: z.number(),
          blocks: z.number(),
          chainLength: z.number(),
          pauses: z.number(),
        }),
      }),
    ),
  })

  export const IssueScoreSchema = z.object({
    id: z.string(),
    health: z.number(),
    metrics: z.object({
      timeToClose: z.number().nullable(),
      criteriaRate: z.number(),
      reopens: z.number(),
      blocks: z.number(),
      chainLength: z.number(),
      pauses: z.number(),
    }),
  })

  function evalData(dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    const decs = eng.queryDecisions()
    const iss = eng.listIssues()
    const ops = eng.getOps() as any[]
    const garden = eng.garden().stats()
    return { eng, decs, iss, ops, garden }
  }

  export function evalSummary(dir?: string) {
    const data = evalData(dir)
    if (!data) return undefined
    try {
      return evalSummaryFn(data.decs, data.iss, data.ops, data.garden.total)
    } catch (err) {
      log.warn("eval summary failed", { error: String(err) })
      return undefined
    }
  }

  export function evalAgent(agent: string, dir?: string) {
    const data = evalData(dir)
    if (!data) return undefined
    try {
      return evalAgentFn(agent, data.decs, data.iss, data.ops)
    } catch (err) {
      log.warn("eval agent failed", { agent, error: String(err) })
      return undefined
    }
  }

  export function evalSession(session: string, dir?: string) {
    const data = evalData(dir)
    if (!data) return undefined
    try {
      return evalSessionFn(session, data.decs, data.iss, data.ops)
    } catch (err) {
      log.warn("eval session failed", { session, error: String(err) })
      return undefined
    }
  }

  export function evalIssue(id: string, dir?: string) {
    const data = evalData(dir)
    if (!data) return undefined
    try {
      const issue = data.iss.find((i: any) => i.id === id)
      if (!issue) return undefined
      const chain = data.decs.filter((d: any) => d.relatedEntities?.includes(`issue:${id}`))
      return evalIssueFn(issue, chain, data.ops)
    } catch (err) {
      log.warn("eval issue failed", { id, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // EAV Store — direct query/mutation wrappers for Database tab
  // ---------------------------------------------------------------------------

  export const Fact = z.object({
    e: z.string(),
    a: z.string(),
    v: z.union([z.string(), z.number(), z.boolean()]),
  })

  export const LinkSchema = z.object({
    e1: z.string(),
    a: z.string(),
    e2: z.string(),
  })

  export const StoreMetaSchema = z.object({
    actor: z.string().optional(),
    actorKind: z.enum(["user", "agent", "system"]).optional(),
    source: z.string().optional(),
    sessionID: z.string().optional(),
    reason: z.string().optional(),
    relatedEntities: z.array(z.string()).optional(),
    supersedes: z.array(z.string()).optional(),
  })

  export type StoreMeta = z.infer<typeof StoreMetaSchema>

  export const CatalogEntrySchema = z.object({
    attribute: z.string(),
    type: z.enum(["string", "number", "boolean", "date", "mixed"]),
    cardinality: z.enum(["one", "many"]),
    distinctCount: z.number(),
    examples: z.array(z.union([z.string(), z.number(), z.boolean()])),
    min: z.number().optional(),
    max: z.number().optional(),
  })

  export const StoreStats = z.object({
    totalFacts: z.number(),
    totalLinks: z.number(),
    uniqueEntities: z.number(),
    uniqueAttributes: z.number(),
    catalogEntries: z.number(),
  })

  export function storeStats(dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.getStore().getStats()
  }

  export function storeCatalog(dir?: string) {
    const eng = engine(dir)
    if (!eng) return []
    return eng.getStore().getCatalog()
  }

  export function storeEntities(dir?: string, opts?: { type?: string; limit?: number; offset?: number }) {
    const eng = engine(dir)
    if (!eng) return []
    const store = eng.getStore()
    const facts = store.getFactsByAttribute("type")
    const grouped = new Map<string, string>()
    for (const f of facts) {
      if (opts?.type && f.v !== opts.type) continue
      if (!grouped.has(f.e)) grouped.set(f.e, String(f.v))
    }
    const labels = new Map<string, string>()
    for (const attr of ["name", "title", "label", "description"] as const) {
      for (const f of store.getFactsByAttribute(attr)) {
        if (labels.has(f.e)) continue
        const v = f.v
        if (typeof v === "string" && v.trim()) labels.set(f.e, v.trim())
      }
    }
    const entries = Array.from(grouped.entries()).map(([id, type]) => {
      const label = labels.get(id)
      return label ? { id, type, label } : { id, type }
    })
    const off = opts?.offset ?? 0
    const lim = opts?.limit ?? 200
    return entries.slice(off, off + lim)
  }

  export function storeEntity(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    const store = eng.getStore()
    const facts = store.getFactsByEntity(id)
    if (facts.length === 0) return undefined
    const links = store.getLinksByEntity(id)
    type RawFact = { e: unknown; a: unknown; v: unknown }
    type RawLink = { e1: unknown; a: unknown; e2: unknown }
    return {
      id,
      facts: facts.map((f: RawFact) => ({ e: String(f.e), a: String(f.a), v: f.v })),
      links: links.map((l: RawLink) => ({ e1: String(l.e1), a: String(l.a), e2: String(l.e2) })),
    }
  }

  export function storeFacts(
    dir?: string,
    opts?: { attribute?: string; value?: string; limit?: number; offset?: number },
  ) {
    const eng = engine(dir)
    if (!eng) return []
    const store = eng.getStore()
    let results: Array<{ e: string; a: string; v: unknown }>
    if (opts?.attribute && opts?.value) {
      results = store.getFactsByValue(opts.attribute, opts.value)
    } else if (opts?.attribute) {
      results = store.getFactsByAttribute(opts.attribute)
    } else {
      results = store.getAllFacts()
    }
    const off = opts?.offset ?? 0
    const lim = opts?.limit ?? 500
    return results.slice(off, off + lim).map((f) => ({ e: f.e, a: f.a, v: f.v }))
  }

  export function storeLinks(dir?: string, opts?: { entity?: string; attribute?: string }) {
    const eng = engine(dir)
    if (!eng) return []
    const store = eng.getStore()
    if (opts?.entity && opts?.attribute) return store.getLinksByEntityAndAttribute(opts.entity, opts.attribute)
    if (opts?.entity) return store.getLinksByEntity(opts.entity)
    if (opts?.attribute) return store.getLinksByAttribute(opts.attribute)
    return store.getAllLinks()
  }

  export function storeAssert(
    facts: Array<{ e: string; a: string; v: string | number | boolean }>,
    dir?: string,
    meta?: StoreMeta,
  ) {
    const d = dir ?? Instance.directory
    const eng = engine(d)
    if (!eng) return undefined
    const op = append(eng, d, "vcs:storeAssert", { facts }, meta)
    mutate(eng, op)
    return { added: facts.length }
  }

  export function storeRetract(
    facts: Array<{ e: string; a: string; v: string | number | boolean }>,
    dir?: string,
    meta?: StoreMeta,
  ) {
    const d = dir ?? Instance.directory
    const eng = engine(d)
    if (!eng) return undefined
    const op = append(eng, d, "vcs:storeRetract", { facts }, meta)
    mutate(eng, op)
    return { removed: facts.length }
  }

  export function storeLink(links: Array<{ e1: string; a: string; e2: string }>, dir?: string, meta?: StoreMeta) {
    const d = dir ?? Instance.directory
    const eng = engine(d)
    if (!eng) return undefined
    const op = append(eng, d, "vcs:storeLink", { links }, meta)
    mutate(eng, op)
    return { added: links.length }
  }

  export function storeUnlink(links: Array<{ e1: string; a: string; e2: string }>, dir?: string, meta?: StoreMeta) {
    const d = dir ?? Instance.directory
    const eng = engine(d)
    if (!eng) return undefined
    const op = append(eng, d, "vcs:storeUnlink", { links }, meta)
    mutate(eng, op)
    return { removed: links.length }
  }

  // ---------------------------------------------------------------------------
  // Dogfood mode
  // ---------------------------------------------------------------------------

  export const DogfoodSchema = z.object({
    active: z.boolean(),
    last: z.number(),
    created: z.array(z.string()),
    thresholds: z.object({
      decision: z.number(),
      issue: z.number(),
      session: z.number(),
      cooldown: z.number(),
    }),
  })

  export function dogfood() {
    return Dogfood.info()
  }

  export function dogfoodActive() {
    return Dogfood.active()
  }

  export async function dogfoodRun() {
    return Dogfood.run()
  }

  // ---------------------------------------------------------------------------
  // New 3.x engine methods
  // ---------------------------------------------------------------------------

  export function activeIssues(dir?: string): z.infer<typeof Issue>[] {
    const eng = engine(dir)
    if (!eng) return []
    return eng.getActiveIssues().map(mapIssue)
  }

  export function completionReadiness(dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.checkCompletionReadiness()
  }

  export async function setCriterionStatus(
    id: string,
    idx: number,
    status: "passed" | "failed" | "pending",
    dir?: string,
  ) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      await eng.setCriterionStatus(id, idx, status)
      log.info("criterion status set", { id, idx, status })
      const i = eng.getIssue(id)
      return i ? mapIssue(i) : undefined
    } catch (err) {
      log.warn("set criterion status failed", { id, idx, error: String(err) })
      return undefined
    }
  }

  export async function runCriteria(id: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const results = await eng.runCriteria(id)
      log.info("criteria run", { id, count: results.length })
      return results
    } catch (err) {
      log.warn("run criteria failed", { id, error: String(err) })
      return undefined
    }
  }

  // Diff helpers

  export const DiffResult = z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    modified: z.array(z.string()),
  })

  export function diffFromOp(hash: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      return eng.diffFromOp(hash)
    } catch (err) {
      log.warn("diffFromOp failed", { hash, error: String(err) })
      return undefined
    }
  }

  export function diffBranches(a: string, b: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      return eng.diffBranches(a, b)
    } catch (err) {
      log.warn("diffBranches failed", { a, b, error: String(err) })
      return undefined
    }
  }

  export function diffOps(from: string, to: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      return eng.diffOps(from, to)
    } catch (err) {
      log.warn("diffOps failed", { from, to, error: String(err) })
      return undefined
    }
  }

  export function mergeBranch(source: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      return eng.mergeBranch(source)
    } catch (err) {
      log.warn("mergeBranch failed", { source, error: String(err) })
      return undefined
    }
  }

  // Semantic diff/parse

  export function parseFile(content: string, path: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.parseFile(content, path)
  }

  export function semanticDiff(old: string, next: string, path: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    return eng.semanticDiff(old, next, path)
  }

  // Scaffold

  export const ProjectContextSchema = z.object({
    name: z.string(),
    language: z.string(),
    framework: z.string().optional(),
    buildTool: z.string().optional(),
    testRunner: z.string().optional(),
    confidence: z.number(),
  })

  export function scaffold(dir?: string) {
    const { inferProjectContext, loadProfile, saveProfile, hasProfile } = require("trellis")
    const d = dir ?? Instance.directory
    return {
      context: () => inferProjectContext(d),
      profile: () => loadProfile(d),
      saveProfile: (p: unknown) => saveProfile(d, p),
      hasProfile: () => hasProfile(d),
    }
  }

  // ---------------------------------------------------------------------------
  // Kernel-level features (Phase 3)
  // ---------------------------------------------------------------------------

  export function timeTravel(hash: string, dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    try {
      const ops = eng.getOps()
      const idx = ops.findIndex((op: any) => op.hash === hash)
      if (idx < 0) return undefined
      const snapshot = ops.slice(0, idx + 1)
      const facts = eng.getStore().getAllFacts()
      return {
        opIndex: idx,
        totalOps: ops.length,
        op: { kind: snapshot[idx].kind, timestamp: snapshot[idx].timestamp, hash: snapshot[idx].hash },
        entityCount: new Set(facts.map((f: any) => f.e)).size,
      }
    } catch (err) {
      log.warn("time travel failed", { hash, error: String(err) })
      return undefined
    }
  }

  export function queryGraph(pattern: { entity?: string; attribute?: string; value?: string }, dir?: string) {
    const eng = engine(dir)
    if (!eng) return []
    const s = eng.getStore()
    if (pattern.attribute && pattern.value) return s.getFactsByValue(pattern.attribute, pattern.value)
    if (pattern.attribute) return s.getFactsByAttribute(pattern.attribute)
    if (pattern.entity) return s.getFactsByEntity(pattern.entity)
    return s.getAllFacts().slice(0, 500)
  }

  // Ontology management via EAV conventions
  export function listOntologies(dir?: string) {
    const eng = engine(dir)
    if (!eng) return []
    const s = eng.getStore()
    const types = s.getFactsByAttribute("type")
    const counts = new Map<string, number>()
    for (const f of types) {
      const t = String(f.v)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
  }

  export function workspaceConfig(dir?: string) {
    const eng = engine(dir)
    if (!eng) return undefined
    const s = eng.getStore()
    const stats = s.getStats()
    const st = eng.status()
    const telos = getTelos(dir)
    return {
      branch: st.branch,
      totalOps: st.totalOps,
      trackedFiles: st.trackedFiles,
      store: stats,
      telos: telos ?? null,
      ontologies: listOntologies(dir),
    }
  }

  // ---------------------------------------------------------------------------
  // Plan-Approval Plugin (Phase 4)
  // ---------------------------------------------------------------------------

  export const PlanSchema = z.object({
    id: z.string(),
    status: z.enum(["drafting", "submitted", "approved", "rejected"]),
    title: z.string(),
    description: z.string().optional(),
    operations: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        entityId: z.string().optional(),
        entityType: z.string().optional(),
        description: z.string().optional(),
        sequence: z.number(),
      }),
    ),
    createdAt: z.string(),
    submittedAt: z.string().optional(),
    resolvedAt: z.string().optional(),
    resolvedBy: z.string().optional(),
    rejectionReason: z.string().optional(),
  })

  function pm(dir?: string) {
    const d = dir ?? Instance.directory
    return planManagers.get(key(d))
  }

  export async function enterPlanMode(title: string, description?: string, dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      const id = await mgr.enterPlanMode(title, description)
      log.info("plan mode entered", { id, title })
      return { id, title }
    } catch (err) {
      log.warn("enter plan mode failed", { error: String(err) })
      return undefined
    }
  }

  export function pendingPlan(dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    return mgr.getActivePlan()
  }

  export function isInPlanMode(dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return false
    return mgr.isInPlanMode()
  }

  export async function planOperation(
    op: { kind: string; entityId?: string; entityType?: string; description?: string },
    dir?: string,
  ) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      const id = await mgr.addOperation(op)
      return { id }
    } catch (err) {
      log.warn("plan operation failed", { error: String(err) })
      return undefined
    }
  }

  export async function submitPlan(dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      const plan = await mgr.submitPlan()
      log.info("plan submitted", { id: plan.id })
      return plan
    } catch (err) {
      log.warn("submit plan failed", { error: String(err) })
      return undefined
    }
  }

  export async function approvePlan(dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      const result = await mgr.approvePlan("user:trent")
      log.info("plan approved", { id: result.planId, ops: result.operationsExecuted })
      return result
    } catch (err) {
      log.warn("approve plan failed", { error: String(err) })
      return undefined
    }
  }

  export async function rejectPlan(reason?: string, dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      await mgr.rejectPlan(reason, "user:trent")
      log.info("plan rejected", { reason })
      return { success: true }
    } catch (err) {
      log.warn("reject plan failed", { error: String(err) })
      return undefined
    }
  }

  export async function cancelPlan(dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return undefined
    try {
      await mgr.cancelPlan()
      log.info("plan cancelled")
      return { success: true }
    } catch (err) {
      log.warn("cancel plan failed", { error: String(err) })
      return undefined
    }
  }

  export function listPlans(status?: string, dir?: string) {
    const mgr = pm(dir)
    if (!mgr) return []
    return mgr.listPlans(status)
  }

  // ---------------------------------------------------------------------------
  // Proactive Watcher (Phase 5)
  // ---------------------------------------------------------------------------

  const watchers = new Map<string, any>()

  export const SuggestionSchema = z.object({
    id: z.string(),
    ruleId: z.string(),
    description: z.string(),
    entityId: z.string().optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    createdAt: z.string(),
    dismissed: z.boolean(),
  })

  export const WatcherRuleSchema = z.object({
    id: z.string(),
    description: z.string(),
  })

  const SEMANTIC_MENTION_REL = "mentions"
  const SEMANTIC_SYSTEM_REL = new Set(["knows", "produced", "consulted"])

  function brokenSemanticLinks(dir: string): Array<{ source: string; relation: string; target: string }> {
    if (!storeStats(dir)) return []
    const broken: Array<{ source: string; relation: string; target: string }> = []
    for (const link of storeLinks(dir) as Link[]) {
      if (SEMANTIC_SYSTEM_REL.has(link.a)) continue
      const cmsField = link.a.endsWith(".mentions")
      if (
        link.a !== SEMANTIC_MENTION_REL &&
        !link.e1.startsWith("note:") &&
        !link.e1.startsWith("file:") &&
        !cmsField
      ) {
        continue
      }
      if (storeEntity(link.e2, dir)) continue
      broken.push({ source: link.e1, relation: link.a, target: link.e2 })
    }
    return broken.slice(0, 20)
  }

  function watcher(dir?: string) {
    const d = dir ?? Instance.directory
    return watchers.get(key(d))
  }

  export function initWatcher(dir?: string) {
    const d = dir ?? Instance.directory
    const k = key(d)
    if (watchers.has(k)) return
    try {
      const { WatcherManager } = require("trellis/plugins/proactive-watcher")
      const mgr = new WatcherManager()

      // Default rules
      mgr.addRule({
        id: "stale-issue",
        description: "Issues in_progress > 48h without new ops",
        condition: () => {
          const eng = engine(d)
          if (!eng) return false
          const active = eng.getActiveIssues()
          const now = Date.now()
          return active.some((i: any) => {
            const started = new Date(i.createdAt).getTime()
            return now - started > 48 * 60 * 60 * 1000
          })
        },
        agentId: "proactive-agent",
        promptFactory: () => "Stale in-progress issue detected. Consider reviewing or pausing.",
      })

      mgr.addRule({
        id: "orphan-workunits",
        description: "WorkUnits not linked to any cycle",
        condition: () => {
          const wus = workUnits(d)
          return wus.some((w) => !w.cycle)
        },
        agentId: "proactive-agent",
        promptFactory: () => "Orphan work units found. Consider triaging into a cycle.",
      })

      mgr.addRule({
        id: "broken-semantic-links",
        description: "WikiLink targets in notes/markdown with no matching entity",
        condition: () => {
          try {
            return brokenSemanticLinks(d).length > 0
          } catch {
            return false
          }
        },
        agentId: "proactive-agent",
        promptFactory: () => {
          try {
            const broken = brokenSemanticLinks(d)
            if (!broken.length) return "Broken semantic links detected."
            const lines = broken
              .slice(0, 8)
              .map(
                (item: { source: string; relation: string; target: string }) =>
                  `- ${item.source} --[${item.relation}]--> ${item.target}`,
              )
            return [
              "Broken semantic links found (WikiLink targets missing from graph).",
              "Create stub entities or link to existing ones, then update the markdown.",
              ...lines,
            ].join("\n")
          } catch {
            return "Broken semantic links detected in notes or markdown."
          }
        },
      })

      watchers.set(k, mgr)
      log.info("proactive watcher initialized", { directory: d })
    } catch (err) {
      log.warn("proactive watcher init failed (non-fatal)", { error: String(err) })
    }
  }

  export function watcherRules(dir?: string) {
    const mgr = watcher(dir)
    if (!mgr) return []
    try {
      return mgr.getRules?.() ?? []
    } catch {
      return []
    }
  }

  export function watcherSuggestions(dir?: string) {
    const mgr = watcher(dir)
    if (!mgr) return []
    try {
      return mgr.getSuggestions?.() ?? []
    } catch {
      return []
    }
  }

  export function dismissSuggestion(id: string, dir?: string) {
    const mgr = watcher(dir)
    if (!mgr) return false
    try {
      mgr.dismiss?.(id)
      return true
    } catch {
      return false
    }
  }

  export function addWatcherRule(rule: { id: string; description: string; condition?: () => boolean }, dir?: string) {
    const mgr = watcher(dir)
    if (!mgr) return false
    try {
      mgr.addRule(rule)
      return true
    } catch {
      return false
    }
  }

  export function removeWatcherRule(id: string, dir?: string) {
    const mgr = watcher(dir)
    if (!mgr) return false
    try {
      mgr.removeRule?.(id)
      return true
    } catch {
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Kernel-based Idea Garden (Phase 6)
  // ---------------------------------------------------------------------------

  const ideaGardens = new Map<string, any>()

  export const RecoverableIdeaSchema = z.object({
    id: z.string(),
    type: z.enum(["rejected_plan", "archived_conversation", "unexplored_alternative"]),
    title: z.string(),
    description: z.string().optional(),
    sourceId: z.string(),
    createdAt: z.string(),
  })

  function ideaGarden(dir?: string) {
    const d = dir ?? Instance.directory
    const k = key(d)
    if (ideaGardens.has(k)) return ideaGardens.get(k)
    const kernel = kernels.get(k)
    if (!kernel) return undefined
    try {
      const { IdeaGarden } = require("trellis/plugins/idea-garden")
      const garden = new IdeaGarden(kernel)
      ideaGardens.set(k, garden)
      return garden
    } catch {
      return undefined
    }
  }

  export function harvestIdeas(dir?: string) {
    const g = ideaGarden(dir)
    if (!g) return []
    try {
      return g.harvestIdeas()
    } catch {
      return []
    }
  }

  export async function resurrectPlan(id: string, dir?: string) {
    const g = ideaGarden(dir)
    if (!g) return undefined
    try {
      const newId = await g.resurrectPlan(id)
      log.info("plan resurrected from idea garden", { id, newId })
      return { id: newId }
    } catch (err) {
      log.warn("resurrect plan failed", { id, error: String(err) })
      return undefined
    }
  }

  // ---------------------------------------------------------------------------
  // Agent Memory Plugin (Phase 6)
  // ---------------------------------------------------------------------------

  const memoryManagers = new Map<string, any>()

  export const ConversationSchema = z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    createdAt: z.string(),
    messageCount: z.number(),
  })

  function memory(dir?: string) {
    const d = dir ?? Instance.directory
    const k = key(d)
    if (memoryManagers.has(k)) return memoryManagers.get(k)
    const kernel = kernels.get(k)
    if (!kernel) return undefined
    try {
      const { GraphContextManager } = require("trellis/plugins/agent-memory")
      const mgr = new GraphContextManager(kernel)
      memoryManagers.set(k, mgr)
      return mgr
    } catch {
      return undefined
    }
  }

  export async function createConversation(title: string, opts?: { agentId?: string; model?: string }, dir?: string) {
    const mgr = memory(dir)
    if (!mgr) return undefined
    try {
      const id = await mgr.createConversation({ title, ...opts })
      log.info("conversation created", { id, title })
      return { id, title }
    } catch (err) {
      log.warn("create conversation failed", { error: String(err) })
      return undefined
    }
  }

  export function listConversations(status?: string, dir?: string) {
    const mgr = memory(dir)
    if (!mgr) return []
    try {
      return mgr.listConversations(status)
    } catch {
      return []
    }
  }

  export async function resumeConversation(id: string, dir?: string) {
    const mgr = memory(dir)
    if (!mgr) return undefined
    try {
      await mgr.resumeConversation(id)
      return { id, resumed: true }
    } catch (err) {
      log.warn("resume conversation failed", { id, error: String(err) })
      return undefined
    }
  }

  export function conversationHistory(dir?: string) {
    const mgr = memory(dir)
    if (!mgr) return []
    try {
      return mgr.getHistory()
    } catch {
      return []
    }
  }

  export async function archiveConversation(dir?: string) {
    const mgr = memory(dir)
    if (!mgr) return false
    try {
      await mgr.archiveConversation()
      return true
    } catch {
      return false
    }
  }
}

import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useSDK } from "./sdk"
import { useServer } from "./server"
import { useActiveTaskOptional } from "./active-task"
import type { Fetcher } from "@/utils/server"

export type TrellisGraphStats = {
  branch: string
  totalOps: number
  trackedFiles: number
  hiddenFiles: number
  hiddenDirs: number
  hiddenNodes: number
  issueCount: number
  activeIssues: number
  nodeCount: number
  edgeCount: number
  avgIssueHealth: number
}

export type TrellisBranch = {
  name: string
  isCurrent: boolean
  createdAt?: string
}

export type TrellisMilestone = {
  id: string
  message?: string
  createdAt?: string
  createdBy?: string
  dueAt?: string
  fromOpHash?: string
  toOpHash?: string
  affectedFiles: string[]
}

export type TrellisGardenCluster = {
  id: string
  firstOp: string
  lastOp: string
  affectedFiles: string[]
  affectedSymbols: string[]
  estimatedIntent: string
  createdAt: string
  abandonedAt: string
  status: "abandoned" | "draft" | "revived"
  detectedBy: string
  opCount: number
}

export type TrellisGardenStats = {
  total: number
  abandoned: number
  draft: number
  revived: number
  totalOps: number
  totalFiles: number
}

export type TrellisEvalSummary = {
  totalDecisions: number
  avgDecisionQuality: number
  totalIssues: number
  avgIssueHealth: number
  totalSessions: number
  avgSessionEfficiency: number
  topAgent: string | null
  worstIssue: string | null
  gardenClusters: number
}

export type TrellisAgentReport = {
  agent: string
  decisions: number
  avgQuality: number
  toolDistribution: Record<string, number>
  issuesClosed: number
  issuesReopened: number
  avgCriteriaRate: number
  sessions: number
  avgSessionEfficiency: number
}

export type TrellisIssueScore = {
  id: string
  health: number
  metrics: {
    timeToClose: number | null
    criteriaRate: number
    reopens: number
    blocks: number
    chainLength: number
    pauses: number
  }
}

export type TrellisDogfood = {
  active: boolean
  last: number
  created: string[]
  thresholds: {
    decision: number
    issue: number
    session: number
    cooldown: number
  }
}

export type TrellisBacklink = {
  filePath: string
  line: number
  context: string
}

export type TrellisRef = {
  namespace: string
  target: string
  state: "resolved" | "stale" | "broken"
  entityId?: string
  title?: string
  staleReason?: "renamed" | "deleted"
  source: { filePath: string; line: number; col: number; context: string }
}

export type TrellisRefs = {
  outgoing: TrellisRef[]
  incoming: TrellisBacklink[]
}

export type TrellisGraphNode = {
  id: string
  label: string
  type: string
  status?: string
  priority?: string
  size?: number
}

export type TrellisGraphEdge = {
  source: string
  target: string
  type: string
}

export type TrellisGraphData = {
  nodes: TrellisGraphNode[]
  edges: TrellisGraphEdge[]
  hiddenFiles: number
  hiddenDirs: number
  hiddenNodes: number
}

export type TrellisOp = {
  kind: string
  timestamp: string
  hash: string
  filePath?: string
  branchName?: string
  milestoneMessage?: string
  toolName?: string
  outputSummary?: string
  storeEntities?: string[]
  storeAttrs?: string[]
}

export type TrellisDecision = {
  id: string
  toolName: string
  input?: Record<string, unknown>
  outputSummary?: string
  context?: string
  relatedEntities?: string[]
  custom?: Record<string, unknown>
  timestamp: string
}

export type TrellisIssue = {
  id: string
  title: string
  status: string
  priority: string
  labels: string[]
  description?: string
  assignee?: string
  branch?: string
  isBlocked?: boolean
  blockedBy?: string[]
  blocking?: string[]
  criteriaCount: number
  criteriaPassed: number
  criteria?: Array<{
    id: string
    description?: string
    command?: string
    status?: string
    lastRunAt?: string
    lastOutput?: string
  }>
  createdAt: string
}

export type TrellisStoreFact = {
  e: string
  a: string
  v: unknown
}

export type TrellisStoreLink = {
  e1: string
  a: string
  e2: string
}

export type TrellisEntity = {
  id: string
  facts: TrellisStoreFact[]
  links: TrellisStoreLink[]
}

export type WorkUnit = {
  id: string
  title: string
  cycle: string
  specPath: string
  status: "backlog" | "in_progress" | "done"
  priority: "critical" | "high" | "medium" | "low"
  tags: string[]
  assignee?: string
  unassigned: boolean
  criteriaCount: number
  criteriaPassed: number
  criteria?: Array<{
    id: string
    description: string
    command?: string
    status: "pending" | "passed" | "failed"
    lastRunAt?: string
    lastOutput?: string
    verifiedBy?: string
  }>
  createdAt: string
  updatedAt: string
  closedAt?: string
}

export type Cycle = {
  id: string
  title: string
  milestone?: string
  purpose: string
  criteria?: Array<{
    id: string
    intent: string
    metric?: string
    verifiable: boolean
  }>
  status: "backlog" | "in_progress" | "done"
  horizon: "now" | "next" | "later"
  createdAt: string
}

export type MilestoneEpic = {
  id: string
  title: string
  roadmap: string
  targetDate?: string
  status: "active" | "completed"
  unassigned: boolean
  createdAt: string
}

export type Roadmap = {
  id: string
  title: string
  horizon: "now" | "next" | "later"
  status: "active" | "completed"
  createdAt: string
}

export type Telos = {
  mission: string
  vision?: string
  createdAt: string
  updatedAt: string
}

export type TrellisPlanOperation = {
  id: string
  kind: string
  entityId?: string
  entityType?: string
  description?: string
  sequence: number
}

export type TrellisPlan = {
  id: string
  status: "drafting" | "submitted" | "approved" | "rejected"
  title: string
  description?: string
  operations: TrellisPlanOperation[]
  createdAt: string
  submittedAt?: string
  resolvedAt?: string
  resolvedBy?: string
  rejectionReason?: string
}

export type TrellisSuggestion = {
  id: string
  ruleId: string
  description: string
  entityId?: string
  priority?: "high" | "medium" | "low"
  createdAt: string
  dismissed: boolean
}

export type TrellisWatcherRule = {
  id: string
  description: string
}

export type TrellisRecoverableIdea = {
  id: string
  type: "rejected_plan" | "archived_conversation" | "unexplored_alternative"
  title: string
  description?: string
  sourceId: string
  createdAt: string
}

export type TrellisConversation = {
  id: string
  title: string
  status: string
  createdAt: string
  messageCount: number
}

export type TrellisDiffResult = {
  added: string[]
  removed: string[]
  modified: string[]
}

export type TrellisWorkspaceConfig = {
  branch: string
  totalOps: number
  trackedFiles: number
  store: {
    totalFacts: number
    totalLinks: number
    uniqueEntities: number
    uniqueAttributes: number
    catalogEntries: number
  }
  telos: Telos | null
  ontologies: Array<{ type: string; count: number }>
}

export type TrellisStoreEntity = {
  id: string
  type: string
  label?: string
}

type Store = {
  ready: boolean
  error?: string
  revision: number
  sig?: string
  stats?: TrellisGraphStats
  issues: TrellisIssue[]
  ops: TrellisOp[]
  decisions: TrellisDecision[]
  dogfood?: TrellisDogfood
  workUnits: WorkUnit[]
  cycles: Cycle[]
  milestones: MilestoneEpic[]
  roadmaps: Roadmap[]
  telos?: Telos
  planMode: boolean
  pendingPlan?: TrellisPlan
  suggestions: TrellisSuggestion[]
  storeEntities: TrellisStoreEntity[]
}

const POLL_MS = 5_000
const PAGE = 1000

export function trellisUrl(url: string, directory: string, path: string) {
  const req = new URL(`/trellis${path}`, url)
  req.searchParams.set("directory", directory)
  return req.toString()
}

function pick(run: Fetcher | string, url: string, directory?: string, path?: string) {
  if (typeof run === "function") return [run, url, directory!, path!] as const
  return [fetch as Fetcher, run, url, directory!] as const
}

function pickBody(run: Fetcher | string, url: string, directory?: string, path?: string | unknown, body?: unknown) {
  if (typeof run === "function") return [run, url, directory!, path as string, body] as const
  return [fetch as Fetcher, run, url, directory!, path] as const
}

function syntheticStoreEntity(path?: string): TrellisEntity | undefined {
  const match = path?.match(/^\/store\/entity\/(.+)$/)
  if (!match) return undefined
  const id = decodeURIComponent(match[1])
  if (!id.startsWith("project:")) return undefined
  return { id, facts: [], links: [] }
}

async function trellisGet<T>(
  run: Fetcher | string,
  url: string,
  directory?: string,
  path?: string,
): Promise<T | undefined> {
  const synthetic = syntheticStoreEntity(path)
  if (synthetic) return synthetic as T

  const [fn, base, dir, next] = pick(run, url, directory, path)
  let res: Response
  try {
    res = await fn(trellisUrl(base, dir, next))
  } catch {
    return undefined
  }
  if (!res.ok) return undefined
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.warn(`[trellis] Failed to parse JSON from ${path}:`, err)
    return undefined
  }
}

async function trellisPost<T>(
  run: Fetcher | string,
  url: string,
  directory?: string,
  path?: string | unknown,
  body?: unknown,
): Promise<T | undefined> {
  const [fn, base, dir, next, data] = pickBody(run, url, directory, path, body)
  let res: Response
  try {
    res = await fn(trellisUrl(base, dir, next), {
      method: "POST",
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    })
  } catch {
    return undefined
  }
  if (!res.ok) return undefined
  return res.json()
}

async function trellisPut<T>(
  run: Fetcher | string,
  url: string,
  directory?: string,
  path?: string | unknown,
  body?: unknown,
): Promise<T | undefined> {
  const [fn, base, dir, next, data] = pickBody(run, url, directory, path, body)
  let res: Response
  try {
    res = await fn(trellisUrl(base, dir, next), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  } catch {
    return undefined
  }
  if (!res.ok) return undefined
  return res.json()
}

async function trellisDelete<T>(
  run: Fetcher | string,
  url: string,
  directory?: string,
  path?: string,
): Promise<T | undefined> {
  const [fn, base, dir, next] = pick(run, url, directory, path)
  let res: Response
  try {
    res = await fn(trellisUrl(base, dir, next), { method: "DELETE" })
  } catch {
    return undefined
  }
  if (!res.ok) return undefined
  return res.json()
}

const trellisContext = createSimpleContext({
  name: "Trellis",
  gate: false,
  init: () => {
    const sdk = useSDK()
    const server = useServer()
    const task = useActiveTaskOptional()
    const [store, set] = createStore<Store>({
      ready: false,
      revision: 0,
      issues: [],
      ops: [],
      decisions: [],
      dogfood: undefined,
      workUnits: [],
      cycles: [],
      milestones: [],
      roadmaps: [],
      telos: undefined,
      planMode: false,
      pendingPlan: undefined,
      suggestions: [],
      storeEntities: [],
    })

    const tracked = async <T,>(type: "criteria" | "sync", label: string, fn: () => Promise<T>): Promise<T> => {
      const id = task?.addJob({ type, label, status: "running" })
      try {
        const result = await fn()
        if (id) task?.removeJob(id)
        return result
      } catch (err) {
        if (id) task?.updateJob(id, { status: "error" })
        throw err
      }
    }

    const url = createMemo(() => sdk.url)
    const dir = createMemo(() => sdk.directory)
    const run = sdk.fetch
    let loaded = 0

    const snap = (
      stats: TrellisGraphStats | undefined,
      issues: TrellisIssue[] | undefined,
      workUnits: WorkUnit[] | undefined,
      cycles: Cycle[] | undefined,
      milestones: MilestoneEpic[] | undefined,
      roadmaps: Roadmap[] | undefined,
      suggestions: TrellisSuggestion[] | undefined,
    ) =>
      JSON.stringify({
        stats,
        issues: issues?.map((i) => [
          i.id,
          i.title,
          i.status,
          i.priority,
          i.assignee,
          i.branch,
          i.isBlocked,
          i.blockedBy,
          i.blocking,
          i.criteriaCount,
          i.criteriaPassed,
        ]),
        workUnits: workUnits?.map((u) => [
          u.id,
          u.title,
          u.status,
          u.priority,
          u.assignee,
          u.criteriaCount,
          u.criteriaPassed,
          u.updatedAt,
        ]),
        cycles: cycles?.map((c) => [c.id, c.title, c.status, c.horizon]),
        milestones: milestones?.map((m) => [m.id, m.title, m.status, m.targetDate]),
        roadmaps: roadmaps?.map((r) => [r.id, r.title, r.status, r.horizon]),
        suggestions: suggestions?.map((s) => [s.id, s.dismissed, s.priority]),
      })

    const refresh = async () => {
      try {
        const [stats, issues, dog, workUnits, cycles, milestones, roadmaps, telos, mode, suggestions] =
          await Promise.all([
            trellisGet<TrellisGraphStats>(run, url(), dir(), "/stats"),
            trellisGet<TrellisIssue[]>(run, url(), dir(), "/issues"),
            trellisGet<TrellisDogfood>(run, url(), dir(), "/dogfood"),
            trellisGet<WorkUnit[]>(run, url(), dir(), "/workunits"),
            trellisGet<Cycle[]>(run, url(), dir(), "/cycles"),
            trellisGet<MilestoneEpic[]>(run, url(), dir(), "/milestones"),
            trellisGet<Roadmap[]>(run, url(), dir(), "/roadmaps"),
            trellisGet<Telos>(run, url(), dir(), "/telos"),
            trellisGet<{ active: boolean }>(run, url(), dir(), "/plans/mode"),
            trellisGet<TrellisSuggestion[]>(run, url(), dir(), "/watcher/suggestions"),
          ])
        if (stats) set("stats", reconcile(stats))
        if (issues) set("issues", reconcile(issues, { key: "id" }))
        if (workUnits) set("workUnits", reconcile(workUnits, { key: "id" }))
        if (cycles) set("cycles", reconcile(cycles, { key: "id" }))
        if (milestones) set("milestones", reconcile(milestones, { key: "id" }))
        if (roadmaps) set("roadmaps", reconcile(roadmaps, { key: "id" }))
        set("telos", telos)
        set("dogfood", dog)
        set("planMode", mode?.active ?? false)
        if (suggestions) set("suggestions", reconcile(suggestions, { key: "id" }))
        if (mode?.active) {
          const pending = await trellisGet<TrellisPlan>(run, url(), dir(), "/plans/pending")
          set("pendingPlan", pending ?? undefined)
        } else {
          set("pendingPlan", undefined)
        }
        set("ready", true)
        set("error", undefined)
        const sig = snap(stats, issues, workUnits, cycles, milestones, roadmaps, suggestions)
        if (sig !== store.sig) {
          set("sig", sig)
          set("revision", store.revision + 1)
        }
      } catch (err) {
        set("error", String(err))
      }
    }

    const fetchStoreEntities = async (force = false) => {
      if (!force && loaded && Date.now() - loaded < POLL_MS && store.storeEntities.length > 0)
        return store.storeEntities
      const out: TrellisStoreEntity[] = []
      for (let offset = 0; ; offset += PAGE) {
        const page = await trellisGet<TrellisStoreEntity[]>(
          run,
          url(),
          dir(),
          `/store/entities?limit=${PAGE}&offset=${offset}`,
        )
        if (!page) return store.storeEntities.length > 0 ? store.storeEntities : out
        out.push(...page)
        if (page.length < PAGE) break
      }
      loaded = Date.now()
      set("storeEntities", reconcile(out, { key: "id" }))
      return out
    }

    const getIssue = async (id: string) => {
      // Look up from cached issues since individual issue endpoint may not be available
      return store.issues.find((i) => i.id === id)
    }

    const runCriteria = async (issueId: string) => {
      return tracked("criteria", "Running criteria...", async () => {
        try {
          const res = await run(`${url()}/trellis/issues/${issueId}/check?directory=${encodeURIComponent(dir())}`, {
            method: "POST",
          })
          if (!res.ok) throw new Error("Failed to run criteria")
          return res.json()
        } catch (err) {
          console.warn("Criteria check endpoint not available, will refresh to get latest status")
          return { success: false, error: "Endpoint not available" }
        }
      })
    }

    const updateIssueStatus = async (issueId: string, status: string) => {
      const idx = store.issues.findIndex((i) => i.id === issueId)
      if (idx >= 0) set("issues", idx, "status", status)
      const result = await trellisPut<TrellisIssue>(run, url(), dir(), `/issues/${issueId}`, { status })
      if (result) await refresh()
      return { success: !!result }
    }

    const updateIssue = async (
      issueId: string,
      updates: Partial<Pick<TrellisIssue, "title" | "description" | "status" | "priority" | "labels" | "assignee">>,
    ) => {
      const result = await trellisPut<TrellisIssue>(run, url(), dir(), `/issues/${issueId}`, updates)
      if (result) await refresh()
      return result
    }

    const startIssue = async (issueId: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/start`)
      if (result) await refresh()
      return result
    }

    const pauseIssue = async (issueId: string, note?: string) => {
      const result = await trellisPost<TrellisIssue>(
        run,
        url(),
        dir(),
        `/issues/${issueId}/pause`,
        note ? { note } : undefined,
      )
      if (result) await refresh()
      return result
    }

    const resumeIssue = async (issueId: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/resume`)
      if (result) await refresh()
      return result
    }

    const triageIssue = async (issueId: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/triage`)
      if (result) await refresh()
      return result
    }

    const closeIssue = async (issueId: string, confirm?: boolean) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/close`, { confirm })
      if (result) await refresh()
      return result
    }

    const reopenIssue = async (issueId: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/reopen`)
      if (result) await refresh()
      return result
    }

    const assignIssue = async (issueId: string, agent: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/assign`, { agent })
      if (result) await refresh()
      return result
    }

    const addCriterion = async (issueId: string, description: string, command?: string) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/criteria`, {
        description,
        command,
      })
      if (result) await refresh()
      return result
    }

    const fetchOps = async (limit?: number, file?: string, entity?: string) => {
      const params: string[] = []
      if (limit) params.push(`limit=${limit}`)
      if (file) params.push(`file=${encodeURIComponent(file)}`)
      if (entity) params.push(`entity=${encodeURIComponent(entity)}`)
      const qs = params.length ? `?${params.join("&")}` : ""
      const result = await trellisGet<TrellisOp[]>(run, url(), dir(), `/ops${qs}`)
      if (result) set("ops", reconcile(result, { key: "hash" }))
      return result ?? []
    }

    const fetchDecisions = async (filter?: { tool?: string; agent?: string; limit?: number }) => {
      const params: string[] = []
      if (filter?.tool) params.push(`tool=${encodeURIComponent(filter.tool)}`)
      if (filter?.agent) params.push(`agent=${encodeURIComponent(filter.agent)}`)
      if (filter?.limit) params.push(`limit=${filter.limit}`)
      const qs = params.length ? `?${params.join("&")}` : ""
      const result = await trellisGet<TrellisDecision[]>(run, url(), dir(), `/decisions${qs}`)
      if (result) set("decisions", reconcile(result, { key: "id" }))
      return result ?? []
    }

    const fetchDecisionChain = async (entity: string) => {
      return (
        (await trellisGet<TrellisDecision[]>(run, url(), dir(), `/decisions/chain/${encodeURIComponent(entity)}`)) ?? []
      )
    }

    const fetchBranches = async () => {
      return (await trellisGet<TrellisBranch[]>(run, url(), dir(), "/branches")) ?? []
    }

    const createBranch = async (name: string) => {
      return trellisPost<unknown>(run, url(), dir(), "/branches", { name })
    }

    const switchBranch = async (name: string) => {
      return tracked("sync", `Switching to ${name}...`, () =>
        trellisPost<{ success: boolean; branch: string }>(run, url(), dir(), "/branches/switch", { name }),
      )
    }

    const fetchMilestones = async () => {
      return (await trellisGet<TrellisMilestone[]>(run, url(), dir(), "/milestones")) ?? []
    }

    const fetchBacklinks = async (entity: string) => {
      return (await trellisGet<TrellisBacklink[]>(run, url(), dir(), `/backlinks/${encodeURIComponent(entity)}`)) ?? []
    }

    const fetchRefs = async (entity: string) => {
      return (
        (await trellisGet<TrellisRefs>(run, url(), dir(), `/refs/${encodeURIComponent(entity)}`)) ?? {
          outgoing: [],
          incoming: [],
        }
      )
    }

    const fetchEntity = async (id: string) => {
      // Graph synthesizes project:* nodes from the workspace root; they are not
      // persisted in the trellis store, so skip the HTTP round-trip.
      if (id.startsWith("project:")) {
        return { id, facts: [], links: [] } satisfies TrellisEntity
      }
      return trellisGet<TrellisEntity>(run, url(), dir(), `/store/entity/${encodeURIComponent(id)}`)
    }

    const assertFacts = async (facts: Array<{ e: string; a: string; v: string | number | boolean }>) => {
      return trellisPost<{ added: number }>(run, url(), dir(), "/store/assert", { facts })
    }

    const retractFacts = async (facts: Array<{ e: string; a: string; v: string | number | boolean }>) => {
      return trellisPost<{ removed: number }>(run, url(), dir(), "/store/retract", { facts })
    }

    const fetchGraph = async (opts?: {
      includeHidden?: boolean
      includeImports?: boolean
      includeLinks?: boolean
      includeOps?: boolean
      opsLimit?: number
    }) => {
      const params: string[] = []
      if (opts?.includeHidden) params.push("includeHidden=true")
      if (opts?.includeImports === false) params.push("includeImports=false")
      if (opts?.includeLinks === false) params.push("includeLinks=false")
      if (opts?.includeOps) params.push("includeOps=true")
      if (opts?.opsLimit) params.push(`opsLimit=${opts.opsLimit}`)
      const qs = params.length ? `?${params.join("&")}` : ""
      return (
        (await trellisGet<TrellisGraphData>(run, url(), dir(), `/graph${qs}`)) ?? {
          nodes: [],
          edges: [],
          hiddenFiles: 0,
          hiddenDirs: 0,
          hiddenNodes: 0,
        }
      )
    }

    const createSprite = async (name: string, opts?: { url?: string; description?: string }) => {
      return trellisPost<{ success: boolean }>(run, url(), dir(), "/sprites", { name, ...opts })
    }

    const deleteSprite = async (name: string) => {
      return trellisDelete<{ success: boolean }>(run, url(), dir(), `/sprites/${name}`)
    }

    const createMilestone = async (message: string) => {
      return tracked("sync", "Creating milestone...", () =>
        trellisPost<unknown>(run, url(), dir(), "/milestones", { message }),
      )
    }

    const fetchGarden = async (filter?: { status?: string; keyword?: string; file?: string; limit?: number }) => {
      const params: string[] = []
      if (filter?.status) params.push(`status=${encodeURIComponent(filter.status)}`)
      if (filter?.keyword) params.push(`keyword=${encodeURIComponent(filter.keyword)}`)
      if (filter?.file) params.push(`file=${encodeURIComponent(filter.file)}`)
      if (filter?.limit) params.push(`limit=${filter.limit}`)
      const qs = params.length ? `?${params.join("&")}` : ""
      return (await trellisGet<TrellisGardenCluster[]>(run, url(), dir(), `/garden${qs}`)) ?? []
    }

    const fetchGardenStats = async () => {
      return trellisGet<TrellisGardenStats>(run, url(), dir(), "/garden/stats")
    }

    const reviveCluster = async (id: string) => {
      return trellisPost<{ success: boolean; opCount: number }>(
        run,
        url(),
        dir(),
        `/garden/${encodeURIComponent(id)}/revive`,
      )
    }

    const fetchEvalSummary = async () => {
      return trellisGet<TrellisEvalSummary>(run, url(), dir(), "/eval/summary")
    }

    const fetchAgentReport = async (agent: string) => {
      return trellisGet<TrellisAgentReport>(run, url(), dir(), `/eval/agent/${encodeURIComponent(agent)}`)
    }

    const fetchIssueScore = async (id: string) => {
      return trellisGet<TrellisIssueScore>(run, url(), dir(), `/eval/issue/${encodeURIComponent(id)}`)
    }

    const fetchDogfood = async () => {
      return trellisGet<TrellisDogfood>(run, url(), dir(), "/dogfood")
    }

    const triggerDogfood = async () => {
      return tracked("criteria", "Running dogfood eval...", () =>
        trellisPost<TrellisDogfood>(run, url(), dir(), "/dogfood/run"),
      )
    }

    // WorkUnit API
    const createWorkUnit = async (input: {
      title: string
      cycle: string
      priority?: "critical" | "high" | "medium" | "low"
      tags?: string[]
    }) => {
      const result = await trellisPost<WorkUnit>(run, url(), dir(), "/workunits", input)
      if (result) await refresh()
      return result
    }

    const updateWorkUnit = async (
      id: string,
      updates: Partial<Pick<WorkUnit, "title" | "status" | "priority" | "tags" | "cycle">>,
    ) => {
      const result = await trellisPut<WorkUnit>(run, url(), dir(), `/workunits/${id}`, updates)
      if (result) await refresh()
      return result
    }

    const deleteWorkUnit = async (id: string) => {
      const result = await trellisDelete<unknown>(run, url(), dir(), `/workunits/${id}`)
      if (result) await refresh()
      return result
    }

    // Cycle API
    const createCycle = async (input: {
      title: string
      milestone?: string
      purpose?: string
      horizon?: "now" | "next" | "later"
    }) => {
      const result = await trellisPost<Cycle>(run, url(), dir(), "/cycles", input)
      if (result) await refresh()
      return result
    }

    // MilestoneEpic API
    const createMilestoneEpic = async (input: { title: string; roadmap?: string; targetDate?: string }) => {
      const result = await trellisPost<MilestoneEpic>(run, url(), dir(), "/milestones", input)
      if (result) await refresh()
      return result
    }

    // Roadmap API
    const createRoadmap = async (input: { title: string; horizon?: "now" | "next" | "later" }) => {
      const result = await trellisPost<Roadmap>(run, url(), dir(), "/roadmaps", input)
      if (result) await refresh()
      return result
    }

    // Telos API
    const setTelos = async (mission: string, vision?: string) => {
      const result = await trellisPost<Telos>(run, url(), dir(), "/telos", { mission, vision })
      if (result) await refresh()
      return result
    }

    const deleteBranch = async (name: string) => {
      return trellisDelete<unknown>(run, url(), dir(), `/branches/${encodeURIComponent(name)}`)
    }

    const blockIssue = async (issueId: string, blockedBy: string) => {
      const result = await trellisPost<{ success: boolean }>(run, url(), dir(), `/issues/${issueId}/block`, {
        blockedBy,
      })
      if (result) await refresh()
      return result
    }

    const unblockIssue = async (issueId: string, blockedBy: string) => {
      const result = await trellisPost<{ success: boolean }>(run, url(), dir(), `/issues/${issueId}/unblock`, {
        blockedBy,
      })
      if (result) await refresh()
      return result
    }

    const createIssue = async (input: {
      title: string
      priority?: "critical" | "high" | "medium" | "low"
      labels?: string[]
      description?: string
      criteria?: Array<{ description: string; command?: string }>
    }) => {
      const result = await trellisPost<TrellisIssue>(run, url(), dir(), "/issues", input)
      if (result) await refresh()
      return result
    }

    // Plan-Approval API
    const fetchPlans = async (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ""
      return (await trellisGet<TrellisPlan[]>(run, url(), dir(), `/plans${qs}`)) ?? []
    }

    const enterPlanMode = async (title: string, description?: string) => {
      const result = await trellisPost<{ id: string; title: string }>(run, url(), dir(), "/plans/enter", {
        title,
        description,
      })
      if (result) await refresh()
      return result
    }

    const submitPlan = async () => {
      const result = await trellisPost<TrellisPlan>(run, url(), dir(), "/plans/submit")
      if (result) await refresh()
      return result
    }

    const approvePlan = async () => {
      const result = await trellisPost<{ planId: string; operationsExecuted: number }>(
        run,
        url(),
        dir(),
        "/plans/approve",
      )
      if (result) await refresh()
      return result
    }

    const rejectPlan = async (reason?: string) => {
      const result = await trellisPost<{ success: boolean }>(run, url(), dir(), "/plans/reject", { reason })
      if (result) await refresh()
      return result
    }

    const cancelPlan = async () => {
      const result = await trellisPost<{ success: boolean }>(run, url(), dir(), "/plans/cancel")
      if (result) await refresh()
      return result
    }

    // Proactive Watcher API
    const dismissSuggestion = async (id: string) => {
      const result = await trellisPost<{ success: boolean }>(
        run,
        url(),
        dir(),
        `/watcher/suggestions/${encodeURIComponent(id)}/dismiss`,
      )
      if (result) await refresh()
      return result
    }

    const fetchWatcherRules = async () => {
      return (await trellisGet<TrellisWatcherRule[]>(run, url(), dir(), "/watcher/rules")) ?? []
    }

    // Idea Garden (kernel) API
    const fetchIdeas = async () => {
      return (await trellisGet<TrellisRecoverableIdea[]>(run, url(), dir(), "/garden/ideas")) ?? []
    }

    const resurrectIdea = async (id: string) => {
      return trellisPost<{ id: string }>(run, url(), dir(), `/garden/ideas/${encodeURIComponent(id)}/resurrect`)
    }

    // Agent Memory API
    const fetchConversations = async (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ""
      return (await trellisGet<TrellisConversation[]>(run, url(), dir(), `/conversations${qs}`)) ?? []
    }

    const createConversation = async (title: string, opts?: { agentId?: string; model?: string }) => {
      return trellisPost<{ id: string; title: string }>(run, url(), dir(), "/conversations", { title, ...opts })
    }

    // Criterion management API
    const setCriterionStatus = async (issueId: string, idx: number, status: "passed" | "failed" | "pending") => {
      const result = await trellisPut<TrellisIssue>(run, url(), dir(), `/issues/${issueId}/criteria/${idx}`, { status })
      if (result) await refresh()
      return result
    }

    const runAllCriteria = async (issueId: string) => {
      return tracked("criteria", "Running criteria...", async () => {
        const result = await trellisPost<unknown[]>(run, url(), dir(), `/issues/${issueId}/criteria/run`)
        if (result) await refresh()
        return result
      })
    }

    // Diff API
    const diffFromOp = async (hash: string) => {
      return trellisGet<TrellisDiffResult>(run, url(), dir(), `/diff/op/${encodeURIComponent(hash)}`)
    }

    const diffBranches = async (a: string, b: string) => {
      const params = new URLSearchParams()
      params.set("directory", dir())
      params.set("a", a)
      params.set("b", b)
      const res = await run(`${url()}/trellis/diff/branches?${params}`)
      if (!res.ok) return undefined
      return res.json() as Promise<TrellisDiffResult>
    }

    // Active issues
    const fetchActiveIssues = async () => {
      return (await trellisGet<TrellisIssue[]>(run, url(), dir(), "/issues/active")) ?? []
    }

    // Workspace config
    const fetchWorkspaceConfig = async () => {
      return trellisGet<TrellisWorkspaceConfig>(run, url(), dir(), "/workspace/config")
    }

    createEffect(() => {
      // re-run when url, directory, or server health changes
      url()
      dir()
      if (server.healthy() === false) return

      loaded = 0
      void refresh()

      const timer = setInterval(() => {
        if (server.healthy() === false) return
        void refresh()
      }, POLL_MS)

      onCleanup(() => clearInterval(timer))
    })

    const changed = () => {
      loaded = 0
    }
    if (typeof window !== "undefined") window.addEventListener("trellis-store-changed", changed)

    onCleanup(() => {
      if (typeof window !== "undefined") window.removeEventListener("trellis-store-changed", changed)
    })

    const inProgressIssues = createMemo(() => store.issues.filter((i) => i.status === "in_progress"))
    const latestOp = createMemo(() => {
      if (store.ops.length === 0) return undefined
      return store.ops[store.ops.length - 1]
    })

    return {
      get ready() {
        return store.ready
      },
      get error() {
        return store.error
      },
      get revision() {
        return store.revision
      },
      get stats() {
        return store.stats
      },
      get issues() {
        return store.issues
      },
      get ops() {
        return store.ops
      },
      get decisions() {
        return store.decisions
      },
      get dogfood() {
        return store.dogfood
      },
      inProgressIssues,
      latestOp,
      refresh,
      getIssue,
      runCriteria,
      updateIssueStatus,
      updateIssue,
      createIssue,
      startIssue,
      pauseIssue,
      resumeIssue,
      triageIssue,
      closeIssue,
      reopenIssue,
      assignIssue,
      addCriterion,
      fetchOps,
      fetchDecisions,
      fetchDecisionChain,
      fetchBranches,
      createBranch,
      switchBranch,
      fetchMilestones,
      createMilestone,
      fetchBacklinks,
      fetchRefs,
      fetchEntity,
      assertFacts,
      retractFacts,
      fetchGraph,
      createSprite,
      fetchGarden,
      fetchGardenStats,
      reviveCluster,
      deleteBranch,
      blockIssue,
      unblockIssue,
      fetchEvalSummary,
      fetchAgentReport,
      fetchIssueScore,
      fetchDogfood,
      triggerDogfood,
      createWorkUnit,
      updateWorkUnit,
      deleteWorkUnit,
      createCycle,
      createMilestoneEpic,
      createRoadmap,
      setTelos,
      get workUnits() {
        return store.workUnits
      },
      get cycles() {
        return store.cycles
      },
      get milestones() {
        return store.milestones
      },
      get roadmaps() {
        return store.roadmaps
      },
      get telos() {
        return store.telos
      },
      get planMode() {
        return store.planMode
      },
      get pendingPlan() {
        return store.pendingPlan
      },
      get suggestions() {
        return store.suggestions
      },
      get storeEntities() {
        return store.storeEntities
      },
      fetchStoreEntities,
      fetchPlans,
      enterPlanMode,
      submitPlan,
      approvePlan,
      rejectPlan,
      cancelPlan,
      dismissSuggestion,
      fetchWatcherRules,
      fetchIdeas,
      resurrectIdea,
      fetchConversations,
      createConversation,
      setCriterionStatus,
      runAllCriteria,
      diffFromOp,
      diffBranches,
      fetchActiveIssues,
      fetchWorkspaceConfig,
    }
  },
})

export const useTrellis = trellisContext.use
export const TrellisProvider = trellisContext.provider

/** Returns undefined when rendered outside the TrellisProvider (e.g. home page). */
export function useTrellisOptional() {
  try {
    return useTrellis()
  } catch {
    return undefined
  }
}

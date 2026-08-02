import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { Log } from "../util/log"
import { Trellis } from "./index"
import path from "path"
import os from "os"

const log = Log.create({ service: "trellis.dogfood" })

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const TURTLECODE_DIR = path.join(os.homedir(), ".turtlecode", "workspaces", "turtlecode")

function resolve(dir: string) {
  return dir.replace(/^~/, os.homedir())
}

export function detect(dir?: string): boolean {
  const d = dir ?? Instance.directory
  const resolved = resolve(d)
  if (resolved === TURTLECODE_DIR) return true
  if (resolved.endsWith("/turtlecode") || resolved.endsWith("/opencode-client")) return true
  try {
    const pkg = require(path.join(d, "package.json"))
    return pkg.name === "opencode" || pkg.name === "turtlecode"
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const THRESHOLD = {
  decision: 0.4,
  issue: 0.3,
  session: 0.3,
  cooldown: 60_000 * 15, // 15 min between eval cycles
} as const

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DogfoodState {
  active: boolean
  last: number
  created: Set<string>
  unsub?: () => void
}

const state: DogfoodState = {
  active: false,
  last: 0,
  created: new Set(),
}

export function active() {
  return state.active
}

export function info() {
  return {
    active: state.active,
    last: state.last,
    created: [...state.created],
    thresholds: THRESHOLD,
  }
}

// ---------------------------------------------------------------------------
// Eval cycle
// ---------------------------------------------------------------------------

async function cycle() {
  const now = Date.now()
  if (now - state.last < THRESHOLD.cooldown) return
  state.last = now

  const eng = Trellis.engine()
  if (!eng) return

  let report: ReturnType<typeof Trellis.evalSummary> | undefined
  try {
    report = Trellis.evalSummary()
  } catch (err) {
    log.warn("dogfood eval failed", { error: String(err) })
    return
  }
  if (!report) return

  log.info("dogfood eval cycle", {
    avgDecisionQuality: report.avgDecisionQuality,
    avgIssueHealth: report.avgIssueHealth,
    avgSessionEfficiency: report.avgSessionEfficiency,
  })

  if (report.avgDecisionQuality < THRESHOLD.decision && report.totalDecisions > 5) {
    await flag(
      "low-decision-quality",
      `Average decision quality ${report.avgDecisionQuality.toFixed(2)} is below threshold ${THRESHOLD.decision}`,
    )
  }

  if (report.avgIssueHealth < THRESHOLD.issue && report.totalIssues > 2) {
    await flag(
      "low-issue-health",
      `Average issue health ${report.avgIssueHealth.toFixed(2)} is below threshold ${THRESHOLD.issue}`,
    )
  }

  if (report.avgSessionEfficiency < THRESHOLD.session && report.totalSessions > 2) {
    await flag(
      "low-session-efficiency",
      `Average session efficiency ${report.avgSessionEfficiency.toFixed(2)} is below threshold ${THRESHOLD.session}`,
    )
  }

  if (report.worstIssue) {
    const worst = Trellis.evalIssue(report.worstIssue)
    if (worst && worst.health < 0.2) {
      await flag(
        `worst-issue-${report.worstIssue}`,
        `Issue ${report.worstIssue} has critically low health ${worst.health.toFixed(2)}`,
      )
    }
  }
}

async function flag(tag: string, description: string) {
  if (state.created.has(tag)) return
  state.created.add(tag)

  const title = `[dogfood] ${tag}`
  log.info("dogfood auto-creating issue", { tag, description })

  try {
    await Trellis.createIssue(title, {
      priority: "medium",
      labels: ["dogfood", "auto-eval"],
      description,
    })
    await Bus.publish(Trellis.Event.StatusUpdated, {
      branch: "dogfood",
      totalOps: 0,
      trackedFiles: 0,
    })
  } catch (err) {
    log.warn("dogfood issue creation failed", { tag, error: String(err) })
    state.created.delete(tag)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function start() {
  if (state.active) return
  if (!detect()) {
    log.info("dogfood mode not applicable for this workspace")
    return
  }

  state.active = true
  log.info("dogfood mode activated")

  state.unsub = Bus.subscribe(Trellis.Event.Initialized, async () => {
    log.info("dogfood: trellis initialized, running eval cycle")
    await cycle()
  })

  // Run initial eval after a short delay to let engine settle
  setTimeout(() => {
    if (state.active) cycle()
  }, 3000)
}

export function stop() {
  if (!state.active) return
  state.active = false
  state.unsub?.()
  state.unsub = undefined
  state.created.clear()
  state.last = 0
  log.info("dogfood mode deactivated")
}

export async function run() {
  if (!state.active) return undefined
  await cycle()
  return info()
}

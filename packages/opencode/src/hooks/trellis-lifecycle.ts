import { join } from "node:path"
import { listLaneMetas } from "trellis/vcs"
import { Trellis } from "@/trellis"
import { hooks } from "./dispatcher.js"
import type { SessionStartInput } from "./dispatcher.js"

/**
 * Trellis lifecycle hooks — session bookkeeping, never promotion.
 *
 * - `sessionStart`: plan-first nudge — a session whose lane has no linked
 *   issue gets a soft, non-blocking reminder to plan/issue before code.
 * - `sessionEnd`: re-entry checkpoint (`.trellis/reentry-checkpoint.json`)
 *   with the active lane's issue; lane status logged. Checkpoint-only by
 *   policy — this hook NEVER promotes.
 *
 * Loaded once at boot via registerTrellisLifecycle() (idempotent).
 */

let registered = false

export function registerTrellisLifecycle(): void {
  if (registered) return
  registered = true

  hooks.register("sessionStart", (input) => planFirstNudge(input as SessionStartInput))
  hooks.register("sessionEnd", (input) => endCheckpoint(input as SessionStartInput))
}

export function planFirstNudge(input: SessionStartInput) {
  const lanes = listLaneMetas(join(input.directory, ".trellis"))
  const lane = lanes.find(
    (l) => l.sessionId === input.sessionID && l.status === "active",
  )

  let nudge: string | undefined

  // whereami banner: if a re-entry checkpoint exists, surface it first.
  const eng = Trellis.engine(input.directory)
  if (eng) {
    const status = eng.reentryStatus()
    if (status.checkpoint) {
      const issues = status.checkpoint.issueIds.join(", ") || "no issue"
      nudge = `Resumed from checkpoint (${status.checkpoint.at}): last session was on ${issues}. Run /lane-status to re-orient.`
    }
  }

  if (!nudge && !lane?.issueId) {
    nudge =
      "Plan-first: no issue bound to this session's lane. Create or start an issue (trellis issue start TRL-xxx) so the work is tracked before edits."
  }

  return { continue: true, decision: "allow" as const, nudge }
}

export function endCheckpoint(input: SessionStartInput) {
  const eng = Trellis.engine(input.directory)
  if (!eng) return { continue: true, decision: "allow" as const }

  const cp = eng.writeReentryCheckpoint()
  const laneIds = listLaneMetas(join(input.directory, ".trellis"))
    .filter((l) => l.sessionId === input.sessionID)
    .map((l) => l.id)
  console.log(
    `[trellis-lifecycle] session ${input.sessionID} ended → checkpoint written (${cp.issueIds.length} issue(s), lanes: ${laneIds.join(",") || "none"}). Checkpoint-only; nothing promoted.`,
  )
  return { continue: true, decision: "allow" as const }
}

export function trellisLifecycleRegistered(): boolean {
  return registered
}

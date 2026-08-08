/**
 * @mentions — route human attention and agent follow-ups across the session graph.
 *
 * Grammar: `@human` (pause for a human decision), `@agent:<name>` (hand a
 * follow-up to a named subagent), `@lane:<id>` (reference a lane),
 * `@issue:TRL-123` (issue ref that resolves to its lane).
 *
 * `mentionTargets()` is the registry shared by the TUI autocomplete and the
 * server route. `routeTurnEndMentions()` runs at turn end: `@human` pauses the
 * loop (the turn ends so the operator can answer), `@agent:` emits a follow-up
 * nudge, and every mention is recorded as a decision trace so `/decision-chain`
 * shows the routing.
 */

import z from "zod"
import { join } from "node:path"
import { listLaneMetas } from "trellis/vcs"
import { Instance } from "../project/instance"
import { Trellis } from "./index"

export const MentionTarget = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["human", "agent", "lane", "issue"]),
  laneId: z.string().optional(),
  issueId: z.string().optional(),
})
export type MentionTarget = z.infer<typeof MentionTarget>

const MENTION_RE = /@(?:human|agent:[A-Za-z0-9_.-]+|lane:[A-Za-z0-9-]+|issue:[A-Za-z0-9_.-]+)/g

/** Extract mention targets from text, in order of appearance (tokens include the `@`). */
export function parseMentions(text: string | undefined): string[] {
  if (!text) return []
  return Array.from(text.matchAll(MENTION_RE), (m) => m[0])
}

/** Registry of currently routable mention targets (human + live agents + active lanes). */
export function mentionTargets(dir?: string): MentionTarget[] {
  const base = dir ?? Instance.directory
  const targets: MentionTarget[] = [{ id: "@human", label: "human", kind: "human" }]
  const seen = new Set<string>(["@human"])

  for (const row of Trellis.presence(dir)) {
    const agent = String(row.agentId ?? "").trim()
    if (!agent) continue
    const id = `@agent:${agent}`
    if (seen.has(id)) continue
    seen.add(id)
    targets.push({
      id,
      label: String(row.displayName || agent),
      kind: "agent",
      laneId: row.laneId ? String(row.laneId) : undefined,
      issueId: row.issueId ? String(row.issueId) : undefined,
    })
  }

  for (const meta of listLaneMetas(join(base, ".trellis"))) {
    if (meta.status !== "active") continue
    const id = `@lane:${meta.id}`
    if (seen.has(id)) continue
    seen.add(id)
    targets.push({
      id,
      label: `lane ${meta.id.slice(-10)}`,
      kind: "lane",
      laneId: meta.id,
      issueId: meta.issueId,
    })
  }

  return targets
}

export type TurnEndMentionResult = {
  /** True when the turn should end so the operator can answer (@human). */
  pause: boolean
  nudgeText?: string
  mentions: string[]
}

/**
 * Route mentions found in an assistant turn.
 *
 * - `@human` → pause: the turn ends and control returns to the operator.
 * - `@agent:<name>` → emit a follow-up nudge to run the referenced subagent.
 * - `@lane:` / `@issue:` → trace only (attached context).
 *
 * Every mention is recorded as a decision trace (best-effort).
 */
export function routeTurnEndMentions(input: {
  sessionID: string
  agent: string
  assistantText: string
}): TurnEndMentionResult {
  const mentions = parseMentions(input.assistantText)
  if (mentions.length === 0) return { pause: false, mentions }

  for (const target of mentions) {
    // Decision trace is best-effort — a missing engine must never break routing.
    Trellis.record({
      tool: "mention",
      sessionID: input.sessionID,
      agent: input.agent,
      args: { target },
      output: "mention routed at turn end",
    }).catch(() => {})
  }

  if (mentions.includes("@human")) {
    return { pause: true, mentions }
  }

  const agentRefs = mentions.filter((m) => m.startsWith("@agent:"))
  if (agentRefs.length > 0) {
    const refs = agentRefs.map((m) => m.replace(/^@agent:/, "")).join(", ")
    return {
      pause: false,
      mentions,
      nudgeText: [
        `<system-reminder data-hook="trellis-mention">`,
        `You referenced ${refs} with an @agent: mention. If you have not already run ${refs} as a subagent this turn, run it now via the task tool with the context you cited.`,
        `</system-reminder>`,
      ].join("\n"),
    }
  }

  return { pause: false, mentions }
}

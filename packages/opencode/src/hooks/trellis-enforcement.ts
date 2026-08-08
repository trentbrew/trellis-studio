import { detect as detectPersonalFact } from "../capture/personal-events"
import { routeTurnEndMentions } from "../trellis/mentions"

const REMINDER_TAG = "trellis-enforcement"
export const TRELLIS_HOOK_METADATA_KEY = "trellisHook"

export type TrellisHookEvent = {
  id: typeof REMINDER_TAG
  kind:
    | "graph-enrichment"
    | "research-capture"
    | "memory-capture"
    | "cms-reconcile"
    | "turn-end-enrichment"
    | "turn-end-research"
    | "turn-end-cms-reconcile"
    | "turn-end-mention"
  phase: "tool" | "turn-end"
  label: string
}

const SKIP_AGENTS = new Set(["plan", "compaction", "title", "summary", "explore", "research"])

const CMS_CAPTURE_ACTIONS = new Set(["create_entry", "create_collection"])
const RESEARCH_TOOLS = new Set(["websearch", "webfetch", "deep_research"])
const FILE_FALLBACK_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch"])

type TurnState = {
  userMessageID: string
  cmsCreates: number
  cmsEntryFailures: number
  cmsCollection?: string
  fileFallbackPaths: string[]
  researchCalls: number
  toolReminderSent: boolean
  reconcileReminderSent: boolean
  turnEndNudges: number
  memoryRecalled: boolean
  memoryRemembered: boolean
  memoryReminderSent: boolean
}

const turns = new Map<string, TurnState>()

function hookEvent(kind: TrellisHookEvent["kind"], phase: TrellisHookEvent["phase"]): TrellisHookEvent {
  const labels: Record<TrellisHookEvent["kind"], string> = {
    "graph-enrichment": "Graph enrichment",
    "research-capture": "Research capture",
    "memory-capture": "Memory capture",
    "cms-reconcile": "CMS reconcile",
    "turn-end-enrichment": "Graph enrichment follow-up",
    "turn-end-research": "Research capture follow-up",
    "turn-end-cms-reconcile": "CMS reconcile follow-up",
    "turn-end-mention": "Mention routing follow-up",
  }
  return {
    id: REMINDER_TAG,
    kind,
    phase,
    label: labels[kind],
  }
}

function wrapReminder(body: string) {
  return `<system-reminder data-hook="${REMINDER_TAG}">\n${body.trim()}\n</system-reminder>`
}

function hasHookReminder(text: string) {
  return text.includes(`data-hook="${REMINDER_TAG}"`) || text.includes(`data-hook='${REMINDER_TAG}'`)
}

function appendReminder(output: string, body: string) {
  if (hasHookReminder(output)) return output
  return `${output.trimEnd()}\n\n${wrapReminder(body)}`
}

function enrichmentSuggestions(collection?: string): string {
  const key = (collection ?? "").toLowerCase()
  if (/org|company|startup|firm|business/.test(key)) {
    return [
      "1. Add founders/CEOs as **People** entries linked to each organization",
      "2. Create or link a **Topics** entry for the batch/cohort",
      "3. Run a latest-news research pass for key orgs",
      "4. Cross-link matches in **Competitors** or related collections",
    ].join("\n")
  }
  if (/people|person|contact|founder/.test(key)) {
    return [
      "1. Link each person to their **organization** reference field",
      "2. Add **Topics** tags for roles or cohorts",
      "3. Attach **Source** or link assets for provenance",
    ].join("\n")
  }
  return [
    "1. Link new entries to related entities already in the graph",
    "2. Add **Topics** tags for queryable grouping",
    "3. Save a research note if this came from external sources",
  ].join("\n")
}

function graphEnrichmentReminder(collection: string | undefined, count: number) {
  const label = collection ? `\`${collection}\`` : "the graph"
  return [
    "Trellis graph enrichment is required before you finish this turn.",
    "",
    `You just wrote ${count} CMS entr${count === 1 ? "y" : "ies"} to ${label}.`,
    "End your response with **## Graph enrichment** offering 2–4 numbered follow-ups, for example:",
    enrichmentSuggestions(collection),
    "",
    "Suggest only — do not bulk-create linked entities unless the user confirms.",
  ].join("\n")
}

function memoryCaptureReminder() {
  return [
    "Trellis memory capture: you recalled memory this turn and created an all-day calendar event,",
    "but no durable fact was persisted.",
    "",
    "If this event encodes a stable user fact (birthday, anniversary, recurring personal date),",
    "call `memory remember` with `scope: user` before finishing — for example:",
    '`memory remember { scope: "user", title: "Birthday", content: "October 23 (annual)", tags: ["personal"] }`.',
    "",
    "Skip this if the event is a one-off appointment, deadline, or throwaway scheduling.",
  ].join("\n")
}

function researchCaptureReminder() {
  return [
    "Trellis capture follow-up is required before you finish this turn.",
    "",
    "You used web research tools. End with **## Next steps in Trellis** (2–4 numbered options), e.g.:",
    "1. CMS collection + entries for entities found",
    "2. Tagged research note with the full report",
    "3. Link assets for key URLs (Sources are auto-captured)",
    "4. Semantic links to existing graph entities",
    "",
    "Check existing collections first. For bulk lists (>5), propose the plan and ask which option to run.",
  ].join("\n")
}

function cmsFileFallbackReminder(collection: string | undefined, paths: string[]) {
  const label = collection ? `\`${collection}\`` : "the CMS collection"
  const files = paths.map((path) => `\`${path}\``).join(", ")
  return [
    "Trellis CMS reconcile is required before you finish this turn.",
    "",
    `create_entry failed for ${label}, but you wrote file fallback content (${files}).`,
    "Tell the user explicitly that the database entry was NOT created.",
    "Do not imply the CMS row exists. Offer to retry create_entry with valid field values,",
    "or ask whether the markdown/file fallback is enough for now.",
  ].join("\n")
}

function buildTurnEndNudgeText(kind: "enrichment" | "research" | "cms-reconcile") {
  if (kind === "enrichment") {
    return wrapReminder(
      [
        "You captured CMS/graph data this turn but did not include **## Graph enrichment** in your response.",
        "Add that section now with 2–4 numbered, collection-specific follow-ups. Suggest only — wait for user confirmation before bulk enrichment.",
      ].join("\n"),
    )
  }
  if (kind === "cms-reconcile") {
    return wrapReminder(
      [
        "You failed to create a CMS entry this turn but wrote a file fallback.",
        "Revise your response to state clearly that the database entry was NOT created.",
        "Offer to retry create_entry with valid field values or confirm the file-only fallback is acceptable.",
      ].join("\n"),
    )
  }
  return wrapReminder(
    [
      "You ran web research this turn but did not include **## Next steps in Trellis** in your response.",
      "Add that section now with 2–4 numbered capture options tailored to what you found.",
    ].join("\n"),
  )
}

function satisfied(text: string, kind: "enrichment" | "research" | "cms-reconcile") {
  const normalized = text.toLowerCase()
  if (kind === "enrichment") {
    return normalized.includes("graph enrichment") || normalized.includes("next steps in trellis")
  }
  if (kind === "cms-reconcile") {
    return (
      /not created|wasn't created|was not created|didn't create|did not create|no (database|cms|db) entry|entry not saved|persistence|saved (as|to) .*\.md|markdown file instead|file fallback/.test(
        normalized,
      )
    )
  }
  return normalized.includes("next steps in trellis")
}

function cmsCreateEntryFailedOutput(output: { title?: string; metadata?: Record<string, unknown> }) {
  if (output.metadata?.ok === false) return true
  const id = typeof output.metadata?.id === "string" ? output.metadata.id : undefined
  const title = output.title?.trim().toLowerCase() ?? ""
  return (
    !id ||
    title.startsWith("error") ||
    title.startsWith("validation failed") ||
    title.startsWith("no entry created") ||
    title.startsWith("no collection") ||
    title.startsWith("reserved key")
  )
}

function filePathFromArgs(args: Record<string, unknown>) {
  for (const key of ["filePath", "filepath", "path", "file_path"]) {
    const value = args[key]
    if (typeof value === "string" && value.trim()) return value.replace(/\\/g, "/")
  }
  return undefined
}

function getTurn(sessionID: string, userMessageID: string) {
  let state = turns.get(sessionID)
  if (!state || state.userMessageID !== userMessageID) {
    state = {
      userMessageID,
      cmsCreates: 0,
      cmsEntryFailures: 0,
      researchCalls: 0,
      toolReminderSent: false,
      reconcileReminderSent: false,
      turnEndNudges: 0,
      memoryRecalled: false,
      memoryRemembered: false,
      memoryReminderSent: false,
      fileFallbackPaths: [],
    }
    turns.set(sessionID, state)
  }
  return state
}

export namespace TrellisEnforcement {
  export function reset(sessionID: string) {
    turns.delete(sessionID)
  }

  export type ToolHookResult = {
    output: string
    hook?: TrellisHookEvent
  }

  export function onToolAfter(input: {
    sessionID: string
    agent?: string
    tool: string
    args: Record<string, unknown>
    userMessageID: string
  }, output: { output: string; title?: string; metadata?: Record<string, unknown> }): ToolHookResult {
    if (input.agent && SKIP_AGENTS.has(input.agent)) return { output: output.output }

    const state = getTurn(input.sessionID, input.userMessageID)

    if (input.tool === "memory") {
      const action = typeof input.args.action === "string" ? input.args.action : ""
      if (action === "recall") state.memoryRecalled = true
      if (action === "remember") state.memoryRemembered = true
      return { output: output.output }
    }

    if (input.tool === "calendar") {
      const action = typeof input.args.action === "string" ? input.args.action : ""
      if (action !== "create") return { output: output.output }

      const title = typeof input.args.title === "string" ? input.args.title : ""
      const startAt = typeof input.args.startAt === "string" ? input.args.startAt : ""
      const allDay = input.args.allDay === true
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(startAt.trim())
      const factShaped = allDay || dateOnly
      // Clean personal facts are persisted deterministically by capture/personal-events,
      // so only nudge for the allowlist's blind spots: a fact-shaped event created in a
      // memory-relevant turn that the heuristic missed and the model never remembered.
      const ownedByCapture = !!detectPersonalFact({ title, startAt, allDay })

      if (
        state.memoryRecalled &&
        factShaped &&
        !ownedByCapture &&
        !state.memoryRemembered &&
        !state.memoryReminderSent
      ) {
        state.memoryReminderSent = true
        output.output = appendReminder(output.output, memoryCaptureReminder())
        return { output: output.output, hook: hookEvent("memory-capture", "tool") }
      }
      return { output: output.output }
    }

    if (input.tool === "cms") {
      const action = typeof input.args.action === "string" ? input.args.action : ""
      if (!CMS_CAPTURE_ACTIONS.has(action)) return { output: output.output }

      if (action === "create_entry") {
        if (cmsCreateEntryFailedOutput(output)) {
          state.cmsEntryFailures += 1
        } else {
          state.cmsCreates += 1
        }
      }
      if (typeof input.args.collection === "string") state.cmsCollection = input.args.collection

      if (state.cmsCreates > 0 && !state.toolReminderSent) {
        state.toolReminderSent = true
        output.output = appendReminder(
          output.output,
          graphEnrichmentReminder(state.cmsCollection, state.cmsCreates),
        )
        return { output: output.output, hook: hookEvent("graph-enrichment", "tool") }
      }
      return { output: output.output }
    }

    if (FILE_FALLBACK_TOOLS.has(input.tool)) {
      const path = filePathFromArgs(input.args)
      if (path) state.fileFallbackPaths.push(path)
      if (state.cmsEntryFailures > 0 && state.fileFallbackPaths.length > 0 && !state.reconcileReminderSent) {
        state.reconcileReminderSent = true
        output.output = appendReminder(
          output.output,
          cmsFileFallbackReminder(state.cmsCollection, state.fileFallbackPaths),
        )
        return { output: output.output, hook: hookEvent("cms-reconcile", "tool") }
      }
      return { output: output.output }
    }

    if (RESEARCH_TOOLS.has(input.tool)) {
      state.researchCalls += 1
      if (!state.toolReminderSent) {
        state.toolReminderSent = true
        output.output = appendReminder(output.output, researchCaptureReminder())
        return { output: output.output, hook: hookEvent("research-capture", "tool") }
      }
    }

    return { output: output.output }
  }

  export type TurnEndNudgeResult = {
    text: string
    hook: TrellisHookEvent
  }

  export function turnEndNudge(input: {
    sessionID: string
    userMessageID: string
    agent: string
    assistantText: string
  }): TurnEndNudgeResult | undefined {
    if (SKIP_AGENTS.has(input.agent)) {
      reset(input.sessionID)
      return undefined
    }

    const state = turns.get(input.sessionID)
    if (!state || state.userMessageID !== input.userMessageID) return undefined

    const text = input.assistantText.trim()
    if (!text) {
      reset(input.sessionID)
      return undefined
    }

    // Mention routing first: @human ends the turn (operator answers), @agent:
    // emits a follow-up nudge to run the referenced subagent. Overrides capture
    // reminders so a request-for-decision is never buried by enrichment noise.
    const mention = routeTurnEndMentions({
      sessionID: input.sessionID,
      agent: input.agent,
      assistantText: text,
    })
    if (mention.pause) {
      reset(input.sessionID)
      return undefined
    }
    if (mention.nudgeText && state.turnEndNudges < 1) {
      state.turnEndNudges += 1
      return {
        text: mention.nudgeText,
        hook: hookEvent("turn-end-mention", "turn-end"),
      }
    }

    if (state.cmsEntryFailures > 0 && state.fileFallbackPaths.length > 0 && !satisfied(text, "cms-reconcile") && state.turnEndNudges < 1) {
      state.turnEndNudges += 1
      return {
        text: buildTurnEndNudgeText("cms-reconcile"),
        hook: hookEvent("turn-end-cms-reconcile", "turn-end"),
      }
    }

    if (state.cmsCreates > 0 && !satisfied(text, "enrichment") && state.turnEndNudges < 1) {
      state.turnEndNudges += 1
      return {
        text: buildTurnEndNudgeText("enrichment"),
        hook: hookEvent("turn-end-enrichment", "turn-end"),
      }
    }

    if (state.researchCalls > 0 && state.cmsCreates === 0 && !satisfied(text, "research") && state.turnEndNudges < 1) {
      state.turnEndNudges += 1
      return {
        text: buildTurnEndNudgeText("research"),
        hook: hookEvent("turn-end-research", "turn-end"),
      }
    }

    reset(input.sessionID)
    return undefined
  }

  /** @internal test helper */
  export function __state(sessionID: string) {
    return turns.get(sessionID)
  }
}

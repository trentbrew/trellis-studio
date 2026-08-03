import { Effect } from "effect"

/**
 * In-core hook dispatcher — the real hook layer (HOOK_SYSTEM_DESIGN.md).
 *
 * Unlike the plugin API (which can observe but never block), this dispatcher
 * runs handlers *inside* the execution loop with blocking semantics: a
 * handler returning `continue: false` with `decision: "deny"` aborts the
 * operation before it runs. Trellis enforcement (canToolRun) plugs in here;
 * the kernel owns the rules, this dispatcher owns the mechanics.
 */

export type HookEvent =
  | "sessionStart"
  | "sessionEnd"
  | "workspaceOpen"
  | "preToolUse"
  | "postToolUse"
  | "postToolUseFailure"
  | "subagentStart"
  | "subagentStop"
  | "beforeSubmitPrompt"
  | "afterAgentResponse"
  | "preCompact"
  | "stop"

export interface PreToolUseInput {
  tool: string
  sessionID: string
  callID?: string
  args: Record<string, unknown>
  directory: string
  agent?: string
}

export interface PostToolUseInput {
  tool: string
  sessionID: string
  callID?: string
  args: Record<string, unknown>
  output?: unknown
  directory: string
}

export interface SessionStartInput {
  sessionID: string
  directory: string
  title?: string
  laneID?: string
}

export interface GenericHookInput {
  sessionID?: string
  directory?: string
  [key: string]: unknown
}

export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | SessionStartInput
  | GenericHookInput

export interface HookResult {
  /** False aborts the operation (deny) or requests a human gate (ask). */
  continue: boolean
  decision?: "allow" | "deny" | "ask"
  reason?: string
  /** Suggested sanctioned alternative, e.g. `trellis lane promote`. */
  redirect?: string
  message?: string
  /** Soft guidance to surface in the session thread (never blocks). */
  nudge?: string
}

export type HookHandler = (input: HookInput) => HookResult | Promise<HookResult>

interface RegisteredHandler {
  handler: HookHandler
  priority: number
}

/** Aggregate result across handlers (deny wins over everything). */
export function aggregate(results: HookResult[]): HookResult {
  for (const r of results) {
    if (!r.continue) return r
  }
  return { continue: true, decision: "allow" }
}

export class HookDispatcher {
  private handlers = new Map<HookEvent, RegisteredHandler[]>()

  register(event: HookEvent, handler: HookHandler, opts?: { priority?: number }) {
    const list = this.handlers.get(event) ?? []
    list.push({ handler, priority: opts?.priority ?? 0 })
    list.sort((a, b) => b.priority - a.priority)
    this.handlers.set(event, list)
  }

  has(event: HookEvent): boolean {
    return (this.handlers.get(event)?.length ?? 0) > 0
  }

  /** Run all handlers for an event; short-circuits on the first deny/ask. */
  async dispatch(event: HookEvent, input: HookInput): Promise<HookResult> {
    const list = this.handlers.get(event)
    if (!list || list.length === 0) return { continue: true, decision: "allow" }
    const results: HookResult[] = []
    for (const { handler } of list) {
      try {
        const r = await handler(input)
        results.push(r)
        if (!r.continue) break
      } catch (error) {
        // A crashing hook must not crash the loop — fail closed for gate
        // events, pass through otherwise.
        const failClosed = event === "preToolUse"
        results.push({
          continue: !failClosed,
          decision: failClosed ? "deny" : "allow",
          reason: `hook:${event} crashed: ${error instanceof Error ? error.message : String(error)}`,
        })
        if (failClosed) break
      }
    }
    return aggregate(results)
  }

  /** Fire-and-forget dispatch (observe-only events). */
  dispatchVoid(event: HookEvent, input: HookInput): Promise<void> {
    void this.dispatch(event, input)
    return Promise.resolve()
  }

  clear() {
    this.handlers.clear()
  }
}

/** The global hook dispatcher. */
export const hooks = new HookDispatcher()

/** Effect-flavored dispatch for the fork's Effect-based session code. */
export function dispatchEffect(event: HookEvent, input: HookInput): Effect.Effect<HookResult, never, never> {
  return Effect.promise(() => hooks.dispatch(event, input))
}

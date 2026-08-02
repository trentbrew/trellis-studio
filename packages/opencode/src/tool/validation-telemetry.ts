import { appendFile } from "fs/promises"
import path from "path"
import { Global } from "../global"

/**
 * Measurement for the schema-hardening effort.
 *
 * Every tool call flows through the single parse choke point in `Tool.define`,
 * so this is the one place that can answer "how often, and on which tools, do we
 * reject the model's arguments?". We keep cheap in-memory counters for the rate,
 * and append one JSONL line per *failure* (the interesting, low-volume events)
 * carrying enough context — tool, field paths, error codes, sessionID — to later
 * compute retry-resolution offline (did a failure get fixed on the next call?).
 *
 * Metrics this enables:
 *   - invalid-arg rate  = invalid / calls, per tool and per error code
 *   - retry-resolution  = failures followed by a success on the same tool/session
 */
export namespace ValidationTelemetry {
  const file = path.join(Global.Path.state, "tool-validation.jsonl")

  export type Issue = { path: string; code: string }
  export type Counter = { calls: number; invalid: number }

  const counts = new Map<string, Counter>()

  function bump(tool: string, invalid: boolean) {
    const c = counts.get(tool) ?? { calls: 0, invalid: 0 }
    c.calls++
    if (invalid) c.invalid++
    counts.set(tool, c)
  }

  /** Record an accepted call (counter only — no disk write). */
  export function ok(tool: string) {
    bump(tool, false)
  }

  /** Record a rejected call: bumps the counter and appends a JSONL line. */
  export function fail(input: { tool: string; issues: Issue[]; sessionID?: string }) {
    bump(input.tool, true)
    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        tool: input.tool,
        issues: input.issues,
        sessionID: input.sessionID,
      }) + "\n"
    // Fire-and-forget; telemetry must never break a tool call.
    appendFile(file, line).catch(() => {})
  }

  /** Per-tool {calls, invalid, rate}, sorted by invalid count desc. */
  export function summary() {
    return [...counts.entries()]
      .map(([tool, c]) => ({ tool, calls: c.calls, invalid: c.invalid, rate: c.calls ? c.invalid / c.calls : 0 }))
      .sort((a, b) => b.invalid - a.invalid)
  }

  export const path_ = file
}

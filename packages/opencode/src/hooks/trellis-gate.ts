import { hooks } from "./dispatcher.js"
import type { PreToolUseInput } from "./dispatcher.js"

/**
 * Trellis enforcement gate — the hard-deny layer for harness tools.
 *
 * The kernel owns the RULES (canToolRun); this hook owns the MECHANICS: it
 * intercepts every tool execution before it runs and refuses tools the kernel
 * authority denies. A denied tool fails with a model-visible error carrying
 * the reason + sanctioned alternative (e.g. `trellis lane promote`).
 *
 * The authority is loaded lazily from `trellis/vcs` (kernel dist). When the
 * installed kernel predates canToolRun (e.g. npm trellis@3.4.2), the gate
 * degrades to allow with a one-time warning — the Phase 0 kernel wiring
 * (`sync-trellis-core.ts` with TRELLIS_PACKAGE) restores full enforcement.
 *
 * Loaded once at boot via registerTrellisGate() (idempotent).
 */

let registered = false
let authority: KernelAuthority | null | undefined
let warned = false

type KernelAuthority = {
  canToolRun: (
    inv: { tool: string; args: Record<string, unknown>; cwd: string },
    ctx?: { sessionId?: string; agentId?: string },
  ) =>
    | { allow: true }
    | { allow: false; deny: true; reason: string; redirect?: string }
    | { allow: false; prompt: true; message: string; confirmLabel: string }
}

async function loadAuthority(): Promise<KernelAuthority | null> {
  if (authority !== undefined) return authority
  try {
    const mod = (await import("trellis/vcs")) as unknown as Partial<KernelAuthority>
    authority = typeof mod.canToolRun === "function" ? (mod as KernelAuthority) : null
  } catch {
    authority = null
  }
  if (!authority && !warned) {
    warned = true
    console.warn(
      "[trellis-gate] kernel authority (canToolRun) unavailable in installed trellis — gate degraded to allow. Wire the local kernel via sync-trellis-core.ts (TRELLIS_PACKAGE).",
    )
  }
  return authority
}

export type GateResult = {
  continue: boolean
  decision: "allow" | "deny" | "ask"
  reason?: string
  redirect?: string
  message?: string
}

export async function gateTool(input: PreToolUseInput): Promise<GateResult> {
  const authority = await loadAuthority()
  if (!authority) return { continue: true, decision: "allow" }

  const decision = authority.canToolRun(
    {
      tool: input.tool,
      args: input.args ?? {},
      cwd: input.directory,
    },
    {
      sessionId: input.sessionID,
      agentId: input.agent,
    },
  )

  if (decision.allow) {
    return { continue: true, decision: "allow" }
  }
  if ("deny" in decision) {
    return {
      continue: false,
      decision: "deny",
      reason: decision.reason,
      redirect: decision.redirect,
      message: `Trellis enforcement blocked \`${input.tool}\` (${decision.reason}${decision.redirect ? ` → ${decision.redirect}` : ""})`,
    }
  }
  // prompt decisions surface as a TUI confirm (Phase 2); headless, flag and allow.
  return {
    continue: true,
    decision: "ask",
    reason: decision.message,
    message: decision.message,
  }
}

export function registerTrellisGate(): void {
  if (registered) return
  registered = true

  hooks.register("preToolUse", async (input) => gateTool(input as PreToolUseInput))
}

export function trellisGateRegistered(): boolean {
  return registered
}

export type TrellisHookEvent = {
  id: string
  kind: "graph-enrichment" | "research-capture" | "turn-end-enrichment" | "turn-end-research"
  phase: "tool" | "turn-end"
  label: string
}

export function readTrellisHook(metadata?: Record<string, unknown> | null): TrellisHookEvent | undefined {
  if (!metadata) return undefined
  const raw = metadata.trellisHook
  if (!raw || typeof raw !== "object") return undefined
  const hook = raw as Record<string, unknown>
  if (typeof hook.id !== "string" || typeof hook.kind !== "string" || typeof hook.label !== "string") return undefined
  return {
    id: hook.id,
    kind: hook.kind as TrellisHookEvent["kind"],
    phase: hook.phase === "turn-end" ? "turn-end" : "tool",
    label: hook.label,
  }
}

import type { StoreFact } from "@/context/trellis-store"

export function isStoreFactValue(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
}

/** Drop facts the Trellis store API cannot accept (missing/null/object values). */
export function sanitizeStoreFacts(facts: readonly StoreFact[]): StoreFact[] {
  const out: StoreFact[] = []
  for (const fact of facts) {
    if (typeof fact?.e !== "string" || typeof fact?.a !== "string") continue
    if (!isStoreFactValue(fact.v)) continue
    if (typeof fact.v === "number" && !Number.isFinite(fact.v)) continue
    out.push({ e: fact.e, a: fact.a, v: fact.v })
  }
  return out
}

export function droppedStoreFactsMessage(before: number, after: number) {
  if (after > 0 || before === 0) return undefined
  return "Nothing to save: one or more field values were empty or invalid for the store API."
}

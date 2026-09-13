import { resolveSubtitle, resolveTitle, type Fact } from "@/components/entity-detail/adapters"
import { entityTypeFromId } from "@/lib/entity-theme"

export type EntityPreviewData = {
  id: string
  type: string
  title: string
  subtitle?: string
  snippet?: string
}

const SNIPPET_KEYS = ["description", "purpose", "summary", "content", "notes"]

function snippet(facts: readonly Fact[]) {
  for (const key of SNIPPET_KEYS) {
    const hit = facts.find((fact) => fact.a === key)
    if (typeof hit?.v !== "string") continue
    const text = hit.v.trim()
    if (!text) continue
    return text.length > 160 ? `${text.slice(0, 157)}…` : text
  }
  return undefined
}

export function entityPreviewFromFacts(id: string, facts: readonly Fact[]): EntityPreviewData {
  const type = entityTypeFromId(id)
  const ctx = { id, type, facts }
  return {
    id,
    type,
    title: resolveTitle(ctx),
    subtitle: resolveSubtitle(ctx),
    snippet: snippet(facts),
  }
}

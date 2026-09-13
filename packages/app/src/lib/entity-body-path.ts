export const BODY_KEYS = ["body", "description", "content", "purpose", "summary", "message"] as const

export type EntityFact = { a: string; v: unknown }

export function normPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}

export function entityMarkdownPath(facts: readonly EntityFact[]): string | undefined {
  const hit = facts.find((fact) => fact.a === "path")
  if (typeof hit?.v !== "string") return undefined
  const next = normPath(hit.v)
  if (!/\.(md|mdx|markdown)$/i.test(next)) return undefined
  return next
}

export function inlineBody(facts: readonly EntityFact[]): string | undefined {
  for (const key of BODY_KEYS) {
    const hit = facts.find((fact) => fact.a === key)
    if (typeof hit?.v !== "string") continue
    const text = hit.v.trim()
    if (text) return text
  }
  return undefined
}

export function markdownBody(raw: string): string {
  if (!raw.startsWith("---")) return raw
  const end = raw.indexOf("\n---", 3)
  if (end === -1) return raw
  return raw.slice(end + 4).replace(/^\s*\n/, "")
}

export function snippet(text: string, max = 160): string {
  const next = text.trim()
  if (!next) return ""
  return next.length > max ? `${next.slice(0, max - 1)}…` : next
}

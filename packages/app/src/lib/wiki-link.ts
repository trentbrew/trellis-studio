const SYSTEM_NS = new Set(["issue", "file", "symbol", "identity", "milestone", "decision"])

export type WikiMention = {
  kind: "entity" | "file" | "symbol"
  id: string
  label: string
}

function stripAlias(raw: string) {
  const pipe = raw.indexOf("|")
  const base = pipe === -1 ? raw : raw.slice(0, pipe)
  const hash = base.indexOf("#")
  return (hash === -1 ? base : base.slice(0, hash)).trim()
}

function alias(raw: string, fallback: string) {
  const pipe = raw.indexOf("|")
  if (pipe === -1) return fallback
  const next = raw.slice(pipe + 1).trim()
  return next || fallback
}

/** Parse `[[target]]` / `[[ns:target|alias]]` / `[[#entityId]]` into mention attrs. */
export function parseWikiLink(raw: string): WikiMention | undefined {
  const inner = raw.trim()
  if (!inner) return undefined

  if (inner.startsWith("#")) {
    const body = inner.slice(1)
    const id = stripAlias(body)
    if (!id) return undefined
    return { kind: "entity", id, label: alias(body, id) }
  }

  const target = stripAlias(inner)
  const label = alias(raw, target)
  const colon = target.indexOf(":")

  if (colon !== -1) {
    const ns = target.slice(0, colon).toLowerCase()
    const rest = target.slice(colon + 1)
    if (SYSTEM_NS.has(ns)) {
      if (ns === "file") return { kind: "file", id: rest.replaceAll("\\", "/"), label }
      if (ns === "symbol") return { kind: "symbol", id: rest, label }
      if (ns === "issue") return { kind: "entity", id: `issue:${rest.toUpperCase()}`, label }
      if (ns === "decision") return { kind: "entity", id: `decision:${rest.toUpperCase()}`, label }
      return { kind: "entity", id: `${ns}:${rest}`, label }
    }
    return { kind: "entity", id: `${ns}:${rest.toLowerCase()}`, label }
  }

  if (/^TRL-\d+$/i.test(target)) return { kind: "entity", id: `issue:${target.toUpperCase()}`, label }
  if (/^DEC-\d+$/i.test(target)) return { kind: "entity", id: `decision:${target.toUpperCase()}`, label }

  return { kind: "file", id: target.replaceAll("\\", "/"), label }
}

/** Bare wiki targets without `:` are file paths (matches parseWikiLink + marked wikilink). */
export function looksLikeFile(path: string) {
  const t = path.trim()
  if (!t || t.includes(":")) return false
  if (/^TRL-\d+$/i.test(t)) return false
  if (/^DEC-\d+$/i.test(t)) return false
  return true
}

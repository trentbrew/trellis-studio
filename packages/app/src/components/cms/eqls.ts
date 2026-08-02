export type EqlOp = "=" | "!=" | "<" | "<=" | ">" | ">=" | "contains" | "~"
export type EqlClause = { attr: string; op: EqlOp; val: string | number | boolean }
export type EqlParse = { ok: true; clauses: EqlClause[] } | { ok: false; error: string }

export type EqlSchemaField = {
  key: string
  label?: string
  type?: string
  options?: string[]
}

export type EqlSuggestion = { label: string; query: string }

export type EqlSuggestionContext = {
  fields: EqlSchemaField[]
  enumCols: Map<string, string[]>
  colKinds: Map<string, "number" | "date" | "longtext" | "text">
  sample: (key: string) => string | number | boolean | undefined
}

const MAX_SUGGESTIONS = 6

export function parseEql(q: string): EqlParse {
  const trimmed = q.trim()
  if (!trimmed) return { ok: true, clauses: [] }
  const stripped = trimmed.replace(/^\s*find\s+\?[a-zA-Z_]+\s+where\s+/i, "")
  if (!stripped.trim()) return { ok: true, clauses: [] }
  const parts = stripped
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  const clauses: EqlClause[] = []
  for (const part of parts) {
    const m = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(<=|>=|!=|=|<|>|contains|~)\s*(.+)$/i)
    if (!m) return { ok: false, error: `Invalid clause: ${part}` }
    const op = m[2].toLowerCase() as EqlOp
    const raw = m[3].trim()
    if (/^[<>=!~]/.test(raw)) return { ok: false, error: `Invalid value: ${raw}` }
    let val: string | number | boolean
    if (raw === "true" || raw === "false") val = raw === "true"
    else if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      val = raw.slice(1, -1)
    else if (/^-?\d+(\.\d+)?$/.test(raw)) val = Number(raw)
    else val = raw
    clauses.push({ attr: m[1], op, val })
  }
  return { ok: true, clauses }
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") return Number(value)
  return Number.NaN
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    const left = a === true || a === "true"
    const right = b === true || b === "true"
    return left === right
  }
  const an = asNumber(a)
  const bn = asNumber(b)
  if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn
  return String(a ?? "") === String(b ?? "")
}

export function matchEqlClause(value: unknown, clause: EqlClause): boolean {
  if (clause.op === "contains" || clause.op === "~") {
    const text = String(value ?? "").toLowerCase()
    return text.includes(String(clause.val).toLowerCase())
  }
  if (clause.op === "=") return eq(value, clause.val)
  if (clause.op === "!=") return !eq(value, clause.val)
  const n = asNumber(value)
  const cn = asNumber(clause.val)
  if (!Number.isFinite(n) || !Number.isFinite(cn)) return false
  if (clause.op === "<") return n < cn
  if (clause.op === "<=") return n <= cn
  if (clause.op === ">") return n > cn
  if (clause.op === ">=") return n >= cn
  return false
}

function fieldLabel(field: EqlSchemaField): string {
  const label = field.label?.trim()
  return label || field.key
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

export function buildEqlSuggestions(ctx: EqlSuggestionContext): EqlSuggestion[] {
  const out: EqlSuggestion[] = []
  const seen = new Set<string>()
  const add = (label: string, query: string) => {
    if (seen.has(query) || out.length >= MAX_SUGGESTIONS) return
    seen.add(query)
    out.push({ label, query })
  }

  add("Published", 'find ?e where cms_status = "published"')
  add("Drafts", 'find ?e where cms_status = "draft"')

  for (const field of ctx.fields) {
    if (field.key === "type" || field.key === "cms_status" || field.key === "id") continue
    const name = fieldLabel(field)

    if (field.type === "select" && field.options?.length) {
      add(`${name} = ${field.options[0]}`, `find ?e where ${field.key} = ${quote(field.options[0])}`)
      continue
    }
    if (field.type === "boolean") {
      add(`${name} is true`, `find ?e where ${field.key} = true`)
      continue
    }
    if (field.type === "number" || ctx.colKinds.get(field.key) === "number") {
      const sample = ctx.sample(field.key)
      const n = asNumber(sample)
      const threshold = Number.isFinite(n) ? Math.max(0, Math.floor(n / 2)) : 0
      add(`${name} ≥ ${threshold}`, `find ?e where ${field.key} >= ${threshold}`)
      continue
    }
    if (ctx.enumCols.has(field.key)) {
      const opt = ctx.enumCols.get(field.key)![0]
      if (opt) add(`${name} = ${opt}`, `find ?e where ${field.key} = ${quote(opt)}`)
      continue
    }
    const sample = ctx.sample(field.key)
    if (typeof sample === "string" && sample.trim()) {
      const snippet = sample.trim().slice(0, 24)
      add(`${name} contains "${snippet}"`, `find ?e where ${field.key} contains ${quote(snippet)}`)
      continue
    }
    if (field.type === "text" || field.type === "url" || field.type === "email" || !field.type) {
      add(`${name} contains…`, `find ?e where ${field.key} contains "…"`)
    }
  }

  return out
}

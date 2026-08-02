import { type Expr, parseExpr } from "./expr"
import { isLinkMarker, type NoteRecord, linkValue, type LinkMarker } from "./types"

export type EvalContext = {
  note: NoteRecord
}

export function evaluate(src: string, ctx: EvalContext): unknown {
  return evalExpr(parseExpr(src), ctx)
}

export function evalBoolean(src: string, ctx: EvalContext): boolean {
  try {
    return toBool(evalExpr(parseExpr(src), ctx))
  } catch {
    return false
  }
}

function evalExpr(expr: Expr, ctx: EvalContext): unknown {
  switch (expr.kind) {
    case "literal":
      return expr.value
    case "ident":
      return resolveIdent(expr.name, ctx)
    case "member":
      return resolveMember(evalExpr(expr.object, ctx), expr.name)
    case "call":
      return resolveCall(expr.callee, expr.args, ctx)
    case "unary": {
      const arg = evalExpr(expr.arg, ctx)
      if (expr.op === "!") return !toBool(arg)
      if (expr.op === "-") return -toNum(arg)
      return undefined
    }
    case "binary": {
      // Short-circuit for logical ops.
      if (expr.op === "&&") return toBool(evalExpr(expr.left, ctx)) && toBool(evalExpr(expr.right, ctx))
      if (expr.op === "||") return toBool(evalExpr(expr.left, ctx)) || toBool(evalExpr(expr.right, ctx))
      const left = evalExpr(expr.left, ctx)
      const right = evalExpr(expr.right, ctx)
      switch (expr.op) {
        case "==":
          return eq(left, right)
        case "!=":
          return !eq(left, right)
        case "<":
          return cmp(left, right) < 0
        case ">":
          return cmp(left, right) > 0
        case "<=":
          return cmp(left, right) <= 0
        case ">=":
          return cmp(left, right) >= 0
        case "+":
          if (typeof left === "string" || typeof right === "string") return String(left ?? "") + String(right ?? "")
          return toNum(left) + toNum(right)
        case "-":
          return toNum(left) - toNum(right)
        case "*":
          return toNum(left) * toNum(right)
        case "/":
          return toNum(left) / toNum(right)
        case "%":
          return toNum(left) % toNum(right)
      }
      return undefined
    }
  }
}

function resolveIdent(name: string, ctx: EvalContext): unknown {
  if (name === "file") return ctx.note.file
  if (name === "note" || name === "this") return ctx.note.properties
  // Bare property names look at note frontmatter first, then file metadata.
  const props = ctx.note.properties
  if (Object.prototype.hasOwnProperty.call(props, name)) return props[name]
  const file = ctx.note.file as unknown as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(file, name)) return file[name]
  // Global functions are resolved via call sites; return a thunk marker.
  if (GLOBAL_FUNCTIONS[name]) return { __obsidianGlobal: name } as unknown
  return undefined
}

function resolveMember(target: unknown, name: string): unknown {
  if (target === undefined || target === null) return undefined
  // file fields and methods
  if (typeof target === "object" && target !== null) {
    if (Object.prototype.hasOwnProperty.call(target, name)) {
      return (target as Record<string, unknown>)[name]
    }
  }
  // String / list fields
  if (typeof target === "string" && name === "length") return target.length
  if (Array.isArray(target) && name === "length") return target.length
  // Method references are surfaced as a bound thunk; resolveCall handles execution.
  return { __obsidianMember: { target, name } } as unknown
}

type GlobalFn = (args: unknown[]) => unknown
const GLOBAL_FUNCTIONS: Record<string, GlobalFn> = {
  link: (args) => linkValue(String(args[0] ?? ""), args[1] !== undefined ? String(args[1]) : undefined),
  list: (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args),
  today: () => startOfDay(new Date()),
  now: () => new Date(),
  date: (args) => {
    const value = args[0]
    if (value instanceof Date) return value
    if (typeof value === "string") return new Date(value)
    if (typeof value === "number") return new Date(value)
    return new Date(NaN)
  },
  if: (args) => (toBool(args[0]) ? args[1] : args[2]),
  number: (args) => toNum(args[0]),
  max: (args) => args.map(toNum).reduce((a, b) => (a > b ? a : b), -Infinity),
  min: (args) => args.map(toNum).reduce((a, b) => (a < b ? a : b), Infinity),
}

function resolveCall(calleeExpr: Expr, argExprs: Expr[], ctx: EvalContext): unknown {
  const args = argExprs.map((a) => evalExpr(a, ctx))
  // Global function: identifier whose value is a global marker.
  if (calleeExpr.kind === "ident") {
    const fn = GLOBAL_FUNCTIONS[calleeExpr.name]
    if (fn) return fn(args)
  }
  // Method call: callee is a member access.
  if (calleeExpr.kind === "member") {
    const target = evalExpr(calleeExpr.object, ctx)
    return callMethod(target, calleeExpr.name, args)
  }
  return undefined
}

function callMethod(target: unknown, method: string, args: unknown[]): unknown {
  // String methods
  if (typeof target === "string") {
    switch (method) {
      case "contains":
        return target.includes(String(args[0] ?? ""))
      case "containsAll":
        return args.every((a) => target.includes(String(a)))
      case "containsAny":
        return args.some((a) => target.includes(String(a)))
      case "startsWith":
        return target.startsWith(String(args[0] ?? ""))
      case "endsWith":
        return target.endsWith(String(args[0] ?? ""))
      case "isEmpty":
        return target.trim() === ""
      case "lower":
        return target.toLowerCase()
      case "title":
        return target.replace(/\b\w/g, (c) => c.toUpperCase())
      case "trim":
        return target.trim()
      case "split":
        return target.split(String(args[0] ?? ""))
    }
  }
  // List methods
  if (Array.isArray(target)) {
    switch (method) {
      case "contains":
        return target.some((item) => eq(item, args[0]))
      case "containsAll":
        return args.every((a) => target.some((item) => eq(item, a)))
      case "containsAny":
        return args.some((a) => target.some((item) => eq(item, a)))
      case "isEmpty":
        return target.length === 0
      case "join":
        return target.join(String(args[0] ?? ""))
      case "unique":
        return Array.from(new Set(target))
      case "reverse":
        return [...target].reverse()
      case "sort":
        return [...target].sort()
      case "length":
        return target.length
    }
  }
  // Number methods
  if (typeof target === "number") {
    switch (method) {
      case "abs":
        return Math.abs(target)
      case "ceil":
        return Math.ceil(target)
      case "floor":
        return Math.floor(target)
      case "round":
        return args[0] !== undefined ? Number(target.toFixed(toNum(args[0]))) : Math.round(target)
      case "isEmpty":
        return !Number.isFinite(target)
    }
  }
  // File object methods — target should be a NoteFile (object with `tags`, `links`, etc.)
  if (typeof target === "object" && target !== null) {
    const obj = target as Record<string, unknown>
    switch (method) {
      case "hasTag": {
        const tags = (obj.tags as string[] | undefined) ?? []
        return args.some((a) => tags.includes(String(a)))
      }
      case "hasLink": {
        const links = (obj.links as string[] | undefined) ?? []
        const arg = args[0]
        const target = isLinkMarker(arg) ? arg.target : String(arg ?? "")
        return links.some((l) => l === target || baseName(l) === target)
      }
      case "inFolder": {
        const folder = (obj.folder as string | undefined) ?? ""
        const wanted = String(args[0] ?? "")
        return folder === wanted || folder.startsWith(`${wanted}/`)
      }
      case "hasProperty": {
        const name = String(args[0] ?? "")
        return Object.prototype.hasOwnProperty.call(obj, name)
      }
      case "isEmpty":
        return Object.keys(obj).length === 0
    }
  }
  // null/undefined
  if (target === null || target === undefined) {
    if (method === "isEmpty") return true
  }
  return undefined
}

function baseName(path: string): string {
  const i = path.lastIndexOf("/")
  const file = i >= 0 ? path.slice(i + 1) : path
  return file.replace(/\.md$/i, "")
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v
  if (v === null || v === undefined) return false
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v)
  if (typeof v === "string") return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  if (v instanceof Date) return v.getTime()
  return 0
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (isLinkMarker(a) && isLinkMarker(b)) return a.target === b.target
  if (isLinkMarker(a) && typeof b === "string") return a.target === b
  if (isLinkMarker(b) && typeof a === "string") return b.target === a
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (typeof a === "number" && typeof b === "string") return a === Number(b)
  if (typeof a === "string" && typeof b === "number") return Number(a) === b
  return false
}

function cmp(a: unknown, b: unknown): number {
  const na = toNum(a)
  const nb = toNum(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && (typeof a === "number" || typeof b === "number")) {
    return na - nb
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a ?? "").localeCompare(String(b ?? ""))
}

// Re-export for the parser.
export type { LinkMarker }

import type { FieldValue } from "@/components/cms/fields"

const OPS = new Set(["+", "-", "*", "/", "(", ")"])

type Token = number | "+" | "-" | "*" | "/" | "(" | ")"

function num(value: FieldValue): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string" || value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function tokens(expr: string): Token[] | undefined {
  const out: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (OPS.has(ch)) {
      out.push(ch as Token)
      i++
      continue
    }
    if (/\d|\./.test(ch)) {
      let end = i + 1
      while (end < expr.length && /\d|\./.test(expr[end]!)) end++
      const value = Number(expr.slice(i, end))
      if (!Number.isFinite(value)) return undefined
      out.push(value)
      i = end
      continue
    }
    return undefined
  }
  return out
}

function parse(input: Token[]): number | undefined {
  let i = 0
  const peek = () => input[i]
  const take = () => input[i++]
  const atom = (): number | undefined => {
    const token = take()
    if (typeof token === "number") return token
    if (token === "+") return atom()
    if (token === "-") {
      const value = atom()
      return value === undefined ? undefined : -value
    }
    if (token === "(") {
      const value = add()
      if (take() !== ")") return undefined
      return value
    }
    return undefined
  }
  const mul = (): number | undefined => {
    let left = atom()
    while (peek() === "*" || peek() === "/") {
      const op = take()
      const right = atom()
      if (left === undefined || right === undefined) return undefined
      left = op === "*" ? left * right : left / right
    }
    return left
  }
  const add = (): number | undefined => {
    let left = mul()
    while (peek() === "+" || peek() === "-") {
      const op = take()
      const right = mul()
      if (left === undefined || right === undefined) return undefined
      left = op === "+" ? left + right : left - right
    }
    return left
  }
  const value = add()
  if (i !== input.length || value === undefined || !Number.isFinite(value)) return undefined
  return value
}

export function formula(expr: string, values: Record<string, FieldValue>): number | undefined {
  const braced = expr.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    const value = num(values[key.trim()])
    return value === undefined ? match : String(value)
  })
  if (braced.includes("{") || braced.includes("}")) return undefined
  const text = braced.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, key: string) => {
    const value = num(values[key])
    return value === undefined ? match : String(value)
  })
  if (text.includes("{") || text.includes("}")) return undefined
  const input = tokens(text)
  return input ? parse(input) : undefined
}

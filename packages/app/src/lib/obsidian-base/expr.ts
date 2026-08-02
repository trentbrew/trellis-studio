export type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "punc"; value: string }

const PUNCS = new Set(["(", ")", ",", ".", "[", "]"])

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let out = ""
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const next = src[j + 1]
          out += next === "n" ? "\n" : next === "t" ? "\t" : next
          j += 2
          continue
        }
        out += src[j]
        j++
      }
      if (j >= src.length) throw new Error(`Unterminated string at ${i}`)
      tokens.push({ type: "str", value: out })
      i = j + 1
      continue
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(src[i + 1] ?? "") && !isValueExpressionEndingBefore(tokens))) {
      let j = i
      if (src[j] === "-") j++
      while (j < src.length && /[0-9]/.test(src[j])) j++
      if (src[j] === "." && /[0-9]/.test(src[j + 1] ?? "")) {
        j++
        while (j < src.length && /[0-9]/.test(src[j])) j++
      }
      tokens.push({ type: "num", value: Number(src.slice(i, j)) })
      i = j
      continue
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < src.length && /[a-zA-Z0-9_$]/.test(src[j])) j++
      const word = src.slice(i, j)
      tokens.push({ type: "ident", value: word })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === "==" || two === "!=" || two === ">=" || two === "<=" || two === "&&" || two === "||") {
      tokens.push({ type: "op", value: two })
      i += 2
      continue
    }
    if ("+-*/%<>!".includes(ch)) {
      tokens.push({ type: "op", value: ch })
      i++
      continue
    }
    if (PUNCS.has(ch)) {
      tokens.push({ type: "punc", value: ch })
      i++
      continue
    }
    throw new Error(`Unexpected character '${ch}' at ${i}`)
  }
  return tokens
}

function isValueExpressionEndingBefore(tokens: Token[]): boolean {
  const t = tokens[tokens.length - 1]
  if (!t) return false
  if (t.type === "num" || t.type === "str" || t.type === "ident") return true
  if (t.type === "punc" && (t.value === ")" || t.value === "]")) return true
  return false
}

// AST

export type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "ident"; name: string }
  | { kind: "member"; object: Expr; name: string }
  | { kind: "call"; callee: Expr; args: Expr[] }
  | { kind: "unary"; op: "!" | "-"; arg: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset]
  }

  consume(): Token {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error("Unexpected end of expression")
    return t
  }

  expectPunc(value: string): void {
    const t = this.consume()
    if (t.type !== "punc" || t.value !== value) {
      throw new Error(`Expected '${value}', got ${JSON.stringify(t)}`)
    }
  }

  parseExpression(): Expr {
    const out = this.parseBinary(0)
    if (this.pos < this.tokens.length) {
      const rest = this.tokens.slice(this.pos)
      throw new Error(`Unexpected tokens at end: ${JSON.stringify(rest)}`)
    }
    return out
  }

  private parseBinary(minPrec: number): Expr {
    let left = this.parseUnary()
    while (true) {
      const t = this.peek()
      if (!t || t.type !== "op") break
      const prec = binaryPrecedence(t.value)
      if (prec === 0 || prec < minPrec) break
      this.consume()
      const right = this.parseBinary(prec + 1)
      left = { kind: "binary", op: t.value, left, right }
    }
    return left
  }

  private parseUnary(): Expr {
    const t = this.peek()
    if (t && t.type === "op" && (t.value === "!" || t.value === "-")) {
      this.consume()
      const arg = this.parseUnary()
      return { kind: "unary", op: t.value as "!" | "-", arg }
    }
    return this.parsePostfix(this.parsePrimary())
  }

  private parsePostfix(start: Expr): Expr {
    let expr = start
    while (true) {
      const t = this.peek()
      if (!t) break
      if (t.type === "punc" && t.value === ".") {
        this.consume()
        const name = this.consume()
        if (name.type !== "ident") throw new Error(`Expected identifier after '.', got ${JSON.stringify(name)}`)
        expr = { kind: "member", object: expr, name: name.value }
        continue
      }
      if (t.type === "punc" && t.value === "(") {
        this.consume()
        const args: Expr[] = []
        if (!(this.peek()?.type === "punc" && this.peek()?.value === ")")) {
          args.push(this.parseBinary(0))
          while (this.peek()?.type === "punc" && this.peek()?.value === ",") {
            this.consume()
            args.push(this.parseBinary(0))
          }
        }
        this.expectPunc(")")
        expr = { kind: "call", callee: expr, args }
        continue
      }
      break
    }
    return expr
  }

  private parsePrimary(): Expr {
    const t = this.consume()
    if (t.type === "num") return { kind: "literal", value: t.value }
    if (t.type === "str") return { kind: "literal", value: t.value }
    if (t.type === "ident") {
      if (t.value === "true") return { kind: "literal", value: true }
      if (t.value === "false") return { kind: "literal", value: false }
      if (t.value === "null") return { kind: "literal", value: null }
      return { kind: "ident", name: t.value }
    }
    if (t.type === "punc" && t.value === "(") {
      const inner = this.parseBinary(0)
      this.expectPunc(")")
      return inner
    }
    throw new Error(`Unexpected token ${JSON.stringify(t)}`)
  }
}

function binaryPrecedence(op: string): number {
  switch (op) {
    case "||":
      return 1
    case "&&":
      return 2
    case "==":
    case "!=":
      return 3
    case "<":
    case ">":
    case "<=":
    case ">=":
      return 4
    case "+":
    case "-":
      return 5
    case "*":
    case "/":
    case "%":
      return 6
    default:
      return 0
  }
}

export function parseExpr(src: string): Expr {
  const tokens = tokenize(src)
  return new Parser(tokens).parseExpression()
}

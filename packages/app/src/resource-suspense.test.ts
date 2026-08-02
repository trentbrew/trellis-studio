import { describe, expect, test } from "bun:test"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

const root = path.dirname(fileURLToPath(import.meta.url))
const dirs = [root, path.resolve(root, "../../ui/src")]
const skip = [/\.test\.[tj]sx?$/, /\.d\.ts$/]
const init = new Set(["app.tsx:startupHealthCheck"])
const hooks = new Map([["useFilteredList", new Set(["grouped"])]])

const files = async () => {
  const out: string[] = []
  for (const dir of dirs) {
    for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: dir, onlyFiles: true })) {
      if (skip.some((item) => item.test(file))) continue
      out.push(path.join(dir, file))
    }
  }
  return out
}

const rel = (file: string) => path.relative(root, file).replaceAll(path.sep, "/")

const loc = (sf: ts.SourceFile, node: ts.Node) => {
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  return `${rel(sf.fileName)}:${pos.line + 1}:${pos.character + 1}`
}

const id = (name: ts.BindingName) => (ts.isIdentifier(name) ? name.text : undefined)

const call = (node: ts.Node | undefined, name: string) => {
  if (!node || !ts.isCallExpression(node)) return false
  return ts.isIdentifier(node.expression) && node.expression.text === name
}

const initValue = (node: ts.CallExpression) => {
  const arg = node.arguments.at(-1)
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false
  return arg.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return false
    return ts.isIdentifier(prop.name) && prop.name.text === "initialValue"
  })
}

const first = (name: ts.BindingName) => {
  if (!ts.isArrayBindingPattern(name)) return
  const item = name.elements[0]
  if (!item || !ts.isBindingElement(item)) return
  return id(item.name)
}

const hook = (node: ts.VariableDeclaration, res: Set<string>) => {
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return
  if (!ts.isIdentifier(node.initializer.expression)) return
  const props = hooks.get(node.initializer.expression.text)
  if (!props || !ts.isObjectBindingPattern(node.name)) return
  for (const item of node.name.elements) {
    const prop = item.propertyName && ts.isIdentifier(item.propertyName) ? item.propertyName.text : id(item.name)
    const name = id(item.name)
    if (prop && name && props.has(prop)) res.add(name)
  }
}

const collect = (sf: ts.SourceFile, node: ts.Node, res: Set<string>, errs: string[]) => {
  if (ts.isVariableDeclaration(node)) {
    hook(node, res)
    if (call(node.initializer, "createResource")) {
      const name = first(node.name)
      if (name) {
        res.add(name)
        if (!init.has(`${rel(sf.fileName)}:${name}`) && !initValue(node.initializer as ts.CallExpression)) {
          errs.push(`${loc(sf, node)} ${name} is missing createResource initialValue`)
        }
      }
    }
  }
  ts.forEachChild(node, (child) => collect(sf, child, res, errs))
}

const reads = (sf: ts.SourceFile, node: ts.Node, res: Set<string>, errs: string[]) => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && res.has(node.expression.text)) {
    errs.push(`${loc(sf, node)} reads ${node.expression.text}(); use ${node.expression.text}.latest`)
  }
  ts.forEachChild(node, (child) => reads(sf, child, res, errs))
}

const scan = async () => {
  const errs: string[] = []
  for (const file of await files()) {
    const text = await Bun.file(file).text()
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
    const res = new Set<string>()
    collect(sf, sf, res, errs)
    reads(sf, sf, res, errs)
  }
  return errs
}

describe("resource suspense guards", () => {
  test("resources used by UI code cannot suspend accidentally", async () => {
    expect(await scan()).toEqual([])
  })
})

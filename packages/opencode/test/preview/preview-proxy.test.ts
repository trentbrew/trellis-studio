import { expect, test } from "bun:test"
import { injectBridge } from "../../src/preview/proxy"

const BASE = '<base href="http://localhost:3000/">'
const SCRIPT = '<script>/*bridge*/</script>'

test("injects before </head>", () => {
  const html = "<html><head><title>App</title></head><body>hi</body></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  expect(result).toContain(`${BASE}${SCRIPT}</head>`)
  expect(result).toContain("<body>hi</body>")
})

test("case-insensitive </HEAD> — bridge injected before close tag", () => {
  const html = "<html><HEAD><title>App</title></HEAD><body>hi</body></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  // Replacement string is always lowercase; verify bridge is present and </head> appears after it
  expect(result).toContain(BASE)
  expect(result).toContain(SCRIPT)
  expect(result.indexOf(SCRIPT)).toBeLessThan(result.indexOf("</head>"))
})

test("creates <head> when only <body> present", () => {
  const html = "<html><body>content</body></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  expect(result).toContain(`<head>${BASE}${SCRIPT}</head><body`)
  expect(result).toContain("content")
})

test("case-insensitive <BODY> fallback — bridge injected before body", () => {
  const html = "<html><BODY>content</BODY></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  // Replacement produces lowercase <body in output
  expect(result).toContain(`<head>${BASE}${SCRIPT}</head><body`)
  expect(result).toContain("content")
})

test("prepends to bare fragment with no head or body", () => {
  const html = "<div>fragment</div>"
  const result = injectBridge(html, BASE, SCRIPT)
  expect(result.startsWith(`${BASE}${SCRIPT}`)).toBe(true)
  expect(result).toContain("<div>fragment</div>")
})

test("replaces only first </head> when multiple present", () => {
  const html = "<html><head></head><body><div></head></div></body></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  const matches = [...result.matchAll(/<base /gi)]
  expect(matches).toHaveLength(1)
})

test("empty string gets bridge prepended", () => {
  const result = injectBridge("", BASE, SCRIPT)
  expect(result).toBe(`${BASE}${SCRIPT}`)
})

test("preserves content after injection", () => {
  const html = "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body><h1>Hello</h1></body></html>"
  const result = injectBridge(html, BASE, SCRIPT)
  expect(result).toContain("<meta charset='utf-8'>")
  expect(result).toContain("<h1>Hello</h1>")
  expect(result).toContain(BASE)
  expect(result).toContain(SCRIPT)
})

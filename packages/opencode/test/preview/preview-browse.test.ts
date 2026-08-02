import { expect, test } from "bun:test"
import { allowed, injectBrowse, locationShim } from "../../src/preview/browse"

test("allows public https URLs", () => {
  expect(allowed("https://nlnet.nl/propose/")?.href).toBe("https://nlnet.nl/propose/")
})

test("blocks local and private hosts", () => {
  expect(allowed("http://localhost:3000")).toBeUndefined()
  expect(allowed("http://127.0.0.1:4096")).toBeUndefined()
  expect(allowed("http://192.168.1.10/")).toBeUndefined()
  expect(allowed("http://169.254.169.254/latest/meta-data/")).toBeUndefined()
  expect(allowed("file:///etc/passwd")).toBeUndefined()
})

test("injects base href and navigation bridge", () => {
  const html = "<html><head><title>Grant</title></head><body><a href='/next'>Next</a></body></html>"
  const result = injectBrowse(html, new URL("https://nlnet.nl/propose/"))
  expect(result).toContain('<base href="https://nlnet.nl/propose/">')
  expect(result).toContain("oc-browse")
  expect(result).toContain("<a href='/next'>Next</a>")
})

test("injects a location shim for SPA hydration", () => {
  const target = new URL("https://wattenberger.com/thoughts/the-internet-for-the-mind/")
  expect(locationShim(target)).toContain("history.replaceState")
  expect(locationShim(target)).toContain("/thoughts/the-internet-for-the-mind/")
  const result = injectBrowse("<html><head></head><body></body></html>", target)
  expect(result).toContain("history.replaceState")
})

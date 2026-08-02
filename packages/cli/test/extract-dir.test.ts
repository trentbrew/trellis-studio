import { describe, expect, test } from "bun:test"

// Extract directory from base64-encoded path segment, returns { pathname, directory }
function extractDir(path: string): { pathname: string; directory?: string } {
  const match = path.match(/^\/([A-Za-z0-9_-]{10,})(\/.*)?$/)
  if (!match) return { pathname: path }

  const encoded = match[1]
  const rest = match[2] || "/"

  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = Buffer.from(normalized, "base64").toString("utf-8")

    // Must be a valid absolute path with only printable ASCII
    if (!decoded.startsWith("/") || /[^\x20-\x7e]/.test(decoded)) return { pathname: path }

    return { pathname: rest, directory: decoded }
  } catch {
    return { pathname: path }
  }
}

describe("extractDir", () => {
  test("should extract directory from base64-encoded path", () => {
    // Encode "/Users/test/project"
    const dir = "/Users/test/project"
    const encoded = Buffer.from(dir).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
    const path = `/${encoded}/stats`

    const result = extractDir(path)

    expect(result.pathname).toBe("/stats")
    expect(result.directory).toBe(dir)
  })

  test("should not match regular API paths like /permission", () => {
    // "permission" is exactly 10 chars and matches the regex, but decodes to garbage
    const result = extractDir("/permission")

    // Should NOT extract - returns original path
    expect(result.pathname).toBe("/permission")
    expect(result.directory).toBeUndefined()
  })

  test("should not match /global/event", () => {
    const result = extractDir("/global/event")

    expect(result.pathname).toBe("/global/event")
    expect(result.directory).toBeUndefined()
  })

  test("should not match /session", () => {
    const result = extractDir("/session")

    expect(result.pathname).toBe("/session")
    expect(result.directory).toBeUndefined()
  })

  test("should not match /trellis/stats", () => {
    const result = extractDir("/trellis/stats")

    expect(result.pathname).toBe("/trellis/stats")
    expect(result.directory).toBeUndefined()
  })

  test("should not match paths with base64-looking segments that decode to non-absolute paths", () => {
    // "aGVsbG8" is "hello" in base64 - doesn't start with /
    const result = extractDir("/aGVsbG8/stats")

    expect(result.pathname).toBe("/aGVsbG8/stats")
    expect(result.directory).toBeUndefined()
  })

  test("should handle root path without trailing segment", () => {
    const dir = "/home/user/my-project"
    const encoded = Buffer.from(dir).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
    const path = `/${encoded}`

    const result = extractDir(path)

    expect(result.pathname).toBe("/")
    expect(result.directory).toBe(dir)
  })

  test("should handle paths with hyphens and underscores (URL-safe base64)", () => {
    // Path that produces URL-safe base64 with - and _
    const dir = "/path/with/special?chars>"
    const encoded = Buffer.from(dir).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
    const path = `/${encoded}/api`

    const result = extractDir(path)

    expect(result.pathname).toBe("/api")
    expect(result.directory).toBe(dir)
  })

  test("should reject base64 that decodes to binary garbage", () => {
    // "permission" decodes to binary: 0xA5 0xEB 0x26...
    // This was the bug that caused ERR_INVALID_CHAR
    const result = extractDir("/permission")

    expect(result.pathname).toBe("/permission")
    expect(result.directory).toBeUndefined()
  })

  test("should handle short paths that don't match regex", () => {
    const result = extractDir("/abc")

    expect(result.pathname).toBe("/abc")
    expect(result.directory).toBeUndefined()
  })
})

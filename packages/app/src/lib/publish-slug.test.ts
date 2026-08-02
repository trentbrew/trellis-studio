import { describe, expect, test } from "bun:test"
import { slugifyPublishName, suggestNextSlug, validatePublishSlug } from "./publish-slug"

describe("validatePublishSlug", () => {
  test("accepts valid slug", () => {
    expect(validatePublishSlug("my-app")).toEqual({ ok: true })
  })

  test("rejects all digits", () => {
    expect(validatePublishSlug("123")).toEqual({ ok: false, reason: "digits" })
  })

  test("rejects too short", () => {
    expect(validatePublishSlug("ab")).toEqual({ ok: false, reason: "short" })
  })
})

describe("suggestNextSlug", () => {
  test("appends numeric suffix", () => {
    expect(suggestNextSlug("my-game")).toBe("my-game-2")
  })

  test("stays within length limit", () => {
    const base = "a".repeat(63)
    const next = suggestNextSlug(base)
    expect(next.length).toBeLessThanOrEqual(63)
    expect(validatePublishSlug(next).ok).toBe(true)
  })
})

describe("slugifyPublishName", () => {
  test("normalizes project name", () => {
    expect(slugifyPublishName("My Cool App!")).toBe("my-cool-app")
  })

  test("adds letter prefix for numeric names", () => {
    expect(slugifyPublishName("123")).toMatch(/[a-z]/)
  })
})

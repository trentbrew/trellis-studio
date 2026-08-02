import { describe, expect, test } from "bun:test"
import {
  isReservedCollectionKey,
  normalizeCollectionKey,
  suggestCollectionKey,
  validateCollectionKey,
} from "./collection-key"

describe("collection-key", () => {
  test("normalizes names to snake_case keys", () => {
    expect(normalizeCollectionKey(" Blog Post ")).toBe("blog_post")
  })

  test("rejects reserved system keys", () => {
    expect(isReservedCollectionKey("project")).toBe(true)
    expect(validateCollectionKey("project")).toContain("reserved system")
    expect(validateCollectionKey("project")).toContain("portfolio")
  })

  test("suggests alternatives for common collisions", () => {
    expect(suggestCollectionKey("Projects")).toBe("portfolio")
    expect(suggestCollectionKey("issue")).toBe("articles")
  })

  test("rejects projection-owned keys", () => {
    expect(isReservedCollectionKey("calendar_event")).toBe(true)
    expect(validateCollectionKey("calendar_event")).toContain("reserved projection")
  })

  test("accepts valid custom keys", () => {
    expect(validateCollectionKey("portfolio")).toBeNull()
    expect(validateCollectionKey("blog_post")).toBeNull()
  })

  test("rejects invalid identifiers", () => {
    expect(validateCollectionKey("9lives")).toContain("letters")
    expect(validateCollectionKey("")).toContain("required")
  })

  test("rejects duplicate keys", () => {
    expect(validateCollectionKey("blog", { exists: true })).toContain("already exists")
  })
})

import { describe, expect, test } from "bun:test"
import { formatIconKey, iconsMatch, parseIconKey } from "./icon-key"
import { isCustomIconKey, resolveIconLibrary } from "./icon-resolve"

describe("icon-key", () => {
  test("parse bare keys as lucide", () => {
    expect(parseIconKey("heart")).toEqual({ library: "lucide", key: "heart", raw: "heart" })
  })

  test("parse custom namespace", () => {
    expect(parseIconKey("custom:brain")).toEqual({ library: "custom", key: "brain", raw: "custom:brain" })
  })

  test("iconsMatch ignores lucide prefix", () => {
    expect(iconsMatch("heart", "lucide:heart")).toBe(true)
  })

  test("formatIconKey keeps lucide bare and namespaces custom", () => {
    expect(formatIconKey("lucide", "heart")).toBe("heart")
    expect(formatIconKey("custom", "brain")).toBe("custom:brain")
  })
})

describe("icon-resolve", () => {
  test("detects legacy custom keys without prefix", () => {
    expect(isCustomIconKey("link_external")).toBe(true)
    expect(isCustomIconKey("heart")).toBe(false)
  })

  test("resolveIconLibrary prefers custom for legacy keys", () => {
    expect(resolveIconLibrary("link_external")).toBe("custom")
    expect(resolveIconLibrary("custom:link_external")).toBe("custom")
    expect(resolveIconLibrary("heart")).toBe("lucide")
  })
})

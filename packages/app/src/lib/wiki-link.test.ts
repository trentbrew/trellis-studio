import { describe, expect, test } from "bun:test"
import { looksLikeFile, parseWikiLink } from "./wiki-link"

describe("parseWikiLink", () => {
  test("resolves typed entity refs with alias", () => {
    expect(parseWikiLink("person:yuma-tanaka|Yuma Tanaka")).toEqual({
      kind: "entity",
      id: "person:yuma-tanaka",
      label: "Yuma Tanaka",
    })
  })

  test("resolves issue refs", () => {
    expect(parseWikiLink("issue:TRL-2")).toEqual({
      kind: "entity",
      id: "issue:TRL-2",
      label: "issue:TRL-2",
    })
    expect(parseWikiLink("TRL-5|Issue five")).toEqual({
      kind: "entity",
      id: "issue:TRL-5",
      label: "Issue five",
    })
  })

  test("resolves hash entity refs", () => {
    expect(parseWikiLink("#person:alex|Alex")).toEqual({
      kind: "entity",
      id: "person:alex",
      label: "Alex",
    })
  })

  test("resolves file paths", () => {
    expect(parseWikiLink("jd.md")).toEqual({
      kind: "file",
      id: "jd.md",
      label: "jd.md",
    })
    expect(parseWikiLink("file:docs/readme.md")).toEqual({
      kind: "file",
      id: "docs/readme.md",
      label: "file:docs/readme.md",
    })
  })
})

describe("looksLikeFile", () => {
  test("treats bare paths as files", () => {
    expect(looksLikeFile("claude_thread.md")).toBe(true)
    expect(looksLikeFile("docs/readme.md")).toBe(true)
  })

  test("rejects entity refs and issue ids", () => {
    expect(looksLikeFile("person:yuma")).toBe(false)
    expect(looksLikeFile("TRL-6")).toBe(false)
    expect(looksLikeFile("DEC-1")).toBe(false)
  })
})

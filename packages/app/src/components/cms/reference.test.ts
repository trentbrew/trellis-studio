import { describe, expect, test } from "bun:test"
import { backlinkIndex, joinRefs, labelOf, looksLikeRef, parseRefs, referenceCols } from "./reference"

describe("reference", () => {
  test("parseRefs splits comma-separated ids", () => {
    expect(parseRefs("author:abc, topic:def")).toEqual(["author:abc", "topic:def"])
    expect(parseRefs("")).toEqual([])
  })

  test("looksLikeRef detects entity ids", () => {
    expect(looksLikeRef("author:ab6d9305")).toBe(true)
    expect(looksLikeRef("hello")).toBe(false)
  })

  test("labelOf prefers title", () => {
    const facts = new Map([
      ["author:1", [{ e: "author:1", a: "title", v: "Jane Doe" }]],
    ])
    expect(labelOf("author:1", facts)).toBe("Jane Doe")
    expect(labelOf("author:2", facts)).toBe("2")
  })

  test("referenceCols picks schema and inferred columns", () => {
    const schema = new Map([
      ["author", { key: "author", type: "reference", target: "author" }],
      ["body", { key: "body", type: "rich_text" }],
    ])
    const raw = (id: string, key: string) => (key === "topics" && id === "x" ? "topic:a, topic:b" : undefined)
    const cols = referenceCols(["author", "body", "topics"], schema, raw, [{ id: "x" }])
    expect(cols.has("author")).toBe(true)
    expect(cols.has("topics")).toBe(true)
    expect(cols.has("body")).toBe(false)
  })

  test("joinRefs", () => {
    expect(joinRefs(["a", "b"])).toBe("a, b")
  })

  test("backlinkIndex collects inbound refs from facts and links", () => {
    const index = backlinkIndex(
      [
        { e: "article:1", a: "topics", v: "topic:a, topic:b" },
        { e: "note:2", a: "bookmark", v: "bookmark:9" },
      ],
      [{ e1: "person:3", a: "knows", e2: "topic:a" }],
    )
    expect(index.get("topic:a")).toEqual([
      { id: "article:1", via: "topics" },
      { id: "person:3", via: "knows" },
    ])
    expect(index.get("topic:b")).toEqual([{ id: "article:1", via: "topics" }])
    expect(index.get("bookmark:9")).toEqual([{ id: "note:2", via: "bookmark" }])
  })
})

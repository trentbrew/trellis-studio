import { describe, expect, test } from "bun:test"
import { entityMarkdownPath, inlineBody, markdownBody, snippet } from "./entity-body-path"

describe("entityMarkdownPath", () => {
  test("reads markdown path fact", () => {
    expect(entityMarkdownPath([{ a: "path", v: "jd.md" }])).toBe("jd.md")
    expect(entityMarkdownPath([{ a: "path", v: "@entities/artifact/jd.md" }])).toBe("@entities/artifact/jd.md")
  })

  test("ignores non-markdown paths", () => {
    expect(entityMarkdownPath([{ a: "path", v: "logo.png" }])).toBeUndefined()
  })
})

describe("inlineBody", () => {
  test("prefers body over title", () => {
    const facts = [
      { a: "title", v: "Title" },
      { a: "body", v: "Body text" },
    ]
    expect(inlineBody(facts)).toBe("Body text")
  })
})

describe("markdownBody", () => {
  test("strips yaml frontmatter", () => {
    const raw = "---\ntitle: Hi\n---\n\nHello world"
    expect(markdownBody(raw)).toBe("Hello world")
  })
})

describe("snippet", () => {
  test("truncates long text", () => {
    expect(snippet("a".repeat(200))).toHaveLength(160)
  })
})

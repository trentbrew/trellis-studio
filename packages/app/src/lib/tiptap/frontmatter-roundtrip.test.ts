import { describe, expect, test } from "bun:test"
import { parse as parseFrontmatter } from "@opencode-ai/ui/frontmatter"
import { serializeFrontmatter } from "./frontmatter-editor"

describe("frontmatter round-trip", () => {
  test("parse + serialize preserves simple meta", () => {
    const src = `---
title: Hello
mode: primary
hidden: false
---

Body content here.
`
    const parsed = parseFrontmatter(src)
    expect(parsed).toBeDefined()
    if (!parsed) return

    const recombined = serializeFrontmatter(parsed.meta) + parsed.body
    const reparsed = parseFrontmatter(recombined)
    expect(reparsed?.meta.title).toBe("Hello")
    expect(reparsed?.meta.mode).toBe("primary")
    expect(reparsed?.meta.hidden).toBe(false)
    expect(reparsed?.body.trim()).toBe("Body content here.")
  })

  test("returns undefined for body without frontmatter", () => {
    expect(parseFrontmatter("plain markdown only")).toBeUndefined()
  })

  test("returns undefined when --- is a horizontal rule, not frontmatter", () => {
    // Content between two `---` lines that YAML can coerce into an object
    // should still be rejected because it does not look like obsidian-style
    // frontmatter (first line is not a `key:` pattern).
    const src = `Some intro

---

## Section heading

A paragraph of text.

- A list item: with a colon
- Another item

---

More body.
`
    expect(parseFrontmatter(src)).toBeUndefined()
  })

  test("returns undefined for frontmatter-like keys with markdown syntax", () => {
    // Even if YAML.parse produces an object, keys containing markdown
    // control characters (headings, emphasis, links) are rejected.
    const src = `---
**Bold key**: value
# Heading key: value
[link]: value
> quote: value
---
body
`
    expect(parseFrontmatter(src)).toBeUndefined()
  })

  test("serialize handles arrays and nested objects", () => {
    const meta = {
      tags: ["a", "b"],
      tools: { search: true, write: false },
    }
    const yaml = serializeFrontmatter(meta)
    expect(yaml).toContain("tags:")
    expect(yaml).toContain("- a")
    expect(yaml).toContain("search: true")
    expect(yaml).toContain("write: false")
  })

  test("edits to meta persist through serialize", () => {
    const src = `---
title: Old
---
body
`
    const parsed = parseFrontmatter(src)!
    const edited = { ...parsed.meta, title: "New", added: "value" }
    const recombined = serializeFrontmatter(edited) + parsed.body
    const reparsed = parseFrontmatter(recombined)!
    expect(reparsed.meta.title).toBe("New")
    expect(reparsed.meta.added).toBe("value")
    expect(reparsed.body.trim()).toBe("body")
  })
})

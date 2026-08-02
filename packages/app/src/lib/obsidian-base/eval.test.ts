import { describe, expect, test } from "bun:test"
import { evalBoolean, evaluate } from "./eval"
import { linkValue, type NoteRecord } from "./types"

function note(opts: Partial<NoteRecord["file"]> & { properties?: Record<string, unknown> } = {}): NoteRecord {
  const file = {
    name: "Untitled.md",
    basename: "Untitled",
    path: "Untitled.md",
    folder: "",
    ext: "md",
    size: 0,
    ctime: 0,
    mtime: 0,
    tags: [],
    links: [],
    ...opts,
  }
  return { file, properties: opts.properties ?? {} }
}

describe("evaluate — file metadata", () => {
  test("file.name access", () => {
    const ctx = { note: note({ name: "Albums.md" }) }
    expect(evaluate("file.name", ctx)).toBe("Albums.md")
  })

  test("file.name.contains", () => {
    const ctx = { note: note({ name: "Template — daily.md" }) }
    expect(evalBoolean('file.name.contains("Template")', ctx)).toBe(true)
    expect(evalBoolean('file.name.contains("Album")', ctx)).toBe(false)
  })

  test("!file.name.contains", () => {
    const ctx = { note: note({ name: "Album.md" }) }
    expect(evalBoolean('!file.name.contains("Template")', ctx)).toBe(true)
  })

  test("file.hasTag", () => {
    const ctx = { note: note({ tags: ["music", "review"] }) }
    expect(evalBoolean('file.hasTag("music")', ctx)).toBe(true)
    expect(evalBoolean('file.hasTag("food")', ctx)).toBe(false)
  })

  test("file.inFolder", () => {
    const ctx = { note: note({ folder: "Notes/Albums" }) }
    expect(evalBoolean('file.inFolder("Notes")', ctx)).toBe(true)
    expect(evalBoolean('file.inFolder("Notes/Albums")', ctx)).toBe(true)
    expect(evalBoolean('file.inFolder("Daily")', ctx)).toBe(false)
  })
})

describe("evaluate — note properties", () => {
  test("bare key resolves frontmatter", () => {
    const ctx = { note: note({ properties: { rating: 5 } }) }
    expect(evaluate("rating", ctx)).toBe(5)
    expect(evalBoolean("rating > 4", ctx)).toBe(true)
  })

  test("note.categories.contains(link(...))", () => {
    const ctx = {
      note: note({
        properties: { categories: [linkValue("Albums")] },
      }),
    }
    expect(evalBoolean('note.categories.contains(link("Albums"))', ctx)).toBe(true)
    expect(evalBoolean('note.categories.contains(link("Other"))', ctx)).toBe(false)
  })

  test("list(artist).contains(this) — using bare list call as identity", () => {
    const ctx = {
      note: note({
        properties: { artist: ["Kevin Kelly"] },
      }),
    }
    // list(artist) returns the list itself when given a single list arg.
    expect(evalBoolean('list(artist).contains("Kevin Kelly")', ctx)).toBe(true)
  })

  test("missing property is falsy", () => {
    const ctx = { note: note() }
    expect(evalBoolean("missing", ctx)).toBe(false)
    expect(evalBoolean('missing.contains("x")', ctx)).toBe(false)
  })
})

describe("evaluate — operators", () => {
  test("comparisons", () => {
    const ctx = { note: note({ properties: { rating: 4.5 } }) }
    expect(evalBoolean("rating >= 4", ctx)).toBe(true)
    expect(evalBoolean("rating < 4", ctx)).toBe(false)
  })

  test("logical and/or/not", () => {
    const ctx = { note: note({ properties: { a: true, b: false } }) }
    expect(evalBoolean("a && b", ctx)).toBe(false)
    expect(evalBoolean("a || b", ctx)).toBe(true)
    expect(evalBoolean("!b", ctx)).toBe(true)
  })
})

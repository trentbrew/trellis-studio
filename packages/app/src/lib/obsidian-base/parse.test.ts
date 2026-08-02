import { describe, expect, test } from "bun:test"
import { combineFilters, parseBase } from "./parse"
import { matches, applyFilter } from "./filter"
import { linkValue, type NoteRecord } from "./types"

const ALBUMS_BASE = `filters:
  and:
    - note.categories.contains(link("Albums"))
    - '!file.name.contains("Template")'
properties:
  file.name:
    displayName: Album
  note.year:
    displayName: Year
  note.artist:
    displayName: Artist
  note.created:
    displayName: Added
  note.rating:
    displayName: Rating
  note.genre:
    displayName: Genre
views:
  - type: table
    name: Albums
    order:
      - file.name
      - artist
      - rating
      - year
      - genre
  - type: table
    name: Artist
    filters:
      and:
        - list(artist).contains(this)
    order:
      - file.name
      - artist
      - rating
      - year
      - genre
`

function note(name: string, props: Record<string, unknown> = {}): NoteRecord {
  return {
    file: {
      name: `${name}.md`,
      basename: name,
      path: `Albums/${name}.md`,
      folder: "Albums",
      ext: "md",
      size: 0,
      ctime: 0,
      mtime: 0,
      tags: [],
      links: [],
    },
    properties: props,
  }
}

describe("parseBase", () => {
  test("parses Albums.base sample", () => {
    const spec = parseBase(ALBUMS_BASE)
    expect(spec.properties["file.name"]?.displayName).toBe("Album")
    expect(spec.properties["note.rating"]?.displayName).toBe("Rating")
    expect(spec.views).toHaveLength(2)
    expect(spec.views[0].name).toBe("Albums")
    expect(spec.views[0].order).toContain("file.name")
  })

  test("global filters become AND node", () => {
    const spec = parseBase(ALBUMS_BASE)
    expect(spec.filters?.kind).toBe("and")
  })
})

describe("filter evaluation against synthetic notes", () => {
  const spec = parseBase(ALBUMS_BASE)

  const albumNote = note("OK Computer", {
    categories: [linkValue("Albums")],
    artist: ["Radiohead"],
    year: 1997,
    rating: 5,
  })
  const templateNote = note("Template", {
    categories: [linkValue("Albums")],
  })
  const unrelatedNote = note("Some Recipe", {
    categories: [linkValue("Recipes")],
  })

  test("Albums filter matches album notes", () => {
    expect(matches(spec.filters, albumNote)).toBe(true)
  })

  test("Albums filter excludes templates", () => {
    expect(matches(spec.filters, templateNote)).toBe(false)
  })

  test("Albums filter excludes notes not categorized as Albums", () => {
    expect(matches(spec.filters, unrelatedNote)).toBe(false)
  })

  test("applyFilter returns only matching notes", () => {
    const filtered = applyFilter([albumNote, templateNote, unrelatedNote], spec.filters)
    expect(filtered.map((n) => n.file.basename)).toEqual(["OK Computer"])
  })

  test("view-specific filter composes with global via AND", () => {
    const artistView = spec.views[1]
    const combined = combineFilters(spec.filters, artistView.filters)
    // list(artist).contains(this) — artistView is for current artist page,
    // here we just check the combined filter still requires the album category.
    expect(matches(combined, albumNote)).toBe(false) // "this" (note.properties) isn't in artist list
    expect(matches(combined, unrelatedNote)).toBe(false)
  })
})

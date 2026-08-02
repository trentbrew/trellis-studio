import { describe, expect, test } from "bun:test"
import { buildNote, walkVault, type DirectoryListing, type LoadedNote } from "./notes"
import { isLinkMarker } from "./types"

describe("buildNote", () => {
  test("parses frontmatter into properties + links", () => {
    const loaded: LoadedNote = {
      path: "Albums/OK Computer.md",
      content: `---
categories:
  - "[[Albums]]"
artist: Radiohead
year: 1997
rating: 5
tags: [music, rock]
---

A great record. See also [[Kid A]] and [[Amnesiac|the follow-up]].
`,
    }
    const note = buildNote(loaded)
    expect(note.file.basename).toBe("OK Computer")
    expect(note.file.folder).toBe("Albums")
    expect(note.file.ext).toBe("md")
    expect(note.file.tags).toContain("music")
    expect(note.file.links).toEqual(["Kid A", "Amnesiac"])

    expect(note.properties.artist).toBe("Radiohead")
    expect(note.properties.year).toBe(1997)
    const cats = note.properties.categories as unknown[]
    expect(Array.isArray(cats)).toBe(true)
    expect(isLinkMarker(cats[0])).toBe(true)
    if (isLinkMarker(cats[0])) expect(cats[0].target).toBe("Albums")
  })

  test("inline tags get pulled out of the body", () => {
    const loaded: LoadedNote = {
      path: "Notes/quick.md",
      content: "Just a note #idea and another #project/sub.",
    }
    const note = buildNote(loaded)
    expect(note.file.tags).toEqual(["idea", "project/sub"])
  })

  test("no frontmatter — empty properties, file metadata still populated", () => {
    const loaded: LoadedNote = { path: "README.md", content: "hello" }
    const note = buildNote(loaded)
    expect(note.properties).toEqual({})
    expect(note.file.name).toBe("README.md")
  })
})

describe("walkVault", () => {
  const tree: Record<string, DirectoryListing[]> = {
    "": [
      { path: "Albums", type: "directory" },
      { path: "Recipes", type: "directory" },
      { path: ".obsidian", type: "directory" },
      { path: "README.md", type: "file" },
    ],
    Albums: [
      { path: "Albums/OK Computer.md", type: "file" },
      { path: "Albums/Kid A.md", type: "file" },
      { path: "Albums/cover.png", type: "file" },
    ],
    Recipes: [{ path: "Recipes/Bread.md", type: "file" }],
    ".obsidian": [{ path: ".obsidian/workspace.json", type: "file" }],
  }

  const files: Record<string, string> = {
    "README.md": "Root readme",
    "Albums/OK Computer.md": "---\nrating: 5\n---\nbody",
    "Albums/Kid A.md": "---\nrating: 4\n---\nbody",
    "Recipes/Bread.md": "---\nflour: 500\n---\nbody",
  }

  test("walks markdown files only and skips hidden Obsidian dir", async () => {
    const notes = await walkVault("", {
      listDir: async (dir) => tree[dir] ?? [],
      readFile: async (path) => (files[path] ? { path, content: files[path] } : undefined),
    })
    const paths = notes.map((n) => n.file.path).sort()
    expect(paths).toEqual(["Albums/Kid A.md", "Albums/OK Computer.md", "README.md", "Recipes/Bread.md"])
  })

  test("respects maxFiles cap", async () => {
    const notes = await walkVault("", {
      listDir: async (dir) => tree[dir] ?? [],
      readFile: async (path) => (files[path] ? { path, content: files[path] } : undefined),
      maxFiles: 2,
    })
    expect(notes.length).toBeLessThanOrEqual(2)
  })
})

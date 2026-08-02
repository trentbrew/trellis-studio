import { describe, expect, test } from "bun:test"
import { autoNoteTitle, formatNoteTags, listNotes, parseNoteTags, plainNotePreview } from "./notes-model"

describe("notes-model", () => {
  test("auto title from first markdown heading line", () => {
    expect(autoNoteTitle("# Sprint ideas\n- item")).toBe("Sprint ideas")
  })

  test("lists notes newest first", () => {
    const entities = [
      { id: "note:1", type: "note" },
      { id: "note:2", type: "note" },
      { id: "issue:1", type: "issue" },
    ]
    const facts = [
      { e: "note:1", a: "type", v: "note" },
      { e: "note:1", a: "title", v: "Older" },
      { e: "note:1", a: "content", v: "one" },
      { e: "note:1", a: "createdAt", v: "2026-01-01T00:00:00.000Z" },
      { e: "note:1", a: "updatedAt", v: "2026-01-01T00:00:00.000Z" },
      { e: "note:2", a: "type", v: "note" },
      { e: "note:2", a: "title", v: "Newer" },
      { e: "note:2", a: "content", v: "two" },
      { e: "note:2", a: "createdAt", v: "2026-02-01T00:00:00.000Z" },
      { e: "note:2", a: "updatedAt", v: "2026-02-01T00:00:00.000Z" },
    ]
    expect(listNotes(entities, facts).map((note) => note.id)).toEqual(["note:2", "note:1"])
  })

  test("plain preview strips markdown", () => {
    expect(plainNotePreview("**Hello** _world_")).toBe("Hello world")
  })

  test("parse and format tags", () => {
    expect(parseNoteTags(" Alpha, beta ,alpha,BETA ")).toEqual(["alpha", "beta"])
    expect(formatNoteTags(["gamma", "alpha"])).toBe("gamma, alpha")
  })
})

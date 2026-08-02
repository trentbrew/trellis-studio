import { describe, expect, test } from "bun:test"
import { parseCsv } from "./csv"

describe("csv import", () => {
  test("parses quoted CSV cells", () => {
    expect(parseCsv('name,notes\n"Ada, Lovelace","line one\nline two"\n')).toEqual([
      ["name", "notes"],
      ["Ada, Lovelace", "line one\nline two"],
    ])
  })
})

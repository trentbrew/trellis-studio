import { describe, expect, test } from "bun:test"
import { isEmptyValue, missingRequired, publishBlocks, publishError } from "@/components/cms/schema"
import type { PropDef } from "@/pages/session/database-panel-utils"

const props: PropDef[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "url", label: "URL", type: "url", required: true },
  { key: "note", label: "Note", type: "text" },
]

describe("schema validation", () => {
  test("isEmptyValue treats blank strings as empty", () => {
    expect(isEmptyValue(undefined)).toBe(true)
    expect(isEmptyValue("")).toBe(true)
    expect(isEmptyValue("  ")).toBe(true)
    expect(isEmptyValue(false)).toBe(false)
    expect(isEmptyValue("ok")).toBe(false)
  })

  test("missingRequired lists empty required fields", () => {
    const read = (key: string) => (key === "title" ? "Hello" : undefined)
    expect(missingRequired(props, read).map((d) => d.key)).toEqual(["url"])
  })

  test("publishError formats message", () => {
    const read = () => undefined
    expect(publishError(props, read)).toBe("Missing required fields: Title, URL")
  })

  test("publishBlocks groups missing fields by entry", () => {
    const read = (id: string, key: string) => (id === "a" && key === "title" ? "Ok" : undefined)
    const blocks = publishBlocks(props, ["a", "b"], read)
    expect(blocks).toEqual([
      { id: "a", missing: ["URL"] },
      { id: "b", missing: ["Title", "URL"] },
    ])
  })
})

import { describe, expect, test } from "bun:test"
import { parentDir, shouldBumpWorkspaceFileCatalog } from "./catalog"

describe("workspace file catalog", () => {
  test("bumps on add and unlink", () => {
    expect(
      shouldBumpWorkspaceFileCatalog({
        type: "file.watcher.updated",
        properties: { file: "boards/a.whiteboard", event: "add" },
      }),
    ).toBe(true)
    expect(
      shouldBumpWorkspaceFileCatalog({
        type: "file.watcher.updated",
        properties: { file: "boards/a.whiteboard", event: "unlink" },
      }),
    ).toBe(true)
  })

  test("ignores change and git paths", () => {
    expect(
      shouldBumpWorkspaceFileCatalog({
        type: "file.watcher.updated",
        properties: { file: "src/a.ts", event: "change" },
      }),
    ).toBe(false)
    expect(
      shouldBumpWorkspaceFileCatalog({
        type: "file.watcher.updated",
        properties: { file: ".git/index", event: "unlink" },
      }),
    ).toBe(false)
  })

  test("parentDir", () => {
    expect(parentDir("a/b/c.whiteboard")).toBe("a/b")
    expect(parentDir("root.whiteboard")).toBe("")
  })
})

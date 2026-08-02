import { describe, expect, test } from "bun:test"
import type { PaneNode } from "@/context/terminal"
import { ptyInPaneTree } from "@/pages/session/terminal-pane-utils"

describe("ptyInPaneTree", () => {
  const tree: PaneNode = {
    type: "split",
    direction: "h",
    ratio: 0.5,
    a: { type: "leaf", ptyId: "a" },
    b: { type: "leaf", ptyId: "b" },
  }

  test("finds leaves in a split tree", () => {
    expect(ptyInPaneTree(tree, "a")).toBe(true)
    expect(ptyInPaneTree(tree, "b")).toBe(true)
    expect(ptyInPaneTree(tree, "c")).toBe(false)
  })

  test("returns false when tree is undefined", () => {
    expect(ptyInPaneTree(undefined, "a")).toBe(false)
  })
})

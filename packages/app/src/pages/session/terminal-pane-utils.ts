import type { PaneNode } from "@/context/terminal"

export function ptyInPaneTree(tree: PaneNode | undefined, ptyId: string): boolean {
  if (!tree) return false
  if (tree.type === "leaf") return tree.ptyId === ptyId
  return ptyInPaneTree(tree.a, ptyId) || ptyInPaneTree(tree.b, ptyId)
}

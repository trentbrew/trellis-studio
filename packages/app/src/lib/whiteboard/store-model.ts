import type { StoreFact } from "@/context/trellis-store"
import { whiteboardTitle } from "@/lib/whiteboard/schema"

export type WhiteboardRecord = {
  id: string
  path: string
  title: string
}

export function findWhiteboardEntityId(path: string, facts: StoreFact[]): string | undefined {
  const match = facts.find((fact) => fact.a === "path" && fact.v === path)
  return match?.e
}

export function listWhiteboardsFromStore(
  entities: { id: string; type: string }[],
  facts: StoreFact[],
): WhiteboardRecord[] {
  const ids = new Set(entities.filter((entity) => entity.type === "whiteboard").map((entity) => entity.id))
  const boards: WhiteboardRecord[] = []
  for (const id of ids) {
    const path = facts.find((fact) => fact.e === id && fact.a === "path")?.v
    if (typeof path !== "string" || !path) continue
    const titleFact = facts.find((fact) => fact.e === id && fact.a === "title")?.v
    boards.push({
      id,
      path,
      title: typeof titleFact === "string" && titleFact ? titleFact : whiteboardTitle(path),
    })
  }
  return boards.sort((a, b) => a.path.localeCompare(b.path))
}

export function mergeWhiteboardPaths(filePaths: string[], storeBoards: WhiteboardRecord[]): string[] {
  const merged = new Map<string, string>()
  for (const board of storeBoards) merged.set(board.path, board.path)
  for (const path of filePaths) merged.set(path, path)
  return [...merged.values()].sort((a, b) => a.localeCompare(b))
}

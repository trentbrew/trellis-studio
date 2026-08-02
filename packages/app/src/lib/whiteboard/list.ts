import { isWhiteboardPath } from "./schema"

export async function listWhiteboardPaths(
  findFiles: (query: { query: string; type?: "file"; limit?: number }) => Promise<string[] | undefined>,
  options?: { includeSketch?: boolean },
): Promise<string[]> {
  const results = await findFiles({ query: "whiteboard", type: "file", limit: 200 })
  const includeSketch = options?.includeSketch ?? true
  return (results ?? [])
    .filter(isWhiteboardPath)
    .filter((path) => {
      if (includeSketch) return true
      const normalized = path.replace(/\\/g, "/")
      return !normalized.includes(".trellis/sketch/")
    })
    .sort((a, b) => a.localeCompare(b))
}

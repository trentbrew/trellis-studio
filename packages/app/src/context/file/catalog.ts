/** Workspace file inventory events (lists, lenses, projections). */

export type WorkspaceFileWatcherKind = "add" | "unlink" | "change"

export type WorkspaceFileWatcherEvent = {
  type: string
  properties: unknown
}

export function parseWorkspaceFileWatcherEvent(event: WorkspaceFileWatcherEvent): {
  path: string
  kind: WorkspaceFileWatcherKind
} | undefined {
  if (event.type !== "file.watcher.updated") return undefined
  const props =
    typeof event.properties === "object" && event.properties
      ? (event.properties as Record<string, unknown>)
      : undefined
  const rawPath = typeof props?.file === "string" ? props.file : undefined
  const kind = typeof props?.event === "string" ? props.event : undefined
  if (!rawPath || !kind) return undefined
  if (kind !== "add" && kind !== "unlink" && kind !== "change") return undefined
  return { path: rawPath, kind }
}

/** Bump file indexes (find lists, projection sidebars) on create/delete/rename. */
export function shouldBumpWorkspaceFileCatalog(event: WorkspaceFileWatcherEvent): boolean {
  const parsed = parseWorkspaceFileWatcherEvent(event)
  if (!parsed) return false
  if (parsed.path.startsWith(".git/")) return false
  return parsed.kind === "add" || parsed.kind === "unlink"
}

export function parentDir(filePath: string) {
  const idx = filePath.lastIndexOf("/")
  return idx === -1 ? "" : filePath.slice(0, idx)
}

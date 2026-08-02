/**
 * Helpers for reflecting agent tool calls in the UI the moment they complete.
 *
 * The file watcher (`file.watcher.updated`) is the primary signal, but it can be
 * missed (coalesced, tool forgot to publish, native watcher disabled). Tool-part
 * completion events always arrive over the chat SSE stream, so we use them as a
 * reliable belt-and-suspenders trigger for refreshing file-backed views and
 * flagging freshly-touched paths for the green highlight.
 */

/** Built-in tools that write files the workspace lists/lenses care about. */
const FILE_MUTATION_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch", "whiteboard", "asset"])

type ToolPartLike = {
  type?: string
  tool?: string
  state?: {
    status?: string
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
}

type AgentEvent = {
  type: string
  properties?: unknown
}

function completedToolPart(event: AgentEvent): ToolPartLike | undefined {
  if (event.type !== "message.part.updated") return undefined
  const part = (event.properties as { part?: ToolPartLike } | undefined)?.part
  if (!part || part.type !== "tool" || !part.tool) return undefined
  if (part.state?.status !== "completed") return undefined
  return part
}

function collectPaths(source: Record<string, unknown> | undefined, out: Set<string>) {
  if (!source) return
  for (const key of ["filePath", "filepath", "path", "outputPath"]) {
    const value = source[key]
    if (typeof value === "string" && value.length > 0) out.add(value)
  }
}

/**
 * Raw (un-normalized) file paths touched by a just-completed file-mutation tool,
 * or `undefined` when the event is not a relevant completion.
 */
export function completedFileMutationPaths(event: AgentEvent): string[] | undefined {
  const part = completedToolPart(event)
  if (!part || !part.tool) return undefined
  if (!FILE_MUTATION_TOOLS.has(part.tool)) return undefined
  const paths = new Set<string>()
  collectPaths(part.state?.input, paths)
  collectPaths(part.state?.metadata, paths)
  return paths.size > 0 ? [...paths] : undefined
}

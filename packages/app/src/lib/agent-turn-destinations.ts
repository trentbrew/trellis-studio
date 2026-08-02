import type { Message, Part, ToolPart } from "@opencode-ai/sdk/v2"
import { getFilename } from "@opencode-ai/util/path"
import { isWhiteboardPath } from "@/lib/whiteboard/schema"
import { cmsMutationSucceeded, cmsCreateEntryFailed, cmsCreateEntryFailureLabel, mutationMetadataOk } from "@/lib/tool-mutation-succeeded"

export type AgentTurnDestination =
  | { id: string; kind: "file"; path: string; label: string }
  | { id: string; kind: "whiteboard"; path: string; label: string }
  | { id: string; kind: "cms-entry"; collection: string; entry: string; label: string }
  | { id: string; kind: "cms-collection"; collection: string; label: string }
  | { id: string; kind: "projection"; lens: string; entityId?: string; path?: string; label: string }
  | { id: string; kind: "design"; section?: string; entityId?: string; path?: string; label: string }
  | { id: string; kind: "browser"; url: string; name?: string; label: string }
  | { id: string; kind: "review"; label: string }
  | { id: string; kind: "view"; view: string; label: string }
  | { id: string; kind: "notice"; label: string; description?: string }

const FILE_MUTATION_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch", "whiteboard"])
const CMS_ENTRY_ACTIONS = new Set(["create_entry", "update_entry", "publish", "unpublish"])
const CALENDAR_MUTATION_ACTIONS = new Set(["create", "update"])
const STORE_MUTATION_ACTIONS = new Set(["define", "update"])

function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool"
}

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function collectPath(source: Record<string, unknown> | undefined, out: Set<string>) {
  if (!source) return
  for (const key of ["filePath", "filepath", "path", "outputPath", "file_path"]) {
    const value = str(source[key])
    if (value) out.add(value)
  }
}

function push(destinations: AgentTurnDestination[], seen: Set<string>, next: AgentTurnDestination) {
  if (seen.has(next.id)) return
  seen.add(next.id)
  destinations.push(next)
}

function fileDestination(path: string, seen: Set<string>, out: AgentTurnDestination[]) {
  const normalized = path.replace(/\\/g, "/")
  const name = getFilename(normalized)
  if (isWhiteboardPath(normalized)) {
    push(out, seen, {
      id: `whiteboard:${normalized}`,
      kind: "whiteboard",
      path: normalized,
      label: name === "untitled.whiteboard" ? "View whiteboard" : `View ${name.replace(/\.whiteboard$/i, "")}`,
    })
    return
  }
  push(out, seen, {
    id: `file:${normalized}`,
    kind: "file",
    path: normalized,
    label: `Open ${name}`,
  })
}

function entityProjection(id: string, type?: string): AgentTurnDestination | undefined {
  if (id.startsWith("note:") || type === "note") {
    return { id: `projection:notes:${id}`, kind: "projection", lens: "notes", entityId: id, label: "View note" }
  }
  if (id.startsWith("calendar_event:") || type === "calendar_event") {
    return {
      id: `projection:calendar:${id}`,
      kind: "projection",
      lens: "calendar",
      entityId: id,
      label: "View event",
    }
  }
  return undefined
}

function cmsEntryDestination(collection: string, entry: string, label?: string): AgentTurnDestination {
  return {
    id: `cms:${collection}:${entry}`,
    kind: "cms-entry",
    collection,
    entry,
    label: label ?? "View entry",
  }
}

function toolDestination(part: ToolPart, seen: Set<string>, out: AgentTurnDestination[]) {
  if (part.state.status !== "completed") return
  const input = record(part.state.input)
  const metadata = record(part.state.metadata)
  const action = str(input?.action)
  const title = str(part.state.title)

  if (FILE_MUTATION_TOOLS.has(part.tool)) {
    const paths = new Set<string>()
    collectPath(input, paths)
    collectPath(metadata, paths)
    for (const path of paths) fileDestination(path, seen, out)
    return
  }

  if (part.tool === "cms") {
    if (action === "create_collection" || action === "update_schema") {
      if (!cmsMutationSucceeded(part, action)) return
      const collection = str(metadata?.key) ?? str(input?.collection)
      if (!collection) return
      push(out, seen, {
        id: `cms-collection:${collection}`,
        kind: "cms-collection",
        collection,
        label: title ? `Open ${collection} collection` : "Open collection",
      })
      return
    }
    if (action && CMS_ENTRY_ACTIONS.has(action)) {
      if (action === "create_entry" && cmsCreateEntryFailed(part)) {
        const label = cmsCreateEntryFailureLabel(part)
        if (label) {
          push(out, seen, {
            id: `cms-failed:${part.callID}`,
            kind: "notice",
            label,
            description: title,
          })
        }
        return
      }
      if (!cmsMutationSucceeded(part, action)) return
      const entry = str(metadata?.id) ?? str(input?.id)
      if (!entry) return
      const collection =
        str(metadata?.collection) ?? str(input?.collection) ?? (entry.includes(":") ? entry.split(":")[0] : undefined)
      if (!collection) return
      push(out, seen, cmsEntryDestination(collection, entry, title ? `View ${getFilename(entry)}` : "View entry"))
    }
    return
  }

  if (part.tool === "calendar" && action && CALENDAR_MUTATION_ACTIONS.has(action)) {
    const id = str(metadata?.id)
    if (!id) return
    const projection = entityProjection(id, "calendar_event")
    if (projection) push(out, seen, projection)
    return
  }

  if (part.tool === "trellis_store_mutate" && action && STORE_MUTATION_ACTIONS.has(action)) {
    if (!mutationMetadataOk(part)) return
    const id = str(metadata?.id) ?? str(input?.id)
    if (!id) return
    const type = str(input?.type)
    const projection = entityProjection(id, type)
    if (projection) {
      push(out, seen, projection)
      return
    }
    if (id.includes(":") && !id.startsWith("schema:") && !id.startsWith("field:")) {
      const collection = type ?? id.split(":")[0]!
      push(out, seen, cmsEntryDestination(collection, id, "View entry"))
    }
    return
  }

  if (part.tool === "preview" || part.tool === "preview_refresh") {
    const url = str(metadata?.url)
    if (!url) return
    const name = str(metadata?.name)
    push(out, seen, {
      id: `browser:${url}`,
      kind: "browser",
      url,
      name,
      label: "Open preview",
    })
    return
  }

  if (part.tool === "navigate") {
    const tab = str(input?.tab)
    const filePath = str(input?.file_path)
    if (filePath) fileDestination(filePath, seen, out)
    if (tab === "cms") {
      push(out, seen, { id: "view:cms", kind: "view", view: "cms", label: "Open CMS" })
    } else if (tab === "browser" || tab === "preview") {
      const url = str(metadata?.url)
      if (url) {
        push(out, seen, { id: `browser:${url}`, kind: "browser", url, label: "Open browser" })
      } else {
        push(out, seen, { id: "view:browser", kind: "projection", lens: "media", label: "Open browser" })
      }
    }
    return
  }

  if (part.tool === "asset") {
    const entityId = str(metadata?.id)
    const path = str(metadata?.path)
    if (entityId || path) {
      push(out, seen, {
        id: `design:${entityId ?? path}`,
        kind: "design",
        entityId,
        path,
        label: title ? `View ${title}` : "View asset",
      })
    }
    return
  }

  if (part.tool === "design") {
    const palette = record(metadata?.palette)
    const entityId = str(palette?.id) ?? str(metadata?.id)
    push(out, seen, {
      id: `design:${entityId ?? action ?? part.tool}`,
      kind: "design",
      section: action?.includes("palette") ? "colors" : action?.includes("font") ? "type" : "brand",
      entityId,
      label: title ? `View ${title}` : "Open design",
    })
  }
}

export function assistantToolPartsForTurn(
  userMessageId: string,
  messages: Message[],
  partsByMessage: Record<string, Part[] | undefined>,
): ToolPart[] {
  const index = messages.findIndex((message) => message.id === userMessageId)
  if (index < 0) return []

  const parts: ToolPart[] = []
  for (let i = index + 1; i < messages.length; i++) {
    const message = messages[i]
    if (!message) continue
    if (message.role === "user") break
    if (message.role !== "assistant" || message.parentID !== userMessageId) continue
    for (const part of partsByMessage[message.id] ?? []) {
      if (isToolPart(part)) parts.push(part)
    }
  }
  return parts
}

export function extractTurnDestinations(input: {
  userMessageId: string
  messages: Message[]
  partsByMessage: Record<string, Part[] | undefined>
  hasFileDiffs?: boolean
}): AgentTurnDestination[] {
  const destinations: AgentTurnDestination[] = []
  const seen = new Set<string>()

  for (const part of assistantToolPartsForTurn(input.userMessageId, input.messages, input.partsByMessage)) {
    toolDestination(part, seen, destinations)
  }

  if (input.hasFileDiffs) {
    push(destinations, seen, { id: "review:changes", kind: "review", label: "View file changes" })
  }

  return destinations
}

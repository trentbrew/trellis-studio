import type { ToolPart } from "@opencode-ai/sdk/v2"

const FAILURE_TITLE_PREFIXES = [
  "error",
  "validation failed",
  "no entry created",
  "nothing to update",
  "not found",
  "reserved key",
  "no collection",
  "unknown action",
  "already exists",
]

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function mutationMetadataOk(part: ToolPart) {
  if (part.state.status !== "completed") return false
  const metadata = part.state.metadata
  if (metadata && typeof metadata.ok === "boolean") return metadata.ok
  return completedToolLooksSuccessful(part)
}

/** Completed tool whose title indicates the mutation did not succeed. */
export function completedToolLooksSuccessful(part: ToolPart) {
  if (part.state.status !== "completed") return false
  const title = part.state.title.trim().toLowerCase()
  if (!title) return false
  return !FAILURE_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix))
}

/** CMS write actions must return proof ids/keys in metadata, not just a completed status. */
export function cmsMutationSucceeded(part: ToolPart, action: string) {
  if (!mutationMetadataOk(part)) return false
  if (part.state.status !== "completed") return false
  const metadata = part.state.metadata
  if (action === "create_entry" || action === "update_entry" || action === "publish" || action === "unpublish") {
    return !!str(metadata?.id)
  }
  if (action === "create_collection" || action === "update_schema") {
    return !!(str(metadata?.key) ?? str(metadata?.collection))
  }
  return false
}

export function cmsCreateEntryFailed(part: ToolPart) {
  if (part.tool !== "cms" || part.state.status !== "completed") return false
  const action = str(part.state.input?.action)
  if (action !== "create_entry") return false
  return !cmsMutationSucceeded(part, action)
}

export function cmsCreateEntryFailureLabel(part: ToolPart) {
  if (!cmsCreateEntryFailed(part)) return undefined
  if (part.state.status !== "completed") return undefined
  const metadata = part.state.metadata
  const input = part.state.input
  const collection = str(metadata?.collection) ?? str(input?.collection)
  const title = part.state.title.trim()
  if (collection) return `Entry not saved to ${collection}`
  return title || "CMS entry not saved"
}

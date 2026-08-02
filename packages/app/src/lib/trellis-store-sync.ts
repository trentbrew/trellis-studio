/** Notify Trellis store consumers (CMS, brand guide, database panel) to reload from the server. */
export function notifyTrellisStoreChanged(quiet = true) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("trellis-store-changed", { detail: { quiet } }))
}

const STORE_MUTATION_TOOLS = new Set(["design", "trellis_store_mutate", "cms", "calendar", "memory"])

type ToolPartEvent = {
  type: "tool"
  tool: string
  state: { status: string }
}

export function isStoreMutationToolCompleted(event: { type: string; properties?: unknown }) {
  if (event.type !== "message.part.updated") return false
  const part = (event.properties as { part?: ToolPartEvent } | undefined)?.part
  if (!part || part.type !== "tool") return false
  if (part.state.status !== "completed") return false
  return STORE_MUTATION_TOOLS.has(part.tool)
}

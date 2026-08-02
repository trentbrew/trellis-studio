import { TRELLIS_CUSTOM_DATA_KEY, type MermaidStatus, type TrellisElementMeta } from "./ontology"

const MERMAID_STATUSES: readonly MermaidStatus[] = ["pending", "expanded", "error"]

export function readTrellisMeta(element: Record<string, unknown>): TrellisElementMeta | undefined {
  const custom = element.customData
  if (!custom || typeof custom !== "object") return undefined
  const trellis = (custom as Record<string, unknown>)[TRELLIS_CUSTOM_DATA_KEY]
  if (!trellis || typeof trellis !== "object") return undefined
  const meta = trellis as Record<string, unknown>
  const status = typeof meta.mermaidStatus === "string" ? (meta.mermaidStatus as MermaidStatus) : undefined
  return {
    corpusId: typeof meta.corpusId === "string" ? meta.corpusId : undefined,
    bind: typeof meta.bind === "string" ? meta.bind : undefined,
    label: typeof meta.label === "string" ? meta.label : undefined,
    mermaid: typeof meta.mermaid === "string" ? meta.mermaid : undefined,
    mermaidStatus: status && MERMAID_STATUSES.includes(status) ? status : undefined,
    mermaidGroupId: typeof meta.mermaidGroupId === "string" ? meta.mermaidGroupId : undefined,
    mermaidError: typeof meta.mermaidError === "string" ? meta.mermaidError : undefined,
  }
}

export function writeTrellisMeta(
  element: Record<string, unknown>,
  patch: TrellisElementMeta,
): Record<string, unknown> {
  const prev = readTrellisMeta(element) ?? {}
  const next: TrellisElementMeta = { ...prev, ...patch }
  const custom =
    element.customData && typeof element.customData === "object"
      ? { ...(element.customData as Record<string, unknown>) }
      : {}
  custom[TRELLIS_CUSTOM_DATA_KEY] = next
  return { ...element, customData: custom }
}

/** Stable vocabulary for agent-facing whiteboard operations. */

export const WHITEBOARD_EXT = ".whiteboard"

export const CORPUS_KINDS = ["primitive", "figure", "layout", "template"] as const
export type CorpusKind = (typeof CORPUS_KINDS)[number]

/** Prefix for corpus entry ids by kind. */
export const CORPUS_ID_PREFIX = {
  primitive: "primitive.",
  figure: "figure.",
  layout: "layout.",
  template: "template.",
} as const

/** Excalidraw element `customData.trellis` shape. */
export const TRELLIS_CUSTOM_DATA_KEY = "trellis" as const

/** Corpus id used for mermaid-generated diagrams (and their pending placeholders). */
export const MERMAID_CORPUS_ID = "mermaid" as const

/** Excalidraw `FONT_FAMILY` ids (0.18) — keep here to avoid document ↔ text-layout cycles. */
export const EXCALIDRAW_FONT_HELVETICA = 2
export const EXCALIDRAW_FONT_CASCADIA = 3

/** Lifecycle of a mermaid diagram element: agent writes `pending`, the host expands it. */
export type MermaidStatus = "pending" | "expanded" | "error"

export type TrellisElementMeta = {
  /** Corpus entry slug, e.g. `figure.mindmap-node`. */
  corpusId?: string
  /** Graph binding without `binds:` prefix, e.g. `issue:42`, `entity:decision-7`. */
  bind?: string
  /** Optional human label for describe output. */
  label?: string
  /** Mermaid source kept on the diagram so it stays re-generatable. */
  mermaid?: string
  /** Expansion lifecycle (set by the agent tool and the Studio host). */
  mermaidStatus?: MermaidStatus
  /** Group id linking all elements generated from one mermaid source. */
  mermaidGroupId?: string
  /** Last conversion error message (when `mermaidStatus === "error"`). */
  mermaidError?: string
}

export function parseBinding(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith("binds:")) return trimmed.slice("binds:".length)
  return trimmed
}

export function formatBinding(bind: string): string {
  return bind.startsWith("binds:") ? bind : `binds:${bind}`
}

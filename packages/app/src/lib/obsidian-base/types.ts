export type BaseFilterExpr = string

export type BaseFilterNode =
  | { kind: "and"; items: BaseFilterNode[] }
  | { kind: "or"; items: BaseFilterNode[] }
  | { kind: "not"; item: BaseFilterNode }
  | { kind: "expr"; src: BaseFilterExpr }

export type BasePropertyDef = {
  key: string
  displayName?: string
}

export type BaseViewType = "table" | "cards" | "list"

export type BaseView = {
  type: BaseViewType
  name: string
  filters?: BaseFilterNode
  order?: string[]
  groupBy?: { property: string; direction?: "ASC" | "DESC" } | string
  sort?: Array<{ property: string; direction?: "ASC" | "DESC" }>
  limit?: number
}

export type BaseSpec = {
  filters?: BaseFilterNode
  properties: Record<string, BasePropertyDef>
  views: BaseView[]
}

export type NoteFile = {
  name: string
  basename: string
  path: string
  folder: string
  ext: string
  size: number
  ctime: number
  mtime: number
  tags: string[]
  links: string[]
}

export type NoteRecord = {
  file: NoteFile
  properties: Record<string, unknown>
}

export type LinkMarker = { __obsidianLink: true; target: string; display?: string }

export function isLinkMarker(value: unknown): value is LinkMarker {
  return typeof value === "object" && value !== null && (value as LinkMarker).__obsidianLink === true
}

export function linkValue(target: string, display?: string): LinkMarker {
  return { __obsidianLink: true, target, display }
}

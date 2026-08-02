import type { StoreEntity } from "@/context/trellis-store"
import { ENTITY_ICON_KEYS, defaultEntityColor, defaultEntityIcon } from "@/lib/entity-theme"

export type PropType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "email"
  | "url"
  | "color"
  | "select"
  | "multiselect"
  | "file"
  | "formula"
  | "rich_text"
  | "reference"
  | "image"
  | "video"
  | "audio"

export type DateRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly"

export interface PropDef {
  key: string
  label: string
  type: PropType
  required?: boolean
  default?: string
  options?: string[]
  colors?: Record<string, string>
  formula?: string
  target?: string
  min?: number
  max?: number
  step?: number
  repeat?: DateRepeat
}

const LOCKED_RANK = [
  "type",
  "id",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "lastEdited",
  "cms_status",
] as const

/** Schema fields managed by the platform or Configure tab — not editable in Properties. */
export function lockedProp(key: string) {
  const k = key.trim()
  if (!k) return false
  if (k === "type" || k === "id" || k === "_id") return true
  if (k === "color" || k === "icon") return true
  if (k === "createdAt" || k === "updatedAt" || k === "createdBy" || k === "updatedBy" || k === "lastEdited")
    return true
  if (k === "cms_status" || k.startsWith("cms_")) return true
  return false
}

export function sortPropDefs(defs: PropDef[]) {
  const locked = defs.filter((d) => lockedProp(d.key))
  const custom = defs.filter((d) => !lockedProp(d.key))
  const rank = (key: string) => {
    const i = LOCKED_RANK.indexOf(key as (typeof LOCKED_RANK)[number])
    return i >= 0 ? i : LOCKED_RANK.length
  }
  locked.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))
  custom.sort((a, b) => a.key.localeCompare(b.key))
  return [...locked, ...custom]
}

export const PROP_TYPE_ICONS: Record<PropType, string> = {
  text: "type",
  number: "hash",
  boolean: "toggle-left",
  date: "calendar",
  email: "mail",
  url: "link",
  color: "palette",
  select: "list",
  multiselect: "list-checks",
  file: "file",
  formula: "sigma",
  rich_text: "file-text",
  reference: "link",
  image: "image",
  video: "video",
  audio: "music",
}

const def = (key: string, label: string, type: PropType = "text", required = false): PropDef => ({
  key,
  label,
  type,
  required,
})

const themed = (type: string, defs: PropDef[]): PropDef[] => {
  const next = defs.map((prop) => {
    if (prop.key === "color")
      return { ...prop, type: "color" as PropType, required: true, default: prop.default ?? defaultEntityColor(type) }
    if (prop.key === "icon")
      return {
        ...prop,
        type: "select" as PropType,
        required: true,
        default: prop.default ?? defaultEntityIcon(type),
        options: prop.options ?? ENTITY_ICON_KEYS,
      }
    return prop
  })
  const keys = new Set(next.map((prop) => prop.key))
  const meta = [
    { ...def("color", "Color", "color", true), default: defaultEntityColor(type) },
    { ...def("icon", "Icon", "select", true), default: defaultEntityIcon(type), options: ENTITY_ICON_KEYS },
    def("body", "Body"),
  ].filter((prop) => !keys.has(prop.key))
  const at = next.findIndex((prop) => prop.key === "type")
  if (at < 0) return [...meta, ...next]
  return [...next.slice(0, at + 1), ...meta, ...next.slice(at + 1)]
}

export const SYSTEM_SCHEMAS = {
  issue: [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("status", "Status", "select"),
    def("priority", "Priority", "select"),
    def("assignee", "Assignee"),
    def("branch", "Branch"),
    def("criteriaCount", "Criteria Count", "number"),
    def("criteriaPassed", "Criteria Passed", "number"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  agent: [
    def("type", "Type", "text", true),
    def("name", "Name"),
    def("model", "Model"),
    def("provider", "Provider"),
    def("status", "Status"),
  ],
  project: [
    def("type", "Type", "text", true),
    def("name", "Name"),
    def("path", "Path"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  memory: [
    def("type", "Type", "text", true),
    def("title", "Title"),
    def("content", "Content"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  note: [
    def("type", "Type", "text", true),
    def("title", "Title"),
    def("content", "Content"),
    def("tags", "Tags"),
    def("pinned", "Pinned", "boolean"),
    def("color", "Color"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  mcp: [def("type", "Type", "text", true), def("name", "Name"), def("status", "Status"), def("command", "Command")],
  sprite: [
    def("type", "Type", "text", true),
    def("name", "Name"),
    def("github", "GitHub"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  workunit: [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("body", "Body"),
    def("status", "Status", "select"),
    def("priority", "Priority", "select"),
    def("phase", "Phase"),
    def("context", "Context"),
    def("assignee", "Assignee"),
    def("branch", "Branch"),
    def("criteriaCount", "Criteria Count", "number"),
    def("criteriaPassed", "Criteria Passed", "number"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  cycle: [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("status", "Status", "select"),
    def("horizon", "Horizon"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  epic: [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("status", "Status", "select"),
    def("targetDate", "Target Date", "date"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  roadmap: [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("status", "Status", "select"),
    def("horizon", "Horizon"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  suggestion: [
    def("type", "Type", "text", true),
    def("title", "Title"),
    def("description", "Description"),
    def("priority", "Priority", "select"),
    def("dismissed", "Dismissed", "boolean"),
    def("createdAt", "Created At", "date"),
  ],
  file: [
    def("type", "Type", "text", true),
    def("path", "Path", "text", true),
    def("language", "Language"),
    def("size", "Size", "number"),
    def("contentHash", "Content Hash"),
    def("modifiedAt", "Modified At", "date"),
    def("lastModified", "Last Modified", "date"),
  ],
  whiteboard: [
    def("type", "Type", "text", true),
    def("path", "Path", "text", true),
    def("title", "Title"),
    def("modifiedAt", "Modified At", "date"),
  ],
  directory: [def("type", "Type", "text", true), def("path", "Path", "text", true)],
  op: [def("type", "Type", "text", true), def("kind", "Kind"), def("time", "Time", "date"), def("summary", "Summary")],
  branch: [
    def("type", "Type", "text", true),
    def("name", "Name", "text", true),
    def("current", "Current", "boolean"),
    def("createdAt", "Created At", "date"),
    def("createdBy", "Created By"),
  ],
  decision: [
    def("type", "Type", "text", true),
    def("title", "Title"),
    def("status", "Status"),
    def("context", "Context"),
    def("toolName", "Tool Name"),
    def("toolInput", "Tool Input"),
    def("outputSummary", "Output Summary"),
    def("createdAt", "Created At", "date"),
    def("createdBy", "Created By"),
  ],
  session: [
    def("type", "Type", "text", true),
    def("title", "Title"),
    def("createdAt", "Created At", "date"),
    def("updatedAt", "Updated At", "date"),
  ],
  typeschema: [def("type", "Type", "text", true), def("label", "Label"), def("props", "Props")],
} satisfies Record<string, PropDef[]>

export const SYSTEM_TYPES = Object.keys(SYSTEM_SCHEMAS)

export {
  COLLECTION_KEY_RE,
  isReservedCollectionKey,
  normalizeCollectionKey,
  RESERVED_COLLECTION_KEYS,
  suggestCollectionKey,
  validateCollectionKey,
} from "@opencode-ai/util/collection-key"

export const CUSTOM_SCHEMAS = {
  phase: themed("phase", [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("description", "Description"),
    def("context", "Context"),
  ]),
  risk: themed("risk", [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("description", "Description"),
    def("context", "Context"),
  ]),
  mitigationstrategy: themed("mitigationstrategy", [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("description", "Description"),
    def("context", "Context"),
  ]),
  checkpoint: themed("checkpoint", [
    def("type", "Type", "text", true),
    def("trigger", "Trigger"),
    def("atOpHash", "At Op Hash"),
    def("createdAt", "Created At", "date"),
  ]),
  acceptancecriteria: themed("acceptancecriteria", [
    def("type", "Type", "text", true),
    def("title", "Title", "text", true),
    def("description", "Description"),
    def("context", "Context"),
  ]),
} satisfies Record<string, PropDef[]>

const HIDDEN_PREFIXES = [
  "branch:",
  "checkpoint:",
  "decision:",
  "dir:",
  "file:",
  "issue:",
  "mcp:",
  "session:",
  "sprite:",
]
export const HIDDEN_TYPES = new Set([
  "Branch",
  "Brand",
  "Checkpoint",
  "ColorPalette",
  "Decision",
  "DesignComponent",
  "DesignToken",
  "DirectoryNode",
  "FileNode",
  "Font",
  "Icon",
  "Issue",
  "ProjectBrandConfig",
  "Session",
  "Sprite",
  "TypeSchema",
])

export function visibleEntity(e: { id: string; type: string }) {
  if (HIDDEN_TYPES.has(e.type)) return false
  return !HIDDEN_PREFIXES.some((prefix) => e.id.startsWith(prefix))
}

export function typeKey(type: string) {
  return type.trim().toLowerCase()
}

export function isWhiteboardEntityId(id: string) {
  const path = id.startsWith("file:") ? id.slice(5) : id
  return path.toLowerCase().endsWith(".whiteboard")
}

export function entityTypeKey(type: string, id?: string) {
  const key = type.trim()
  if (key === "DirectoryNode") return "directory"
  if (key === "Whiteboard" || key === "WhiteboardNode") return "whiteboard"
  if (key === "FileNode") {
    if (id && isWhiteboardEntityId(id)) return "whiteboard"
    return "file"
  }
  if (key === "MilestoneEpic") return "epic"
  return typeKey(key)
}

export function matchesType(type: string, target: string) {
  return entityTypeKey(type) === typeKey(target)
}

export function graphTypeKey(type: string, id?: string) {
  const key = type.trim()
  if (key === "Branch") return "branch"
  if (key === "Decision") return "decision"
  if (key === "DirectoryNode") return "directory"
  if (key === "Whiteboard" || key === "WhiteboardNode") return "whiteboard"
  if (key === "FileNode") {
    if (id && isWhiteboardEntityId(id)) return "whiteboard"
    return "file"
  }
  if (key === "Issue") return "issue"
  if (key === "MilestoneEpic") return "epic"
  if (key === "Roadmap") return "roadmap"
  if (key === "Session") return "session"
  if (key === "Sprite") return "sprite"
  if (key === "WorkUnit") return "workunit"
  return key
}

export function systemSchema(type: string) {
  return SYSTEM_SCHEMAS[typeKey(type) as keyof typeof SYSTEM_SCHEMAS]
}

export function customSchema(type: string) {
  return CUSTOM_SCHEMAS[typeKey(type) as keyof typeof CUSTOM_SCHEMAS]
}

export function customProps(type: string, defs: PropDef[]) {
  return themed(type, defs)
}

export function mergeOntologies(entities: StoreEntity[], schemas: Record<string, PropDef[]>) {
  const next: Record<string, PropDef[]> = {}
  for (const entity of entities) {
    if (!visibleEntity(entity)) continue
    next[entityTypeKey(entity.type, entity.id)] = []
  }
  for (const [key, defs] of Object.entries(schemas)) next[key] = defs
  return next
}

import z from "zod"
import path from "path"
import {
  isReservedCollectionKey,
  normalizeCollectionKey,
  RESERVED_COLLECTION_KEYS,
  suggestCollectionKey,
  validateCollectionKey,
} from "@opencode-ai/util/collection-key"
import { Tool } from "./tool"
import { Trellis } from "../trellis"
import { Bus } from "@/bus"
import { UIEvent } from "./ui"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"
import * as SemanticLinks from "../trellis/semantic-links"

type Json = string | number | boolean

type FieldKind =
  | "text"
  | "rich_text"
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
  | "reference"
  | "image"
  | "video"
  | "audio"

type DateRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly"

type PropDef = {
  key: string
  label: string
  type: FieldKind
  required?: boolean
  default?: string
  options?: string[]
  formula?: string
  target?: string
  min?: number
  max?: number
  step?: number
  repeat?: DateRepeat
}

const fieldKindSchema = z.enum([
  "text",
  "rich_text",
  "number",
  "boolean",
  "date",
  "email",
  "url",
  "color",
  "select",
  "multiselect",
  "file",
  "formula",
  "reference",
  "image",
  "video",
  "audio",
])

const repeatSchema = z.enum(["none", "daily", "weekly", "monthly", "yearly"])

const fieldSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  type: fieldKindSchema,
  required: z.boolean().optional(),
  default: z.string().optional(),
  options: z.array(z.string()).optional(),
  formula: z.string().optional(),
  target: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  repeat: repeatSchema.optional(),
})

const actionSchema = z
  .union([
    z
      .literal("list_collections")
      .describe(
        "List CMS collections registered with create_collection (TypeSchema + cms=true) and entry counts. Use this to discover what's available before querying.",
      ),
    z
      .literal("create_collection")
      .describe(
        "Create a new explicit collection. Only creates the container—you MUST call update_schema next. Design the schema yourself (ontology-first, relational bias); never ask the user which fields to include.",
      ),
    z
      .literal("delete_collection")
      .describe("Delete a collection, its schema, and ALL entries permanently. Requires confirmation."),
    z
      .literal("get_schema")
      .describe("Get the field schema for a collection."),
    z
      .literal("update_schema")
      .describe(
        "Replace the entire field schema for a collection. Bias toward reference fields and new entity types that deepen the ontology. Also creates per-field entities for graph queries.",
      ),
    z
      .literal("list_entries")
      .describe(
        "List entries in a collection with optional status filter (all/draft/published). Returns summaries, not full details.",
      ),
    z
      .literal("get_entry")
      .describe("Get full details for one entry including all field values. Requires 'id' parameter."),
    z
      .literal("create_entry")
      .describe("Create a new entry. Must provide at least one field value in 'values'. Created as draft by default."),
    z
      .literal("update_entry")
      .describe("Update field values on an existing entry. Patches only provided fields, leaves others unchanged."),
    z.literal("delete_entry").describe("Delete a single entry and all its field facts. Requires 'id' parameter."),
    z.literal("publish").describe("Change entry status from draft to published. Requires 'id' parameter."),
    z.literal("unpublish").describe("Change entry status from published to draft. Requires 'id' parameter."),
    z
      .literal("scaffold_consumer")
      .describe(
        "Generate a client file that imports trellis/cms SDK and subscribes to live updates. Use for UI integration.",
      ),
  ])
  .describe("CMS action to perform — see tool description for detailed examples of each action")

const args = z.object({
  action: actionSchema,
  collection: z.string().optional().describe("Collection key (e.g. 'blog_post'). Required for most actions."),
  id: z.string().optional().describe("Entry id. Required for entry-level actions."),
  values: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Field values for create_entry / update_entry."),
  fields: z
    .array(fieldSchema)
    .optional()
    .describe("Full schema definition for update_schema (replaces existing schema)."),
  status: z.enum(["all", "draft", "published"]).optional().describe("Filter for list_entries (default: all)."),
  limit: z.number().optional().describe("Max results for list actions (default: 100)."),
  label: z.string().optional().describe("Human-readable label for create_collection (default: same as key)."),
  framework: z
    .enum(["vanilla", "react", "solid", "vue"])
    .optional()
    .describe("UI framework for scaffold_consumer (default: vanilla)."),
  expand: z
    .array(z.string())
    .optional()
    .describe("Field keys to expand as references in scaffolded code (e.g. ['author'])."),
  output_path: z
    .string()
    .optional()
    .describe("File path to write the scaffolded consumer code (relative to project). Default: cms-<collection>.ts"),
  cms_url: z
    .string()
    .optional()
    .describe("CMS server URL embedded in the scaffolded code (default: http://localhost:4096)."),
})

function humanize(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (s) => s.toUpperCase())
}

function shortId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function normalizeKey(name: string) {
  return normalizeCollectionKey(name)
}

type CmsToolResult = { title: string; output: string; metadata: Record<string, unknown> }

function cmsOk(result: { title: string; output: string; metadata?: Record<string, unknown> }): CmsToolResult {
  return { ...result, metadata: { ...(result.metadata ?? {}), ok: true } }
}

function cmsFail(result: { title: string; output: string; metadata?: Record<string, unknown> }): CmsToolResult {
  return { ...result, metadata: { ...(result.metadata ?? {}), ok: false } }
}

function hasCmsSchema(key: string) {
  const facts = factsByEntity(`schema:${key}`)
  return (
    facts.some((f) => f.a === "type" && f.v === "TypeSchema") && facts.some((f) => f.a === "cms" && f.v === true)
  )
}

function requireCmsCollection(key: string) {
  if (hasCmsSchema(key)) return null
  return `Collection "${key}" is not registered for CMS. Use create_collection first.`
}

function reservedCollectionMessage(key: string) {
  return validateCollectionKey(key) ?? `Collection key "${key}" is reserved.`
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeEntryValues(values: Record<string, Json>) {
  const out = { ...values }
  if (!(typeof out.name === "string" && out.name.trim())) {
    for (const k of ["title", "label"] as const) {
      const v = out[k]
      if (typeof v === "string" && v.trim()) {
        out.name = v.trim()
        delete out[k]
        break
      }
    }
  }
  if (typeof out.name === "string" && out.name.trim() && !(typeof out.slug === "string" && out.slug.trim()))
    out.slug = slugify(out.name)
  return out
}

function normalizeSchemaFields(fields: PropDef[]) {
  const out: PropDef[] = []
  const seen = new Set<string>()
  for (const def of fields) {
    const key = def.key === "title" ? "name" : def.key
    if (seen.has(key)) continue
    seen.add(key)
    out.push(
      def.key === "title" ? { ...def, key: "name", label: def.label ?? "Name", required: def.required ?? true } : def,
    )
  }
  return out
}

function schemaKeys(name: string) {
  const raw = name.replace(/^schema:/, "").trim()
  const lower = raw.toLowerCase().replace(/\s+/g, "_")
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const compact = lower.replace(/[^a-z0-9]+/g, "")
  return [...new Set([lower, snake, compact].filter(Boolean))]
}

function factsByEntity(entity: string): Array<{ e: string; a: string; v: Json }> {
  const facts = Trellis.storeFacts(undefined, { limit: 5000 })
  return facts.filter((f) => f.e === entity).map((f) => ({ e: f.e, a: f.a, v: f.v as Json }))
}

function readSchema(collection: string): PropDef[] {
  const keys = new Set(schemaKeys(collection))
  const facts = Trellis.storeFacts(undefined, { limit: 5000 })
  const propsFact = facts.find(
    (f) => f.a === "props" && f.e.startsWith("schema:") && schemaKeys(f.e).some((k) => keys.has(k)),
  )
  if (!propsFact || typeof propsFact.v !== "string") return []
  try {
    return JSON.parse(propsFact.v) as PropDef[]
  } catch {
    return []
  }
}

function writableValues(collection: string, values: Record<string, Json>) {
  const formulas = new Set(
    readSchema(collection)
      .filter((def) => def.type === "formula")
      .map((def) => def.key),
  )
  return Object.fromEntries(Object.entries(values).filter(([key]) => !formulas.has(key)))
}

function fieldValidator(def: PropDef) {
  switch (def.type) {
    case "number":
      return z.coerce
        .number()
        .refine((n) => def.min === undefined || n >= def.min, { message: `must be >= ${def.min}` })
        .refine((n) => def.max === undefined || n <= def.max, { message: `must be <= ${def.max}` })
        .refine((n) => def.step === undefined || Number.isInteger((n - (def.min ?? 0)) / def.step), {
          message: `must align to step ${def.step}`,
        })
    case "boolean":
      return z.coerce.boolean()
    case "date":
      return z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), { message: "invalid date" })
    case "email":
      return z.string().email()
    case "url":
      return z.string().url()
    case "color":
      return z.string().regex(/^#[0-9a-fA-F]{3,8}$/, { message: "invalid hex color" })
    case "select":
      return z.string().refine((s) => (def.options ?? []).includes(s), {
        message: `expected one of ${(def.options ?? []).join(", ")}`,
      })
    case "reference":
      return z.string().min(1)
    case "image":
    case "video":
    case "audio":
      return z.string().min(1)
    case "file":
      return z.string().min(1)
    case "formula":
      return z.never()
    default:
      return z.string()
  }
}

type ValidateMode = "create" | "update"

function validateValues(collection: string, values: Record<string, Json>, mode: ValidateMode) {
  const defs = readSchema(collection)
  if (defs.length === 0) return { valid: true as const, values, errors: [] as string[] }

  const byKey = new Map(defs.map((d) => [d.key, d]))
  const errors: string[] = []
  const out: Record<string, Json> = {}

  if (mode === "create") {
    for (const def of defs) {
      if (!def.required) continue
      if (!(def.key in values)) errors.push(`"${def.key}" is required`)
    }
  }

  for (const [key, raw] of Object.entries(values)) {
    const def = byKey.get(key)
    if (!def) {
      out[key] = raw
      continue
    }
    if (def.type === "formula") continue
    const result = fieldValidator(def).safeParse(raw)
    if (result.success) {
      out[key] = result.data as Json
    } else {
      const issue = result.error.issues[0]?.message ?? "invalid value"
      errors.push(`"${key}" ${issue} (expected ${def.type})`)
    }
  }

  return errors.length === 0
    ? { valid: true as const, values: out, errors }
    : { valid: false as const, values: out, errors }
}

function factsForField(fid: string, schemaId: string, def: PropDef, order: number) {
  const out: Array<{ e: string; a: string; v: Json }> = [
    { e: fid, a: "type", v: "Field" },
    { e: fid, a: "collection", v: schemaId },
    { e: fid, a: "key", v: def.key },
    { e: fid, a: "label", v: def.label },
    { e: fid, a: "kind", v: def.type },
    { e: fid, a: "order", v: order },
  ]
  if (def.required) out.push({ e: fid, a: "required", v: true })
  if (def.default) out.push({ e: fid, a: "default", v: def.default })
  if (def.options) out.push({ e: fid, a: "options", v: JSON.stringify(def.options) })
  if (def.formula) out.push({ e: fid, a: "formula", v: def.formula })
  if (def.target) out.push({ e: fid, a: "target", v: def.target })
  if (def.min !== undefined) out.push({ e: fid, a: "min", v: def.min })
  if (def.max !== undefined) out.push({ e: fid, a: "max", v: def.max })
  if (def.step !== undefined) out.push({ e: fid, a: "step", v: def.step })
  if (def.repeat && def.repeat !== "none") out.push({ e: fid, a: "repeat", v: def.repeat })
  return out
}

function statusOf(id: string): "draft" | "published" {
  const facts = factsByEntity(id)
  const f = facts.find((x) => x.a === "cms_status")
  return f?.v === "published" ? "published" : "draft"
}

function displayLabel(id: string): string {
  const facts = factsByEntity(id)
  for (const k of ["name", "title", "label", "description"] as const) {
    const f = facts.find((x) => x.a === k)
    if (f && typeof f.v === "string" && f.v.trim()) return f.v
  }
  return id
}

function entryFields(id: string): Record<string, Json> {
  const facts = factsByEntity(id)
  const out: Record<string, Json> = {}
  for (const f of facts) {
    if (f.a === "type") continue
    out[f.a] = f.v
  }
  return out
}

function pascal(s: string): string {
  return s
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("")
}

function clientLiteral(url: string, directory: string): string {
  return `createCmsClient({ url: "${url}", directory: ${JSON.stringify(directory)} })`
}

function scaffoldVanilla(collection: string, url: string, directory: string, expandClause: string): string {
  return `import { createCmsClient } from "trellis/cms"

const cms = ${clientLiteral(url, directory)}

const collection = cms.collection("${collection}")

// One-shot fetch (defaults to status: "published")
const entries = await collection.list({${expandClause}})
console.log(entries)

// Live updates — re-fires whenever the collection changes
const off = collection.subscribe(
  (entries) => {
    console.log("Updated:", entries)
  },
  {${expandClause} onError: (err) => console.error("CMS subscription failed", err), },
)
// off()  // call to stop receiving updates
`
}

function scaffoldReact(collection: string, url: string, directory: string, expandClause: string): string {
  const Hook = `use${pascal(collection)}`
  return `import { useEffect, useState } from "react"
import { createCmsClient, type Entry } from "trellis/cms"

const cms = ${clientLiteral(url, directory)}

export function ${Hook}() {
  const [entries, setEntries] = useState<Entry[]>([])
  useEffect(() => {
    const off = cms.collection("${collection}").subscribe(setEntries, {${expandClause} onError: (err) => console.error("CMS subscription failed", err), })
    return off
  }, [])
  return entries
}

// Usage:
//   const items = ${Hook}()
//   return items.map(p => <article key={p.id}>{String(p.fields.title)}</article>)
`
}

function scaffoldSolid(collection: string, url: string, directory: string, expandClause: string): string {
  const Hook = `create${pascal(collection)}`
  return `import { createSignal, onCleanup } from "solid-js"
import { createCmsClient, type Entry } from "trellis/cms"

const cms = ${clientLiteral(url, directory)}

export function ${Hook}() {
  const [entries, setEntries] = createSignal<Entry[]>([])
  const off = cms.collection("${collection}").subscribe(setEntries, {${expandClause} onError: (err) => console.error("CMS subscription failed", err), })
  onCleanup(off)
  return entries
}

// Usage in a component:
//   const items = ${Hook}()
//   return <For each={items()}>{(p) => <article>{String(p.fields.title)}</article>}</For>
`
}

function scaffoldVue(collection: string, url: string, directory: string, expandClause: string): string {
  const Hook = `use${pascal(collection)}`
  return `import { ref, onUnmounted } from "vue"
import { createCmsClient, type Entry } from "trellis/cms"

const cms = ${clientLiteral(url, directory)}

export function ${Hook}() {
  const entries = ref<Entry[]>([])
  const off = cms.collection("${collection}").subscribe((next) => {
    entries.value = next
  }, {${expandClause} onError: (err) => console.error("CMS subscription failed", err), })
  onUnmounted(off)
  return entries
}
`
}

function scaffoldFor(
  framework: "vanilla" | "react" | "solid" | "vue",
  collection: string,
  url: string,
  directory: string,
  expand?: string[],
): string {
  const expandClause = expand && expand.length > 0 ? ` expand: ${JSON.stringify(expand)},` : ""
  switch (framework) {
    case "react":
      return scaffoldReact(collection, url, directory, expandClause)
    case "solid":
      return scaffoldSolid(collection, url, directory, expandClause)
    case "vue":
      return scaffoldVue(collection, url, directory, expandClause)
    default:
      return scaffoldVanilla(collection, url, directory, expandClause)
  }
}

function defaultScaffoldFilename(collection: string, framework: "vanilla" | "react" | "solid" | "vue"): string {
  const base = `cms-${collection.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
  return framework === "vanilla" ? `${base}.js` : `${base}.ts`
}

export const CmsTool = Tool.define<typeof args, Record<string, any>>("cms", {
  description: [
    "CMS operations on Trellis content collections (entities + schemas + draft/publish flow).",
    "",
    "## Ontology-first CMS design — your job, not the user's",
    "",
    "Schema and entity-type design is YOUR responsibility. Never ask the user which fields a collection",
    "should have, which entity types to create, or how to wire relationships — decide intentionally,",
    "then build with create_collection / update_schema. The question tool is forbidden for schema or",
    "collection design (including 'which fields should X contain?' checklists).",
    "",
    "Treat the CMS as a comprehensive ontology you are actively shaping — not a form to fill out from",
    "a literal user directive. Optimize for future insight and graph value:",
    "",
    "- **Relational bias:** prefer reference (and multiselect reference) fields over flat strings.",
    "  Store entity ids, not denormalized labels (author→person, topics→topic[], not author_name text).",
    "- **Optimistic entity creation:** when content clusters around a distinct concept (themes in articles,",
    "  venues in events, skills on people), create a new collection for it and link entries — don't cram",
    "  everything into tags or long text.",
    "- **Deep-linking:** wire collections so traversals surface novel connections; every obvious many-to-one",
    "  or many-to-many should become graph edges.",
    "- **Proactive modeling:** list_collections and inspect existing entries before extending; extend schemas",
    "  with update_schema or add collections when the domain calls for it. Schemas can evolve later.",
    "- **Semantic linking in rich_text:** use [[type:slug]] WikiLinks in body fields; put queryable relationships",
    "  in entry metadata via reference fields. Saves auto-materialize field-scoped graph edges ({field}.mentions).",
    "",
    "Briefly state the ontology you chose in chat AFTER building — not before asking permission.",
    "",
    "## Designing a collection — infer, then build",
    "",
    "Assume Trellis CMS is the right place for structured editorial content. Infer the schema from the user's",
    "request and proceed — do NOT use the question tool to pick fields, and do NOT ask the user to confirm",
    "schema shape before create_collection / update_schema.",
    "",
    "Only pause to ask when the request is genuinely ambiguous (e.g. two incompatible content models) or before",
    "destructive actions (delete_collection, delete_entry).",
    "",
    "**Bookmarks / links / references:** do NOT create a CMS collection. Use the asset tool action",
    "`create_link_asset` instead — link assets live in the Design panel Links section and sync to Trellis Asset",
    "entities. Use CMS only when the user wants editorial entries (notes, tags, publish flow) for each link.",
    "",
    "Default schema recipes (adapt labels; add reference/select fields when relationships are obvious):",
    "- blog_post / article: name (text, required), body (rich_text), author (reference→author), tags (text), published_at (date)",
    "- bookmark (CMS only if editorial): url (url, required), name (text, required), notes (rich_text), tags (text)",
    "- product: name (text, required), price (number), description (rich_text), category (reference→category), in_stock (boolean)",
    "- event: name (text, required), starts_at (date), location (text), description (rich_text)",
    "- person / author: name (text, required), bio (rich_text), email (email), avatar (image)",
    "- topic: name (text, required), description (rich_text) — create when entries cluster by theme; link via reference fields (e.g. article.topics→topic)",
    "- recipe: name (text, required), ingredients (rich_text), steps (rich_text), prep_time (number)",
    "- page: name (text, required), body (rich_text), slug (text)",
    "",
    "## Field types — choose with intent",
    "",
    "Be scrupulous. The right type makes the editor UX, validation, and downstream queries right.",
    "",
    "  text         Short single-line strings: titles, names, slugs, tags, short labels.",
    "  rich_text    Prose, descriptions, body content. DEFAULT for anything multi-sentence",
    "               or that needs formatting (bold, lists, links, headings, code blocks).",
    "  number       Numeric values: counts, prices, ratings, durations.",
    "  boolean      Flags: featured, archived, public.",
    "  date         Dates and timestamps: published_at, due_date, created_at.",
    "  email        Email addresses (validated input).",
    "  url          External URLs (validated input).",
    "  color        Hex color values.",
    "  select       Enum with a predefined options array (provide options=[...]).",
    "  reference    Link to another entity. Provide target=<collection_key> to constrain",
    "               which collection it points at (e.g. target=author).",
    "  image        Image URL or local path; rendered with preview.",
    "  video        Video URL or local path; rendered with player/preview.",
    "  audio        Audio URL or local path; rendered with player.",
    "  formula      Virtual computed field. Provide formula='{price} * {quantity}'.",
    "               MVP formulas support numeric fields, + - * /, and parentheses.",
    "  multiselect, file  Deferred — fall back to text for now.",
    "",
    "Heuristics:",
    "- Reach for rich_text the moment content has formatting or runs longer than a sentence.",
    "  Plain text is for short structured strings only (a body field is almost never plain text).",
    "- Use reference for any 'X belongs to Y' relationship (post → author, product → category).",
    "  Don't store labels — store the linked entity's id, let the picker resolve.",
    "- Use select when the value comes from a fixed vocabulary (status, tier, category).",
    "  Use text for free-form tags.",
    "- Use formula for derived numeric values. Do not write formula values into entries;",
    "  trellis/cms computes them virtually from the schema and current field values.",
    "",
    "## Naming rules — keys are not labels",
    "",
    "`key` is the machine identifier (used in queries, code, URLs). `label` is the human-readable",
    "header shown in the table and editor. They are separate fields on each PropDef. The UI will",
    "humanize a missing label from the key, but always pass an explicit label for anything",
    "non-obvious.",
    "",
    "Key requirements:",
    "- lowercase snake_case, starts with a letter, ASCII letters/digits/underscore only.",
    "- Stable — renaming a key effectively deletes the old field and creates a new one,",
    "  orphaning all existing values. Pick the right name the first time.",
    "",
    "Reserved / structural keys you must NOT redefine:",
    "  type, cms_status, id, slug, lastEdited, createdAt, updatedAt",
    "  (These are managed by the system and have dedicated UI affordances.)",
    "",
    "Reserved collection keys (entity types) you must NOT use for create_collection:",
    "  System: issue, project, memory, note, agent, file, session, branch, decision, ...",
    "  Design: asset, icon, font, brand, designcomponent, designtoken, ...",
    "  The label can still be human-readable — only the machine key must differ.",
    "  Example: user asks for a 'Projects' CMS collection → key=portfolio, label='Projects'.",
    "  create_collection with key=project will be rejected; try portfolio, showcase, or client_projects.",
    "",
    "Title-fallback keys (legacy — prefer name):",
    "  name is the canonical entry title and always maps to the Entry column + sidebar Name field.",
    "  title and label are legacy aliases — the tool remaps them to name on write; do NOT add title to schemas.",
    "  description is also a title fallback but usually means prose; avoid it for short titles.",
    "",
    "  The table's 'Entry' column shows the row title from the first of name/title/label/description",
    "  that has a value. If you declare one of these in your schema, it becomes the row title and",
    "  does NOT also appear as a separate column. Only the FIRST declared title-fallback key is",
    "  consumed by the Entry column; any others become normal columns. Concretely:",
    "    - Schema [name, body]        → 'name' is title; 'body' is a column.",
    "    - Schema [description]     → 'description' is the title; no separate column.",
    "  If you want a long-form prose column that is NOT the title, name it 'body',",
    "  'summary', 'details', 'excerpt', 'caption', 'notes', or similar — not 'description'.",
    "",
    "## The CMS table is schema-driven",
    "",
    "After `update_schema`, every declared (non-title-fallback) field shows up as a column",
    "immediately — you do NOT need to backfill values on existing entries for the column",
    "to appear. The UI also infers ad-hoc columns from entity facts when there is no schema,",
    "but in schema mode the schema is the source of truth.",
    "",
    "Consequences:",
    "- Adding a column is a two-step task only if you also want data: update_schema, then",
    "  optionally update_entry on each existing entry to populate it. The column itself",
    "  appears after update_schema alone.",
    "- Renaming a column means: update_schema with the new key, then update_entry on every",
    "  existing entry to copy old-value → new-key (the old key's data is not auto-migrated).",
    "",
    "## Storage notes",
    "",
    "- Collections: TypeSchema entities marked with cms=true (via create_collection).",
    "- Entries: entities of the collection's type, carrying their field values as facts.",
    "- Drafts vs. published: cms_status=draft on creation; publish flips to cms_status=published.",
    "- Custom graph entities (calendar_event, metrics, …) are not CMS collections unless registered with create_collection.",
    "",
    "## When building a UI that displays CMS content",
    "",
    "**The CMS is reachable from the browser.** The opencode backend serves an HTTP API at",
    "`http://localhost:4096` (path prefix `/trellis/store`, with `?directory=<project-root>`).",
    "Client-side SPAs query it directly via the `trellis/cms` SDK — no extra backend, no build-time",
    "data dumps, no Vite-plugin file-watchers. CORS already allows `localhost:*` origins.",
    "",
    "**The right path for any UI that should display CMS content:**",
    "1. Call `scaffold_consumer` with the collection key, framework, and target file path.",
    "   It writes a file that imports from `trellis/cms`, calls `createCmsClient({ url, directory })`,",
    "   and subscribes to live updates via polling.",
    "2. Have your UI components import from that scaffolded file.",
    "3. (If the project hasn't installed it yet) `pnpm add trellis@^3.1.5` in the UI package.",
    "",
    "**Anti-patterns — DO NOT do any of these:**",
    "- Reading `.trellis/ops.json` or `.trellis/kernel.db` directly. These are internal storage",
    "  formats with no compatibility guarantees. The `/trellis/store/*` HTTP API is the contract.",
    "- Generating `data.js` / `data.json` from a build-time script. Drift waiting to happen.",
    "- Adding a Vite plugin that watches Trellis files for changes. The SDK polls already.",
    "- Spinning up a custom Express/Fastify/Hono server to bridge Trellis to the browser.",
    "  opencode IS that server.",
    "",
    "If you find yourself reasoning 'the React app can't query Trellis directly so I need a build",
    "step / API layer / file watcher' — STOP. That premise is wrong. Use `scaffold_consumer`.",
    "",
    "If a project already has any of the above anti-patterns, replace it with scaffold_consumer.",
    "",
    "**Entry creation rule:** create_entry requires at least one writable field in values.",
    "Infer field values from the user's message when possible. Do not create empty placeholder entries.",
    "For CSV or spreadsheet-style imports, use the `csv_import` tool once instead of calling create_entry row-by-row.",
    "",
    "## Actions — with examples",
    "",
    "**list_collections** — Discover what collections exist",
    "  Example: action='list_collections' → returns [{key: 'blog_post', label: 'Blog Post', count: 12, explicit: true}, ...]",
    "  Use this FIRST before any other operation to confirm the collection key.",
    "",
    "**create_collection** — Make a new collection container",
    "  Example: action='create_collection', collection='product', label='Products'",
    "  ⚠️ This only creates the container. You MUST call update_schema next to add fields!",
    "",
    "**update_schema** — Define fields for a collection",
    "  Example: action='update_schema', collection='product', fields=[",
    "    {key: 'name', type: 'text', required: true},",
    "    {key: 'price', type: 'number'},",
    "    {key: 'description', type: 'rich_text'},",
    "    {key: 'category', type: 'reference', target: 'category'},",
    "    {key: 'in_stock', type: 'boolean', default: 'true'}",
    "  ]",
    "",
    "**get_schema** — See current field definitions",
    "  Example: action='get_schema', collection='product' → returns {fields: [...]}",
    "",
    "**delete_collection** — Remove collection + entries + schema",
    "  Example: action='delete_collection', collection='product'",
    "  ⚠️ Destructive! Requires user confirmation.",
    "",
    "**list_entries** — Browse entries (summaries only)",
    "  Example: action='list_entries', collection='blog_post', status='published', limit=20",
    "  Returns: [{id: 'blog_post:abc123', title: 'Hello World', status: 'published'}, ...]",
    "  Use this to get entry IDs before calling get_entry for full details.",
    "",
    "**get_entry** — Full entry details",
    "  Example: action='get_entry', collection='blog_post', id='blog_post:abc123'",
    "  Returns complete field values including rich_text, references, etc.",
    "",
    "**create_entry** — Add new content",
    "  Example: action='create_entry', collection='blog_post', values={",
    "    name: 'My New Post',",
    "    body: 'First paragraph...',",
    "    author: 'author:john_doe'",
    "  }",
    "  ⚠️ Must include at least one field value. Entry starts as draft.",
    "",
    "**update_entry** — Edit existing content",
    "  Example: action='update_entry', collection='blog_post', id='blog_post:abc123', values={",
    "    name: 'Updated Title',",
    "    body: 'New content...'",
    "  }",
    "  Only provided fields are changed; others remain untouched.",
    "",
    "**delete_entry** — Remove single entry",
    "  Example: action='delete_entry', collection='blog_post', id='blog_post:abc123'",
    "",
    "**publish / unpublish** — Change visibility",
    "  Example: action='publish', collection='blog_post', id='blog_post:abc123'",
    "  Example: action='unpublish', collection='blog_post', id='blog_post:abc123'",
    "",
    "**scaffold_consumer** — Generate UI client code",
    "  Example: action='scaffold_consumer', collection='blog_post', framework='react', output_path='src/cms/blog.ts'",
    "  Creates a file that imports trellis/cms SDK and subscribes to live updates.",
    "  Args: collection (required), framework ('vanilla'|'react'|'solid'|'vue'),",
    "        expand (field keys to resolve as references), output_path, cms_url",
    "",
    "## Common workflows",
    "",
    "**Create a new collection from scratch:**",
    "  1. list_collections (verify name doesn't exist)",
    "  2. create_collection (create container)",
    "  3. update_schema (define all fields)",
    "  4. create_entry (add first content item)",
    "",
    "**Add content to existing collection:**",
    "  1. get_schema (see what fields exist)",
    "  2. create_entry with field values",
    "",
    "**Query and display content:**",
    "  1. list_entries (get list of items)",
    "  2. For each item you need details on: get_entry (full data)",
    "  OR use scaffold_consumer to generate live-updating client code",
    "",
    "## What NOT to do",
    "",
    "❌ DO NOT use 'describe', 'explain', 'summarize' as actions — these are NOT valid.",
    "   The CMS only stores and retrieves data. To describe content, use list_entries/get_entry",
    "   to fetch the data, then describe it in your response.",
    "",
    "❌ DO NOT create entries with NO values. Every create_entry needs at least one field value.",
    "",
    "❌ DO NOT use update_schema without first calling create_collection for new collections.",
    "",
    "❌ DO NOT call get_entry without knowing the id. Use list_entries first to discover ids.",
    "",
    "❌ DO NOT add a schema field keyed 'title' — use 'name' for entry titles.",
    "",
    "❌ DO NOT name a rich_text body field 'description' if you want it as its own column —",
    "   'description' is a title-fallback key. Use 'body', 'summary', 'details', or 'notes'.",
    "",
    "❌ DO NOT use the question tool to let the user pick schema fields, collection shapes, or entity types.",
    "",
    "❌ DO NOT ask 'which fields should X contain?' or similar — design the ontology yourself.",
    "",
    "❌ DO NOT create a bookmark/link collection when link assets (`asset` tool) are enough.",
    "",
    "❌ DO NOT use reserved collection keys (project, issue, asset, note, …). Use a semantic",
    "   alternative key and set label to the user's preferred display name.",
    "",
  ].join("\n"),
  parameters: args,
  async execute(input, ctx) {
    const writeActions = new Set([
      "create_collection",
      "delete_collection",
      "update_schema",
      "create_entry",
      "update_entry",
      "delete_entry",
      "publish",
      "unpublish",
      "scaffold_consumer",
    ])
    if (writeActions.has(input.action)) {
      await ctx.ask({
        permission: "write",
        patterns: ["cms"],
        always: ["cms"],
        metadata: { action: input.action },
      })
    }

    if (input.action === "list_collections") {
      const allEntities = Trellis.storeEntities(undefined, { limit: 10000 })
      type Row = { key: string; label: string; total: number; drafts: number; published: number }
      const result = new Map<string, Row>()
      const schemas = Trellis.storeEntities(undefined, { type: "TypeSchema", limit: 1000 })
      for (const s of schemas) {
        const facts = factsByEntity(s.id)
        const isCms = facts.some((f) => f.a === "cms" && f.v === true)
        if (!isCms) continue
        const key = s.id.replace(/^schema:/, "")
        const label = (facts.find((f) => f.a === "label")?.v as string) ?? key
        const entries = allEntities.filter((e) => e.type.trim().toLowerCase() === key)
        let drafts = 0
        let published = 0
        for (const e of entries) {
          if (statusOf(e.id) === "published") published++
          else drafts++
        }
        result.set(key, { key, label, total: entries.length, drafts, published })
      }
      const rows = Array.from(result.values()).sort((a, b) => a.label.localeCompare(b.label))
      if (rows.length === 0) {
        return { title: "No collections", output: "No CMS collections defined.", metadata: { count: 0 } }
      }
      const lines = rows.map(
        (c) =>
          `${c.key.padEnd(20)} ${String(c.total).padStart(4)} entries  (${c.drafts} draft, ${c.published} live)`,
      )
      return {
        title: `${rows.length} collections`,
        output: `CMS collections:\n${lines.join("\n")}`,
        metadata: { count: rows.length, collections: rows },
      }
    }

    if (input.action === "create_collection") {
      if (!input.collection) return cmsFail({ title: "Error", output: "collection is required." })
      const key = normalizeKey(input.collection)
      const reserved = validateCollectionKey(key)
      if (reserved) {
        const alt = suggestCollectionKey(key)
        const hint = alt ? ` Use create_collection with collection='${alt}' and label='${input.label ?? input.collection}'.` : ""
        return cmsFail({ title: "Reserved key", output: `${reserved}${hint}`, metadata: { key, suggestion: alt } })
      }
      const id = `schema:${key}`
      const existing = factsByEntity(id)
      if (existing.length > 0) {
        return cmsOk({ title: "Exists", output: `Collection "${key}" already exists.`, metadata: { key } })
      }
      const result = Trellis.storeAssert([
        { e: id, a: "type", v: "TypeSchema" },
        { e: id, a: "label", v: input.label ?? key },
        { e: id, a: "props", v: "[]" },
        { e: id, a: "cms", v: true },
      ])
      if (!result) return cmsFail({ title: "Error", output: "Failed to assert facts." })
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection: key },
      })
      return cmsOk({
        title: `Created collection ${key}`,
        output: `Created CMS collection "${key}". Use update_schema to add fields, then create_entry to add content.`,
        metadata: { key },
      })
    }

    if (input.action === "delete_collection") {
      if (!input.collection) return cmsFail({ title: "Error", output: "collection is required." })
      const key = normalizeKey(input.collection)
      const schemaId = `schema:${key}`
      const fieldPrefix = `field:${key}.`
      const entries = Trellis.storeEntities(undefined, { type: key, limit: 5000 })
      const allFacts = Trellis.storeFacts(undefined, { limit: 50000 })
      const cascade: Array<{ e: string; a: string; v: Json }> = allFacts
        .filter((f) => f.e === schemaId || f.e.startsWith(fieldPrefix) || entries.some((e) => f.e === e.id))
        .map((f) => ({ e: f.e, a: f.a, v: f.v as Json }))
      if (cascade.length === 0) {
        return cmsFail({ title: "Not found", output: `Collection "${key}" has no facts.` })
      }
      const result = Trellis.storeRetract(cascade)
      if (!result) return cmsFail({ title: "Error", output: "Failed to retract facts." })
      return cmsOk({
        title: `Deleted collection ${key}`,
        output: `Deleted collection "${key}": ${entries.length} entries, ${cascade.length} facts retracted.`,
        metadata: { key, entries: entries.length, facts: cascade.length },
      })
    }

    if (input.action === "get_schema") {
      if (!input.collection) return { title: "Error", output: "collection is required.", metadata: {} }
      const key = normalizeKey(input.collection)
      const defs = readSchema(key)
      if (defs.length === 0) {
        return { title: `Schema for ${key}`, output: `Collection "${key}" has no fields defined.`, metadata: { key } }
      }
      const lines = defs.map((d) => {
        const flags: string[] = []
        if (d.required) flags.push("required")
        if (d.target) flags.push(`→ ${d.target}`)
        if (d.options) flags.push(`options: ${d.options.join(", ")}`)
        if (d.formula) flags.push(`formula: ${d.formula}`)
        const meta = flags.length ? `  [${flags.join(", ")}]` : ""
        return `${d.key.padEnd(20)} ${d.type.padEnd(12)} ${d.label}${meta}`
      })
      return {
        title: `Schema: ${key}`,
        output: `Schema for "${key}" (${defs.length} fields):\n${lines.join("\n")}`,
        metadata: { key, fields: defs },
      }
    }

    if (input.action === "update_schema") {
      if (!input.collection) return cmsFail({ title: "Error", output: "collection is required." })
      if (!input.fields) return cmsFail({ title: "Error", output: "fields is required for update_schema." })
      const key = normalizeKey(input.collection)
      const schemaId = `schema:${key}`
      const oldDefs = readSchema(key)
      const newKeys = new Set(input.fields.map((f) => f.key))
      const defs: PropDef[] = normalizeSchemaFields(
        input.fields.map((f) => ({
          key: f.key,
          label: f.label ?? humanize(f.key),
          type: f.type,
          required: f.required,
          default: f.default,
          options: f.options,
          formula: f.formula,
          target: f.target,
          min: f.min,
          max: f.max,
          step: f.step,
          repeat: f.repeat,
        })),
      )

      const retracts: Array<{ e: string; a: string; v: Json }> = []
      const asserts: Array<{ e: string; a: string; v: Json }> = []

      const oldProps = factsByEntity(schemaId).find((f) => f.a === "props")
      if (oldProps) retracts.push(oldProps)
      asserts.push({ e: schemaId, a: "props", v: JSON.stringify(defs) })

      for (const old of oldDefs) {
        if (newKeys.has(old.key)) continue
        const fid = `field:${key}.${old.key}`
        retracts.push(...factsByEntity(fid))
      }
      for (const [i, def] of defs.entries()) {
        const fid = `field:${key}.${def.key}`
        retracts.push(...factsByEntity(fid))
        asserts.push(...factsForField(fid, schemaId, def, i))
      }

      if (retracts.length > 0) {
        const r = Trellis.storeRetract(retracts)
        if (!r) return cmsFail({ title: "Error", output: "Failed to retract old schema." })
      }
      const r = Trellis.storeAssert(asserts)
      if (!r) return cmsFail({ title: "Error", output: "Failed to assert new schema." })
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection: key },
      })
      return cmsOk({
        title: `Updated schema for ${key}`,
        output: `Schema for "${key}" now has ${defs.length} fields: ${defs.map((d) => d.key).join(", ")}`,
        metadata: { key, count: defs.length },
      })
    }

    if (input.action === "list_entries") {
      if (!input.collection) return { title: "Error", output: "collection is required.", metadata: {} }
      const key = normalizeKey(input.collection)
      const missing = requireCmsCollection(key)
      if (missing) return { title: "No collection", output: missing, metadata: { collection: key } }
      const lim = input.limit ?? 100
      let entries = Trellis.storeEntities(undefined, { type: key, limit: lim })
      const filter = input.status ?? "all"
      if (filter !== "all") entries = entries.filter((e) => statusOf(e.id) === filter)
      if (entries.length === 0) {
        return {
          title: "No entries",
          output: `No ${filter !== "all" ? filter + " " : ""}entries in "${key}".`,
          metadata: { count: 0 },
        }
      }
      const lines = entries.map((e) => {
        const status = statusOf(e.id)
        const label = displayLabel(e.id)
        return `${status === "draft" ? "○" : "●"} ${label.padEnd(40)} ${e.id}`
      })
      return {
        title: `${entries.length} entries in ${key}`,
        output: `Entries in "${key}" (${filter}):\n${lines.join("\n")}`,
        metadata: { key, count: entries.length, status: filter },
      }
    }

    if (input.action === "get_entry") {
      if (!input.id) return { title: "Error", output: "id is required.", metadata: {} }
      const detail = Trellis.storeEntity(input.id)
      if (!detail) return { title: "Not found", output: `Entry "${input.id}" not found.`, metadata: {} }
      const status = statusOf(input.id)
      const lines = detail.facts.map((f: any) => `  ${f.a.padEnd(20)} ${f.v}`)
      return {
        title: input.id,
        output: `Entry: ${input.id}\nStatus: ${status}\n\nFields:\n${lines.join("\n")}`,
        metadata: { id: input.id, status, fields: entryFields(input.id) },
      }
    }

    if (input.action === "create_entry") {
      if (!input.collection) return cmsFail({ title: "Error", output: "collection is required." })
      const key = normalizeKey(input.collection)
      if (isReservedCollectionKey(key) && !hasCmsSchema(key)) {
        const alt = suggestCollectionKey(key)
        const hint = alt ? ` Create collection '${alt}' first (label can match the user's wording).` : ""
        return cmsFail({
          title: "Reserved key",
          output: `${reservedCollectionMessage(key)}${hint}`,
          metadata: { collection: key, suggestion: alt },
        })
      }
      const missing = requireCmsCollection(key)
      if (missing) return cmsFail({ title: "No collection", output: missing, metadata: { collection: key } })
      const existing = Trellis.storeEntities(undefined, { limit: 10000 }).find(
        (e) => e.type.trim().toLowerCase() === key,
      )
      const canonicalType = existing?.type ?? key
      const id = `${key}:${shortId()}`
      const raw = input.values ?? {}
      const values = writableValues(key, normalizeEntryValues(raw))
      if (Object.keys(values).length === 0) {
        const reason =
          Object.keys(raw).length === 0
            ? "values is required and must contain at least one field."
            : "values only contains virtual formula fields; provide at least one writable field."
        return cmsFail({
          title: "No entry created",
          output: `No draft entry was created in "${key}": ${reason}`,
          metadata: { collection: key },
        })
      }
      const check = validateValues(key, values, "create")
      if (!check.valid) {
        return cmsFail({
          title: "Validation failed",
          output: `Entry not created. Fix these errors:\n${check.errors.map((e) => "- " + e).join("\n")}`,
          metadata: { collection: key, errors: check.errors },
        })
      }
      const facts: Array<{ e: string; a: string; v: Json }> = [
        { e: id, a: "type", v: canonicalType },
        { e: id, a: "cms_status", v: "draft" },
      ]
      for (const [k, v] of Object.entries(check.values)) {
        facts.push({ e: id, a: k, v })
      }
      const result = Trellis.storeAssert(facts)
      if (!result) return cmsFail({ title: "Error", output: "Failed to create entry." })
      SemanticLinks.syncCmsEntry(id, Instance.directory, {
        actor: "cms",
        actorKind: "agent",
        source: "cms",
        sessionID: ctx.sessionID,
        reason: "cms entry created",
        relatedEntities: [id],
      })
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection: key, entry: id },
      })
      return cmsOk({
        title: `Created ${id}`,
        output: `Created draft entry "${id}" in collection "${key}".`,
        metadata: { id, collection: key },
      })
    }

    if (input.action === "update_entry") {
      if (!input.id) return cmsFail({ title: "Error", output: "id is required." })
      const detail = Trellis.storeEntity(input.id)
      if (!detail) return cmsFail({ title: "Not found", output: `Entry "${input.id}" not found.` })
      const raw = input.values ?? {}
      const kind = detail.facts.find((f: any) => f.a === "type")
      const key = typeof kind?.v === "string" ? normalizeKey(kind.v) : input.id.split(":")[0]
      const values = writableValues(key, normalizeEntryValues(raw))
      if (Object.keys(values).length === 0) {
        return cmsFail({
          title: "Nothing to update",
          output: "values is empty or only contains virtual formula fields.",
        })
      }
      const check = validateValues(key, values, "update")
      if (!check.valid) {
        return cmsFail({
          title: "Validation failed",
          output: `Entry not updated. Fix these errors:\n${check.errors.map((e) => "- " + e).join("\n")}`,
          metadata: { id: input.id, errors: check.errors },
        })
      }
      const retracts: Array<{ e: string; a: string; v: Json }> = []
      const asserts: Array<{ e: string; a: string; v: Json }> = []
      for (const [k, v] of Object.entries(check.values)) {
        const old = detail.facts.find((f: any) => f.a === k)
        if (old) retracts.push({ e: input.id, a: k, v: old.v as Json })
        asserts.push({ e: input.id, a: k, v })
      }
      if (retracts.length > 0) Trellis.storeRetract(retracts)
      const r = Trellis.storeAssert(asserts)
      if (!r) return cmsFail({ title: "Error", output: "Failed to update entry." })
      SemanticLinks.syncCmsEntry(input.id, Instance.directory, {
        actor: "cms",
        actorKind: "agent",
        source: "cms",
        sessionID: ctx.sessionID,
        reason: "cms entry updated",
        relatedEntities: [input.id],
      })
      const collection = input.id.includes(":") ? input.id.split(":")[0] : undefined
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection, entry: input.id },
      })
      return cmsOk({
        title: `Updated ${input.id}`,
        output: `Updated ${Object.keys(values).length} field(s): ${Object.keys(values).join(", ")}`,
        metadata: { id: input.id, collection: key, updated: Object.keys(values) },
      })
    }

    if (input.action === "delete_entry") {
      if (!input.id) return cmsFail({ title: "Error", output: "id is required." })
      const facts = factsByEntity(input.id)
      if (facts.length === 0) return cmsFail({ title: "Not found", output: `Entry "${input.id}" not found.` })
      const result = Trellis.storeRetract(facts)
      if (!result) return cmsFail({ title: "Error", output: "Failed to delete entry." })
      return cmsOk({
        title: `Deleted ${input.id}`,
        output: `Deleted entry "${input.id}" (${facts.length} facts retracted).`,
        metadata: { id: input.id, facts: facts.length },
      })
    }

    if (input.action === "publish" || input.action === "unpublish") {
      if (!input.id) return cmsFail({ title: "Error", output: "id is required." })
      const next = input.action === "publish" ? "published" : "draft"
      const facts = factsByEntity(input.id)
      const existing = facts.find((f) => f.a === "cms_status")
      if (existing) {
        const r = Trellis.storeRetract([existing])
        if (!r) return cmsFail({ title: "Error", output: "Failed to retract status." })
      }
      const r = Trellis.storeAssert([{ e: input.id, a: "cms_status", v: next }])
      if (!r) return cmsFail({ title: "Error", output: "Failed to assert status." })
      const collection = input.id.includes(":") ? input.id.split(":")[0] : undefined
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "cms",
        cms: { collection, entry: input.id },
      })
      return cmsOk({
        title: `${next === "published" ? "Published" : "Unpublished"} ${input.id}`,
        output: `Entry "${input.id}" is now ${next}.`,
        metadata: { id: input.id, collection, status: next },
      })
    }

    if (input.action === "scaffold_consumer") {
      if (!input.collection) return cmsFail({ title: "Error", output: "collection is required." })
      const key = normalizeKey(input.collection)
      const framework = input.framework ?? "vanilla"
      const url = input.cms_url ?? "http://localhost:4096"
      const code = scaffoldFor(framework, key, url, Instance.directory, input.expand)

      const relPath = input.output_path ?? defaultScaffoldFilename(key, framework)
      const absPath = path.isAbsolute(relPath) ? relPath : path.join(Instance.directory, relPath)

      const exists = await Filesystem.exists(absPath)
      if (exists) {
        return cmsFail({
          title: "Already exists",
          output: `${absPath} already exists. Pass output_path to write to a different location, or delete the existing file first.`,
          metadata: { path: absPath, collection: key, framework },
        })
      }

      await Filesystem.write(absPath, code)
      await Bus.publish(UIEvent.Navigate, {
        sessionID: ctx.sessionID,
        tab: "code",
        filePath: absPath,
      })
      return cmsOk({
        title: `Scaffolded ${path.relative(Instance.directory, absPath)}`,
        output: `Wrote ${framework} consumer for "${key}" to ${absPath}.\n\nThis file imports from "trellis/cms" and subscribes to live updates from the CMS — use it from your UI components instead of generating static data files.`,
        metadata: { path: absPath, collection: key, framework, expand: input.expand },
      })
    }

    return cmsFail({ title: "Error", output: `Unknown action: ${input.action}` })
  },
})

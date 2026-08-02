import { parse as parseFrontmatter } from "@opencode-ai/ui/frontmatter"
import { linkValue, type NoteFile, type NoteRecord } from "./types"

export type DirectoryListing = {
  path: string
  type: "file" | "directory"
  ignored?: boolean
}

export type LoadedNote = {
  path: string
  content: string
  mtime?: number
  ctime?: number
  size?: number
}

export type WalkOptions = {
  /** Lists immediate children of a directory (relative to vault root, "" for root). */
  listDir: (dir: string) => Promise<DirectoryListing[]>
  /** Reads a single markdown file and returns its raw contents. */
  readFile: (path: string) => Promise<LoadedNote | undefined>
  /** Cap the number of files we recursively visit. Default 5000. */
  maxFiles?: number
  /** Cap recursion depth. Default 10. */
  maxDepth?: number
}

const MD_EXT = /\.(md|markdown|mdx)$/i
const SKIP_DIRS = new Set([".git", ".trellis", ".obsidian", "node_modules", ".cache"])

export async function walkVault(root: string, opts: WalkOptions): Promise<NoteRecord[]> {
  const maxFiles = opts.maxFiles ?? 5000
  const maxDepth = opts.maxDepth ?? 10
  const paths: string[] = []

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    if (paths.length >= maxFiles) return
    const entries = await opts.listDir(dir)
    for (const entry of entries) {
      if (entry.ignored) continue
      const base = baseName(entry.path)
      if (entry.type === "directory") {
        if (SKIP_DIRS.has(base)) continue
        await walk(entry.path, depth + 1)
        if (paths.length >= maxFiles) return
        continue
      }
      if (MD_EXT.test(entry.path)) {
        paths.push(entry.path)
        if (paths.length >= maxFiles) return
      }
    }
  }

  await walk(root, 0)

  const notes: NoteRecord[] = []
  for (const path of paths) {
    const loaded = await opts.readFile(path)
    if (!loaded) continue
    notes.push(buildNote(loaded))
  }
  return notes
}

export function buildNote(loaded: LoadedNote): NoteRecord {
  const parsed = parseFrontmatter(loaded.content)
  const meta = parsed?.meta ?? {}
  const body = parsed?.body ?? loaded.content

  const file: NoteFile = {
    name: baseName(loaded.path),
    basename: stripExt(baseName(loaded.path)),
    path: loaded.path,
    folder: folderOf(loaded.path),
    ext: extOf(loaded.path),
    size: loaded.size ?? loaded.content.length,
    ctime: loaded.ctime ?? 0,
    mtime: loaded.mtime ?? 0,
    tags: extractTags(meta, body),
    links: extractLinks(body),
  }

  return { file, properties: coerceProperties(meta) }
}

function coerceProperties(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    out[key] = coerceValue(value)
  }
  return out
}

function coerceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerceValue)
  if (typeof value === "string") {
    const m = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
    if (m) return linkValue(m[1].trim(), m[2]?.trim())
  }
  return value
}

function extractTags(meta: Record<string, unknown>, body: string): string[] {
  const tags: string[] = []
  const fromMeta = meta.tags
  if (Array.isArray(fromMeta)) {
    for (const t of fromMeta) if (typeof t === "string") tags.push(t.replace(/^#/, ""))
  } else if (typeof fromMeta === "string") {
    tags.push(fromMeta.replace(/^#/, ""))
  }
  for (const match of body.matchAll(/(?:^|\s)#([a-zA-Z0-9_\-/]+)/g)) {
    tags.push(match[1])
  }
  return Array.from(new Set(tags))
}

function extractLinks(body: string): string[] {
  const links: string[] = []
  for (const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) {
    links.push(match[1].trim())
  }
  return links
}

function baseName(path: string): string {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(0, i) : ""
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(0, i) : name
}

function extOf(path: string): string {
  const name = baseName(path)
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ""
}

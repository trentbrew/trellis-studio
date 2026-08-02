import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CorpusKind } from "./ontology"
import { corpusEntrySchema, type CorpusEntry } from "./corpus-schema"

const CORPUS_ROOT = join(import.meta.dir, "../corpus")

let cache: Map<string, CorpusEntry> | undefined

function loadDir(dir: string): CorpusEntry[] {
  const abs = join(CORPUS_ROOT, dir)
  let names: string[] = []
  try {
    names = readdirSync(abs).filter((n) => n.endsWith(".json"))
  } catch {
    return []
  }
  const out: CorpusEntry[] = []
  for (const name of names) {
    const raw = readFileSync(join(abs, name), "utf8")
    const parsed = corpusEntrySchema.parse(JSON.parse(raw))
    out.push(parsed)
  }
  return out
}

function loadPrimitives(): CorpusEntry[] {
  try {
    const raw = readFileSync(join(CORPUS_ROOT, "primitives.json"), "utf8")
    const data = JSON.parse(raw) as { entries?: unknown[] }
    if (!Array.isArray(data.entries)) return []
    return data.entries.map((e) => corpusEntrySchema.parse(e))
  } catch {
    return []
  }
}

export function loadCorpus(): Map<string, CorpusEntry> {
  if (cache) return cache
  const entries = [
    ...loadPrimitives(),
    ...loadDir("figures"),
    ...loadDir("layouts"),
    ...loadDir("templates"),
  ]
  cache = new Map(entries.map((e) => [e.id, e]))
  return cache
}

export function resetCorpusCache(): void {
  cache = undefined
}

export function getCorpusEntry(id: string): CorpusEntry | undefined {
  return loadCorpus().get(id)
}

export function listCorpusEntries(kind?: CorpusKind): CorpusEntry[] {
  const all = [...loadCorpus().values()].sort((a, b) => a.id.localeCompare(b.id))
  return kind ? all.filter((e) => e.kind === kind) : all
}

export function listCorpusCatalog(): string {
  const byKind = new Map<CorpusKind, CorpusEntry[]>()
  for (const entry of loadCorpus().values()) {
    const list = byKind.get(entry.kind) ?? []
    list.push(entry)
    byKind.set(entry.kind, list)
  }
  const lines: string[] = ["# Whiteboard corpus", ""]
  for (const kind of ["primitive", "figure", "layout", "template"] as const) {
    const items = byKind.get(kind) ?? []
    if (!items.length) continue
    lines.push(`## ${kind}`, "")
    for (const item of items) {
      lines.push(`- **${item.id}** (v${item.version}) — ${item.description}`)
      if (item.tags?.length) lines.push(`  tags: ${item.tags.join(", ")}`)
    }
    lines.push("")
  }
  return lines.join("\n").trim()
}

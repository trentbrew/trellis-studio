import type { StoreFact } from "@/context/trellis-store"

export type NoteRecord = {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  tags: string[]
  pinned?: boolean
  color?: string
}

export function autoNoteTitle(content: string, fallback = "Untitled note"): string {
  const first = content
    .trim()
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean)
  if (first) return first.slice(0, 120)
  return fallback
}

export function noteFromFacts(id: string, facts: StoreFact[]): NoteRecord {
  const read = (attr: string) => {
    const fact = facts.find((item) => item.e === id && item.a === attr)
    if (!fact) return undefined
    return String(fact.v)
  }
  const now = new Date().toISOString()
  const content = read("content") ?? ""
  return {
    id,
    title: read("title") ?? autoNoteTitle(content),
    content,
    createdAt: read("createdAt") ?? now,
    updatedAt: read("updatedAt") ?? read("createdAt") ?? now,
    tags: parseNoteTags(read("tags")),
    pinned: read("pinned") === "true",
    color: read("color"),
  }
}

export function listNotes(entities: { id: string; type: string }[], facts: StoreFact[]): NoteRecord[] {
  const ids = new Set(entities.filter((entity) => entity.type === "note").map((entity) => entity.id))
  return [...ids]
    .map((id) => noteFromFacts(id, facts))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
}

export function parseNoteTags(raw?: string): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase().slice(0, 32)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length >= 12) break
  }
  return tags
}

export function formatNoteTags(tags: string[]): string {
  return parseNoteTags(tags.join(",")).join(", ")
}

export function normalizeNoteTag(value: string): string | undefined {
  const tag = value.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32)
  return tag || undefined
}

export function noteFacts(id: string, note: Pick<NoteRecord, "title" | "content" | "createdAt" | "updatedAt">): StoreFact[] {
  return [
    { e: id, a: "type", v: "note" },
    { e: id, a: "title", v: note.title },
    { e: id, a: "content", v: note.content },
    { e: id, a: "createdAt", v: note.createdAt },
    { e: id, a: "updatedAt", v: note.updatedAt },
  ]
}

export function formatNoteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const projectIdCache = new Map<string, string>()

/** Stable project entity id — mirrors opencode memory/note project hash. */
export async function projectEntityId(directory: string): Promise<string> {
  const cached = projectIdCache.get(directory)
  if (cached) return cached
  const data = new TextEncoder().encode(directory)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hex = [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  const id = `project:${hex.slice(0, 12)}`
  projectIdCache.set(directory, id)
  return id
}

export function plainNotePreview(content: string, max = 180) {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return "Empty note"
  return text.length > max ? `${text.slice(0, max).trim()}…` : text
}

import { createHash, randomUUID } from "crypto"
import { Instance } from "../project/instance"
import { StoreSDK } from "./store-sdk"
import * as SemanticLinks from "./semantic-links"
import { Trellis } from "./index"

export namespace Note {
  export type Item = {
    id: string
    title: string
    content: string
    createdAt: string
    updatedAt: string
    tags: string[]
    pinned?: boolean
    color?: string
  }

  export function autoTitle(content: string, fallback = "Untitled note"): string {
    const first = content
      .trim()
      .split(/\n+/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find(Boolean)
    if (first) return first.slice(0, 120)
    return fallback
  }

  function projectId(root: string) {
    return `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
  }

  function itemFromEntity(entityId: string, root: string): Item | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const fact = (attr: string) => detail.facts.find((item: { a: string; v: unknown }) => item.a === attr)?.v
    const str = (attr: string) => {
      const v = fact(attr)
      return typeof v === "string" ? v : undefined
    }
    const content = String(fact("content") ?? "")
    return {
      id: entityId,
      title: String(fact("title") ?? autoTitle(content)),
      content,
      createdAt: String(fact("createdAt") ?? ""),
      updatedAt: String(fact("updatedAt") ?? fact("createdAt") ?? ""),
      pinned: fact("pinned") === true || fact("pinned") === "true",
      color: str("color"),
      tags: parseTags(str("tags")),
    }
  }

  function parseTags(raw?: string): string[] {
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

  export function create(
    input: { content?: string; id?: string; tags?: string[] } = {},
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const now = new Date().toISOString()
    const content = input.content ?? ""
    const id = input.id ?? `note:${randomUUID()}`
    const title = autoTitle(content)
    const attrs: Record<string, string | number | boolean> = {
      title,
      content,
      createdAt: now,
      updatedAt: now,
    }
    if (input.tags?.length) attrs.tags = input.tags.join(", ")

    StoreSDK.defineEntity("note", id, attrs, root)
    StoreSDK.relate(projectId(root), "knows", id, root)
    SemanticLinks.syncNote(id, content, root, {
      actor: "notes",
      actorKind: "system",
      source: "notes",
      reason: "note created",
      relatedEntities: [id],
    })

    return { id, title, content, createdAt: now, updatedAt: now, tags: parseTags(attrs.tags as string | undefined) }
  }

  export function save(
    input: { id: string; content: string; tags?: string[] | null },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    const existing = Trellis.storeEntity(input.id, root)
    if (!existing) {
      return create({ id: input.id, content: input.content, tags: input.tags ?? undefined }, root)
    }
    return update(
      input.id,
      { content: input.content, tags: input.tags === undefined ? undefined : input.tags },
      root,
    )
  }

  export function update(
    id: string,
    patch: {
      content?: string
      title?: string
      tags?: string[] | null
      pinned?: boolean | null
      color?: string | null
    },
    dir?: string,
  ): Item | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const existing = itemFromEntity(id, root)
    if (!existing) return undefined

    const content = patch.content ?? existing.content
    const title = patch.title ?? autoTitle(content, existing.title)
    const now = new Date().toISOString()
    const attrs: Record<string, string | number | boolean | null> = {
      title,
      content,
      updatedAt: now,
    }
    if (patch.tags !== undefined) attrs.tags = patch.tags?.length ? patch.tags.join(", ") : null
    if (patch.pinned !== undefined) attrs.pinned = patch.pinned
    if (patch.color !== undefined) attrs.color = patch.color

    StoreSDK.updateEntity(id, attrs, root)
    SemanticLinks.syncNote(id, content, root, {
      actor: "notes",
      actorKind: "system",
      source: "notes",
      reason: "note updated",
      relatedEntities: [id],
    })
    return itemFromEntity(id, root)
  }

  export function remove(id: string, dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    return StoreSDK.deleteEntity(id, root)
  }

  export function list(opts?: { limit?: number }, dir?: string): Item[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []

    return Trellis.storeEntities(root, { type: "note", limit: opts?.limit ?? 100 })
      .map((entity) => itemFromEntity(entity.id, root))
      .filter((item): item is Item => !!item)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }
}

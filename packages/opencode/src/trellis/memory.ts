import { createHash } from "crypto"
import { Instance } from "../project/instance"
import { StoreSDK } from "./store-sdk"
import { Trellis } from "./index"
import { MemoryIndex } from "./memory-index"

export namespace Memory {
  export type Item = {
    id: string
    title: string
    content: string
    scope: string
    tags: string[]
    updatedAt: string
  }

  export type RecallResult = Item & { score: number }

  const indexed = new Set<string>()

  const key = (title: string) => {
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "note"
    return `memory:${slug}`
  }

  const tags = (value?: string[]) =>
    value?.map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 12) ?? []

  export function remember(
    input: {
      title: string
      content: string
      scope?: "user" | "project"
      tags?: string[]
      source?: string
      sessionID?: string
      /**
       * Stable disambiguator for the entity id. When omitted the id is derived
       * from the title, so two facts sharing a title (e.g. two "Birthday"
       * events) collide and overwrite each other. Callers with extra context
       * (subject, date, scope) should pass a unique key to avoid that.
       */
      key?: string
    },
    dir?: string,
  ) {
    const root = dir ?? Instance.directory
    const title = input.title.trim()
    const content = input.content.trim()
    if (!title || !content) return undefined

    Trellis.init(root).catch(() => undefined)
    if (!Trellis.storeStats(root)) return undefined

    const id = key(input.key?.trim() || title)
    const now = new Date().toISOString()
    const existing = Trellis.storeEntity(id, root)
    const attrs: Record<string, string | number | boolean> = {
      title,
      content,
      scope: input.scope ?? "project",
      updatedAt: now,
    }
    const tagList = tags(input.tags)
    if (tagList.length) attrs.tags = tagList.join(", ")
    if (input.source) attrs.source = input.source
    if (!existing) attrs.createdAt = now

    if (!existing) StoreSDK.defineEntity("memory", id, attrs, root)
    else StoreSDK.updateEntity(id, attrs, root)

    const project = `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
    StoreSDK.relate(project, "knows", id, root)

    void Trellis.record({
      tool: "memory.remember",
      sessionID: input.sessionID ?? "system",
      args: { title, scope: attrs.scope },
      output: id,
    })

    void MemoryIndex.upsert(id, title, content, root).catch(() => undefined)

    return { id, title, content, scope: String(attrs.scope), tags: tagList, updatedAt: now }
  }

  export function backfill(dir?: string) {
    return MemoryIndex.backfill(dir)
  }

  /** Index any memory:* entities missing from the vector store (once per project dir). */
  export function ensureIndexed(dir?: string) {
    const root = dir ?? Instance.directory
    if (indexed.has(root)) return
    indexed.add(root)
    void backfill(root).catch(() => undefined)
  }

  function itemFromEntity(entityId: string, root: string): Item | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const fact = (attr: string) => detail.facts.find((item: { a: string }) => item.a === attr)?.v
    const rawTags = fact("tags")
    return {
      id: entityId,
      title: String(fact("title") ?? entityId),
      content: String(fact("content") ?? ""),
      scope: String(fact("scope") ?? "project"),
      tags:
        typeof rawTags === "string"
          ? rawTags
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      updatedAt: String(fact("updatedAt") ?? ""),
    }
  }

  export async function recall(
    query: string,
    opts?: { limit?: number; minScore?: number; scope?: "user" | "project" },
    dir?: string,
  ): Promise<RecallResult[]> {
    const root = dir ?? Instance.directory
    const q = query.trim()
    if (!q || !Trellis.storeStats(root)) return []

    ensureIndexed(root)

    const results = await MemoryIndex.search(
      q,
      { limit: opts?.limit ?? 8, minScore: opts?.minScore ?? 0.2 },
      root,
    )

    const items: RecallResult[] = []
    for (const result of results) {
      const item = itemFromEntity(result.chunk.entityId, root)
      if (!item) continue
      if (opts?.scope && item.scope !== opts.scope) continue
      items.push({ ...item, score: result.score })
    }
    return items
  }

  export function list(opts?: { limit?: number; scope?: "user" | "project" }, dir?: string): Item[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []

    return Trellis.storeEntities(root, { type: "memory", limit: opts?.limit ?? 24 })
      .map((entity) => {
        const detail = Trellis.storeEntity(entity.id, root)
        if (!detail) return undefined
        const fact = (attr: string) => detail.facts.find((item: { a: string }) => item.a === attr)?.v
        const scope = String(fact("scope") ?? "project")
        if (opts?.scope && scope !== opts.scope) return undefined
        const rawTags = fact("tags")
        return {
          id: entity.id,
          title: String(fact("title") ?? entity.id),
          content: String(fact("content") ?? ""),
          scope,
          tags:
            typeof rawTags === "string"
              ? rawTags
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              : [],
          updatedAt: String(fact("updatedAt") ?? ""),
        } satisfies Item
      })
      .filter((item): item is Item => !!item)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  export async function promptBlock(opts?: { query?: string; limit?: number }, dir?: string) {
    const root = dir ?? Instance.directory
    const limit = opts?.limit ?? 12
    if (!Trellis.storeStats(root)) return undefined

    ensureIndexed(root)

    const recentCount = Math.min(4, limit)
    const recent = list({ limit: recentCount }, root)
    const seen = new Set(recent.map((item) => item.id))
    let items = [...recent]

    const query = opts?.query?.trim()
    if (query) {
      const relevant = await recall(query, { limit, minScore: 0.15 }, root)
      for (const item of relevant) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        items.push(item)
        if (items.length >= limit) break
      }
    } else if (items.length < limit) {
      items = list({ limit }, root)
    }

    if (!items.length) return undefined

    const lines = items.map((item) => {
      const body = item.content.length > 220 ? `${item.content.slice(0, 220)}…` : item.content
      return `- ${item.title}: ${body}`
    })
    return [
      `<project-memory>`,
      query
        ? "Relevant durable facts for this project (recent + semantically matched):"
        : "Durable facts already stored for this project:",
      ...lines,
      "When you learn new stable preferences, conventions, or decisions, call memory remember silently.",
      "Use memory recall when you need facts beyond what is listed here.",
      "Skip ephemeral chat, one-off task state, and guesses.",
      `</project-memory>`,
    ].join("\n")
  }
}

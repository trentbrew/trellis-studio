import { resolve } from "path"
import { embed, VectorStore, type SearchResult, type ChunkType } from "trellis/ai"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Trellis } from "./index"

export namespace MemoryIndex {
  const log = Log.create({ service: "trellis.memory-index" })

  const CHUNK_TYPE: ChunkType = "summary_md"
  const stores = new Map<string, VectorStore>()

  function dbPath(dir: string) {
    return resolve(dir, ".trellis", "memory-vectors.db")
  }

  async function store(dir: string): Promise<VectorStore | undefined> {
    const path = dbPath(dir)
    const existing = stores.get(path)
    if (existing) return existing
    try {
      const created = await VectorStore.create(path)
      stores.set(path, created)
      return created
    } catch (err) {
      log.warn("open failed", { path, error: String(err) })
      return undefined
    }
  }

  function chunkId(entityId: string) {
    return `mem:${entityId}`
  }

  function compose(title: string, content: string) {
    return `${title}\n\n${content}`.trim()
  }

  export async function upsert(entityId: string, title: string, content: string, dir?: string) {
    const root = dir ?? Instance.directory
    const text = compose(title, content)
    if (!text) return false
    const s = await store(root)
    if (!s) return false
    try {
      const vector = await embed(text)
      s.upsert({
        id: chunkId(entityId),
        entityId,
        content: text,
        chunkType: CHUNK_TYPE,
        updatedAt: new Date().toISOString(),
        embedding: vector,
      })
      return true
    } catch (err) {
      log.warn("upsert failed", { entityId, error: String(err) })
      return false
    }
  }

  export async function search(
    query: string,
    opts?: { limit?: number; minScore?: number },
    dir?: string,
  ): Promise<SearchResult[]> {
    const root = dir ?? Instance.directory
    const q = query.trim()
    if (!q) return []
    const s = await store(root)
    if (!s) return []
    try {
      const vector = await embed(q)
      return s.search(vector, { limit: opts?.limit ?? 8, minScore: opts?.minScore ?? 0 })
    } catch (err) {
      log.warn("search failed", { query: q.slice(0, 50), error: String(err) })
      return []
    }
  }

  export async function remove(entityId: string, dir?: string) {
    const root = dir ?? Instance.directory
    const s = await store(root)
    if (!s) return
    try {
      s.deleteByEntity(entityId)
    } catch (err) {
      log.warn("remove failed", { entityId, error: String(err) })
    }
  }

  export async function backfill(dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return { scanned: 0, embedded: 0 }
    const s = await store(root)
    if (!s) return { scanned: 0, embedded: 0 }

    const entities = Trellis.storeEntities(root, { type: "memory" })
    let embedded = 0
    for (const entity of entities) {
      if (s.getChunk(chunkId(entity.id))) continue
      const detail = Trellis.storeEntity(entity.id, root)
      if (!detail) continue
      const fact = (attr: string) => detail.facts.find((f: any) => f.a === attr)?.v
      const title = String(fact("title") ?? "")
      const content = String(fact("content") ?? "")
      const ok = await upsert(entity.id, title, content, root)
      if (ok) embedded += 1
    }
    return { scanned: entities.length, embedded }
  }

  export async function stats(dir?: string) {
    const root = dir ?? Instance.directory
    const s = await store(root)
    if (!s) return { count: 0 }
    try {
      return { count: s.count() }
    } catch {
      return { count: 0 }
    }
  }

  export function close(dir?: string) {
    const root = dir ?? Instance.directory
    const path = dbPath(root)
    const s = stores.get(path)
    if (!s) return
    try {
      s.close()
    } catch {
      // ignore
    }
    stores.delete(path)
  }
}

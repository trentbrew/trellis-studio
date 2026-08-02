import { Trellis } from "./index"

/**
 * High-level typed SDK for the Trellis EAV store.
 * Composes raw store wrappers into ergonomic patterns for entity lifecycle,
 * querying, relationships, and schema introspection.
 */
export namespace StoreSDK {
  // ---------------------------------------------------------------------------
  // Entity lifecycle
  // ---------------------------------------------------------------------------

  /** Create an entity with a type and a bag of attributes in one call. */
  export function defineEntity(
    type: string,
    id: string,
    attrs: Record<string, string | number | boolean>,
    dir?: string,
  ) {
    const facts: Array<{ e: string; a: string; v: string | number | boolean }> = [{ e: id, a: "type", v: type }]
    for (const [a, v] of Object.entries(attrs)) {
      facts.push({ e: id, a, v })
    }
    return Trellis.storeAssert(facts, dir)
  }

  /** Patch an entity: retract changed/removed attrs, assert new values. */
  export function updateEntity(id: string, patch: Record<string, string | number | boolean | null>, dir?: string) {
    const detail = Trellis.storeEntity(id, dir)
    if (!detail) return undefined

    const existing = new Map<string, string | number | boolean>()
    for (const f of detail.facts) {
      if (f.a !== "type") existing.set(f.a, f.v as string | number | boolean)
    }

    const retract: Array<{ e: string; a: string; v: string | number | boolean }> = []
    const assert: Array<{ e: string; a: string; v: string | number | boolean }> = []

    for (const [a, v] of Object.entries(patch)) {
      const old = existing.get(a)
      if (v === null) {
        if (old !== undefined) retract.push({ e: id, a, v: old })
        continue
      }
      if (old !== undefined && old !== v) retract.push({ e: id, a, v: old })
      if (old !== v) assert.push({ e: id, a, v })
    }

    if (retract.length) Trellis.storeRetract(retract, dir)
    if (assert.length) Trellis.storeAssert(assert, dir)
    return { retracted: retract.length, asserted: assert.length }
  }

  /** Delete an entity: retract all facts and unlink all links. */
  export function deleteEntity(id: string, dir?: string) {
    const detail = Trellis.storeEntity(id, dir)
    if (!detail) return undefined

    const facts = detail.facts.map((f: any) => ({ e: f.e, a: f.a, v: f.v as string | number | boolean }))
    const links = detail.links.map((l: any) => ({ e1: l.e1, a: l.a, e2: l.e2 }))

    if (facts.length) Trellis.storeRetract(facts, dir)
    if (links.length) Trellis.storeUnlink(links, dir)
    return { retracted: facts.length, unlinked: links.length }
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  /** Find entities of a given type, with optional attribute filters. */
  export function findByType(type: string, filters?: Record<string, string | number | boolean>, dir?: string) {
    const entities = Trellis.storeEntities(dir, { type })
    if (!filters || Object.keys(filters).length === 0) return entities

    return entities.filter((entity) => {
      const detail = Trellis.storeEntity(entity.id, dir)
      if (!detail) return false
      return Object.entries(filters).every(([a, v]) => detail.facts.some((f: any) => f.a === a && f.v === v))
    })
  }

  /** Find facts matching an attribute and optional value. */
  export function findByAttribute(attr: string, value?: string, dir?: string) {
    return Trellis.storeFacts(dir, { attribute: attr, value })
  }

  /** Get an entity and its N-hop linked neighbors as a subgraph. */
  export function getGraph(id: string, depth = 1, dir?: string) {
    const visited = new Set<string>()
    const nodes: Array<{ id: string; type?: string; facts: Array<{ a: string; v: unknown }> }> = []
    const edges: Array<{ e1: string; a: string; e2: string }> = []

    function walk(eid: string, hop: number) {
      if (visited.has(eid)) return
      visited.add(eid)

      const detail = Trellis.storeEntity(eid, dir)
      if (!detail) return

      const type = detail.facts.find((f: any) => f.a === "type")?.v as string | undefined
      nodes.push({
        id: eid,
        type,
        facts: detail.facts.filter((f: any) => f.a !== "type").map((f: any) => ({ a: f.a, v: f.v })),
      })

      for (const link of detail.links) {
        edges.push(link)
        if (hop < depth) {
          const neighbor = link.e1 === eid ? link.e2 : link.e1
          walk(neighbor, hop + 1)
        }
      }
    }

    walk(id, 0)
    return { nodes, edges }
  }

  // ---------------------------------------------------------------------------
  // Relationship helpers
  // ---------------------------------------------------------------------------

  /** Create a directional link between two entities. */
  export function relate(source: string, relation: string, target: string, dir?: string) {
    return Trellis.storeLink([{ e1: source, a: relation, e2: target }], dir)
  }

  /** Remove a directional link between two entities. */
  export function unrelate(source: string, relation: string, target: string, dir?: string) {
    return Trellis.storeUnlink([{ e1: source, a: relation, e2: target }], dir)
  }

  // ---------------------------------------------------------------------------
  // Schema introspection
  // ---------------------------------------------------------------------------

  /** Get distinct entity types with counts. */
  export function entityTypes(dir?: string) {
    const entities = Trellis.storeEntities(dir, { limit: 10000 })
    const counts = new Map<string, number>()
    for (const e of entities) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }

  /** Get attributes commonly used by entities of a given type. */
  export function attributesFor(type: string, dir?: string) {
    const entities = Trellis.storeEntities(dir, { type, limit: 50 })
    const attrs = new Map<string, { count: number; examples: Set<string> }>()

    for (const entity of entities) {
      const detail = Trellis.storeEntity(entity.id, dir)
      if (!detail) continue
      for (const f of detail.facts) {
        if (f.a === "type") continue
        const entry = attrs.get(f.a) ?? { count: 0, examples: new Set() }
        entry.count++
        if (entry.examples.size < 3) entry.examples.add(String(f.v))
        attrs.set(f.a, entry)
      }
    }

    return Array.from(attrs.entries())
      .map(([attr, info]) => ({ attribute: attr, count: info.count, examples: Array.from(info.examples) }))
      .sort((a, b) => b.count - a.count)
  }
}

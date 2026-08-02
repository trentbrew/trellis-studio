import { createMemo } from "solid-js"
import type { StoreEntity, StoreFact } from "@/context/trellis-store"
import { entityTypeKey, typeKey, visibleEntity } from "@/pages/session/database-panel-utils"

export function createCmsCache(store: { entities: StoreEntity[]; facts: StoreFact[] }) {
  const facts = createMemo(() => {
    const map = new Map<string, StoreFact[]>()
    for (const fact of store.facts) {
      const list = map.get(fact.e)
      if (list) list.push(fact)
      else map.set(fact.e, [fact])
    }
    return map
  })

  const types = createMemo(() => {
    const map = new Map<string, StoreEntity[]>()
    for (const entity of store.entities) {
      if (!visibleEntity(entity)) continue
      const key = entityTypeKey(entity.type)
      const list = map.get(key)
      if (list) list.push(entity)
      else map.set(key, [entity])
    }
    return map
  })

  return {
    facts,
    entities: (key: string) => types().get(typeKey(key)) ?? [],
  }
}

export type CmsCache = ReturnType<typeof createCmsCache>

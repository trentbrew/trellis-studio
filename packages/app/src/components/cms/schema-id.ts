import type { StoreEntity, StoreFact } from "@/context/trellis-store"
import { typeKey } from "@/pages/session/database-panel-utils"

/** Resolve the canonical TypeSchema entity id for a collection key. */
export function resolveSchemaId(
  key: string,
  entities: readonly StoreEntity[],
  facts: readonly StoreFact[],
): string {
  const want = typeKey(key)
  for (const entity of entities) {
    if (entity.type !== "TypeSchema") continue
    const name = entity.id.replace(/^schema:/, "")
    if (typeKey(name) === want) return entity.id
  }
  for (const fact of facts) {
    if (fact.a !== "type" || fact.v !== "TypeSchema" || !fact.e.startsWith("schema:")) continue
    const name = fact.e.replace(/^schema:/, "")
    if (typeKey(name) === want) return fact.e
  }
  return `schema:${key}`
}

export function schemaFactsFor(
  schemaId: string,
  facts: ReadonlyMap<string, StoreFact[]>,
): StoreFact[] {
  return facts.get(schemaId) ?? []
}

export function retractEntityAttrs(
  facts: ReadonlyMap<string, StoreFact[]>,
  entityId: string,
  attrs: readonly string[],
): StoreFact[] {
  return (facts.get(entityId) ?? []).filter((fact) => attrs.includes(fact.a))
}

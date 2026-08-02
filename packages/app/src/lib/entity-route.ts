import { entityTypeFromId } from "@/lib/entity-theme"
import { entityTypeKey } from "@/pages/session/database-panel-utils"

export type EntityFact = {
  e: string
  a: string
  v: unknown
}

export type DesignSection =
  | "brand"
  | "icons"
  | "colors"
  | "type"
  | "assets"
  | "videos"
  | "documents"
  | "models"
  | "audio"
  | "links"
  | "sprites"

export type EntityRoute =
  | { kind: "trellis"; issue: string }
  | { kind: "file"; path: string }
  | { kind: "cms"; collection: string; entry: string }
  | { kind: "design"; section?: DesignSection; entity?: string; path?: string }
  | { kind: "graph"; id: string; type: string }

const val = (facts: EntityFact[], attr: string) => {
  const fact = facts.find((item) => item.a === attr)
  if (!fact) return
  return String(fact.v)
}

const cmsCollection = (id: string, facts: EntityFact[]) => {
  const type = val(facts, "type")
  if (type) return entityTypeKey(type)
  return entityTypeFromId(id)
}

const designSection = (category?: string): DesignSection | undefined => {
  if (category === "link") return "links"
  if (category === "audio") return "audio"
  if (category === "model3d" || category === "texture") return "models"
  if (category === "spritesheet") return "sprites"
  if (category === "image") return "assets"
  if (category === "video") return "videos"
  if (category === "document") return "documents"
  return undefined
}

const designRoute = (id: string, facts: EntityFact[]): EntityRoute => ({
  kind: "design",
  section: designSection(val(facts, "category")),
  entity: id,
  path: val(facts, "path"),
})

const issueRoute = (id: string, facts: EntityFact[]): EntityRoute | undefined => {
  const raw = val(facts, "id") ?? (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id)
  if (/^TRL-\d+$/i.test(raw)) return { kind: "trellis", issue: raw }
  return undefined
}

export function routeFromFacts(id: string, facts?: EntityFact[]): EntityRoute {
  const ref = id.trim()
  const prefix = entityTypeFromId(ref)

  if (/^TRL-\d+$/i.test(ref)) return { kind: "trellis", issue: ref }

  if (ref.startsWith("file:") || prefix === "file") {
    return { kind: "file", path: ref.startsWith("file:") ? ref.slice(5) : ref }
  }

  if (facts?.length) {
    if (facts.some((fact) => fact.a === "cms_status")) {
      return { kind: "cms", collection: cmsCollection(ref, facts), entry: ref }
    }

    const type = val(facts, "type")
    if (type === "Asset" || ref.startsWith("asset:")) return designRoute(ref, facts)
    if (type === "Icon" || ref.startsWith("icon:")) return { kind: "design", section: "icons", entity: ref }
    if (type === "ColorPalette" || ref.startsWith("palette:")) return { kind: "design", section: "colors", entity: ref }
    if (type === "Font" || ref.startsWith("font:")) return { kind: "design", section: "type", entity: ref }
    if (type === "Brand" || ref.startsWith("brand:")) return { kind: "design", section: "brand", entity: ref }
    if (type === "ProjectBrandConfig" || ref === "project-brand:config")
      return { kind: "design", section: "brand", entity: ref }

    if (type === "Issue" || ref.startsWith("issue:")) {
      const route = issueRoute(ref, facts)
      if (route) return route
    }
  }

  if (ref.startsWith("asset:")) return { kind: "design", entity: ref }

  return { kind: "graph", id: ref, type: prefix }
}

export async function resolveEntityRoute(
  id: string,
  lookup?: (id: string) => Promise<EntityFact[] | undefined>,
): Promise<EntityRoute> {
  const facts = lookup ? await lookup(id.trim()) : undefined
  return routeFromFacts(id, facts)
}

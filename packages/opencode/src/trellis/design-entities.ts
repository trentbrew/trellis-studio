import { createHash } from "crypto"
import { Instance } from "../project/instance"
import { StoreSDK } from "./store-sdk"
import { Trellis } from "./index"
import {
  catalogRefForIcon,
  joinTags,
  parseJson,
  parseTags,
  slugId,
  storageKeyFromCatalogRef,
  type DesignFont,
  type DesignIcon,
  type DesignPalette,
} from "./design-types"

export namespace DesignEntities {
  function projectId(root: string) {
    return `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
  }

  function fact(entityId: string, root: string, attr: string) {
    const detail = Trellis.storeEntity(entityId, root)
    return detail?.facts.find((item: { a: string; v: unknown }) => item.a === attr)?.v
  }

  function iconFromEntity(entityId: string, root: string): DesignIcon | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const type = detail.facts.find((f: { a: string; v: unknown }) => f.a === "type")?.v
    if (type !== "Icon") return undefined
    const library = String(fact(entityId, root, "library") ?? "lucide") as DesignIcon["library"]
    return {
      id: entityId,
      key: String(fact(entityId, root, "key") ?? ""),
      library,
      category: typeof fact(entityId, root, "category") === "string" ? String(fact(entityId, root, "category")) : undefined,
      tags: parseTags(typeof fact(entityId, root, "tags") === "string" ? String(fact(entityId, root, "tags")) : undefined),
      aliases: parseTags(typeof fact(entityId, root, "aliases") === "string" ? String(fact(entityId, root, "aliases")) : undefined),
      description:
        typeof fact(entityId, root, "description") === "string" ? String(fact(entityId, root, "description")) : undefined,
      catalogRef:
        typeof fact(entityId, root, "catalogRef") === "string" ? String(fact(entityId, root, "catalogRef")) : undefined,
      createdAt: String(fact(entityId, root, "createdAt") ?? ""),
    }
  }

  function fontFromEntity(entityId: string, root: string): DesignFont | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const type = detail.facts.find((f: { a: string; v: unknown }) => f.a === "type")?.v
    if (type !== "Font") return undefined
    return {
      id: entityId,
      family: String(fact(entityId, root, "family") ?? ""),
      category: typeof fact(entityId, root, "category") === "string" ? String(fact(entityId, root, "category")) : undefined,
      variants: parseJson<string[]>(fact(entityId, root, "variants"), []),
      tags: parseTags(typeof fact(entityId, root, "tags") === "string" ? String(fact(entityId, root, "tags")) : undefined),
      description:
        typeof fact(entityId, root, "description") === "string" ? String(fact(entityId, root, "description")) : undefined,
      catalogRef:
        typeof fact(entityId, root, "catalogRef") === "string" ? String(fact(entityId, root, "catalogRef")) : undefined,
      createdAt: String(fact(entityId, root, "createdAt") ?? ""),
    }
  }

  function paletteFromEntity(entityId: string, root: string): DesignPalette | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const type = detail.facts.find((f: { a: string; v: unknown }) => f.a === "type")?.v
    if (type !== "ColorPalette") return undefined
    return {
      id: entityId,
      name: String(fact(entityId, root, "name") ?? ""),
      description:
        typeof fact(entityId, root, "description") === "string" ? String(fact(entityId, root, "description")) : undefined,
      swatches: parseJson<Record<string, string>>(fact(entityId, root, "swatches"), {}),
      tags: parseTags(typeof fact(entityId, root, "tags") === "string" ? String(fact(entityId, root, "tags")) : undefined),
      createdAt: String(fact(entityId, root, "createdAt") ?? ""),
    }
  }

  export function findIconByKey(key: string, library: DesignIcon["library"], dir?: string) {
    const root = dir ?? Instance.directory
    return listIcons({ limit: 500 }, root).find((icon) => icon.key === key && icon.library === library)
  }

  export function findFontByFamily(family: string, dir?: string) {
    const root = dir ?? Instance.directory
    const target = family.trim().toLowerCase()
    return listFonts({ limit: 500 }, root).find((font) => font.family.trim().toLowerCase() === target)
  }

  export function findPaletteByName(name: string, dir?: string) {
    const root = dir ?? Instance.directory
    const target = name.trim().toLowerCase()
    return listPalettes({ limit: 500 }, root).find((palette) => palette.name.trim().toLowerCase() === target)
  }

  export function materializeIcon(
    input: {
      key: string
      library?: DesignIcon["library"]
      category?: string
      tags?: string[]
      aliases?: string[]
      description?: string
      catalogRef?: string
    },
    dir?: string,
  ): DesignIcon | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const library = input.library ?? storageKeyFromCatalogRef(input.catalogRef ?? input.key).library
    const key = input.key.includes(":") ? storageKeyFromCatalogRef(input.key).key : input.key
    const existing = findIconByKey(key, library, root)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = slugId("icon", library === "lucide" ? key : `${library}-${key}`)
    const catalogRef = input.catalogRef ?? catalogRefForIcon(key, library)
    const attrs: Record<string, string | number | boolean> = {
      key,
      library,
      catalogRef,
      createdAt: now,
    }
    if (input.category) attrs.category = input.category
    if (input.description) attrs.description = input.description
    const tags = joinTags(input.tags)
    if (tags) attrs.tags = tags
    const aliases = joinTags(input.aliases)
    if (aliases) attrs.aliases = aliases

    StoreSDK.defineEntity("Icon", id, attrs, root)
    StoreSDK.relate(projectId(root), "knows", id, root)
    return iconFromEntity(id, root)
  }

  export function materializeFont(
    input: {
      family: string
      category?: string
      variants?: string[]
      tags?: string[]
      description?: string
      catalogRef?: string
    },
    dir?: string,
  ): DesignFont | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const existing = findFontByFamily(input.family, root)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = slugId("font", input.family)
    const attrs: Record<string, string | number | boolean> = {
      family: input.family,
      variants: JSON.stringify(input.variants ?? ["regular"]),
      createdAt: now,
    }
    if (input.category) attrs.category = input.category
    if (input.description) attrs.description = input.description
    if (input.catalogRef) attrs.catalogRef = input.catalogRef
    const tags = joinTags(input.tags)
    if (tags) attrs.tags = tags

    StoreSDK.defineEntity("Font", id, attrs, root)
    StoreSDK.relate(projectId(root), "knows", id, root)
    return fontFromEntity(id, root)
  }

  export function createPalette(
    input: {
      name: string
      description?: string
      swatches: Record<string, string>
      tags?: string[]
    },
    dir?: string,
  ): DesignPalette | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const existing = findPaletteByName(input.name, root)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = slugId("palette", input.name)
    const attrs: Record<string, string | number | boolean> = {
      name: input.name,
      swatches: JSON.stringify(input.swatches),
      createdAt: now,
    }
    if (input.description) attrs.description = input.description
    const tags = joinTags(input.tags)
    if (tags) attrs.tags = tags

    StoreSDK.defineEntity("ColorPalette", id, attrs, root)
    StoreSDK.relate(projectId(root), "knows", id, root)
    return paletteFromEntity(id, root)
  }

  export function updatePalette(
    id: string,
    patch: {
      name?: string
      description?: string | null
      swatches?: Record<string, string>
      tags?: string[]
    },
    dir?: string,
  ): DesignPalette | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    if (!paletteFromEntity(id, root)) return undefined

    const attrs: Record<string, string | null> = {}
    if (patch.name !== undefined) attrs.name = patch.name
    if (patch.description !== undefined) attrs.description = patch.description
    if (patch.swatches !== undefined) attrs.swatches = JSON.stringify(patch.swatches)
    if (patch.tags !== undefined) attrs.tags = patch.tags.length ? (joinTags(patch.tags) ?? null) : null

    StoreSDK.updateEntity(id, attrs, root)
    return paletteFromEntity(id, root)
  }

  export function listIcons(opts?: { limit?: number; query?: string }, dir?: string): DesignIcon[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    const q = opts?.query?.trim().toLowerCase()
    return Trellis.storeEntities(root, { type: "Icon", limit: opts?.limit ?? 200 })
      .map((entity) => iconFromEntity(entity.id, root))
      .filter((item): item is DesignIcon => !!item)
      .filter((item) => {
        if (!q) return true
        const haystack = [item.key, item.library, item.category ?? "", ...item.tags, ...item.aliases, item.description ?? ""]
          .join(" ")
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.key.localeCompare(b.key))
  }

  export function listFonts(opts?: { limit?: number; query?: string }, dir?: string): DesignFont[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    const q = opts?.query?.trim().toLowerCase()
    return Trellis.storeEntities(root, { type: "Font", limit: opts?.limit ?? 200 })
      .map((entity) => fontFromEntity(entity.id, root))
      .filter((item): item is DesignFont => !!item)
      .filter((item) => {
        if (!q) return true
        const haystack = [item.family, item.category ?? "", ...item.tags, item.description ?? ""].join(" ").toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.family.localeCompare(b.family))
  }

  export function listPalettes(opts?: { limit?: number; query?: string }, dir?: string): DesignPalette[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    const q = opts?.query?.trim().toLowerCase()
    return Trellis.storeEntities(root, { type: "ColorPalette", limit: opts?.limit ?? 200 })
      .map((entity) => paletteFromEntity(entity.id, root))
      .filter((item): item is DesignPalette => !!item)
      .filter((item) => {
        if (!q) return true
        const haystack = [item.name, item.description ?? "", ...item.tags, ...Object.keys(item.swatches)].join(" ").toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  export function remove(id: string, dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    return StoreSDK.deleteEntity(id, root)
  }
}

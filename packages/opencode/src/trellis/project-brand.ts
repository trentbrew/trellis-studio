import { createHash } from "crypto"
import { Instance } from "../project/instance"
import { DesignEntities } from "./design-entities"
import { StoreSDK } from "./store-sdk"
import { Trellis } from "./index"
import {
  parseJson,
  PROJECT_BRAND_CONFIG_ID,
  slugId,
  type Brand,
  type BrandOverrides,
  type BrandSemantics,
  type BrandSnapshot,
  type BrandTokens,
  type CloudBrandTemplate,
  type DesignFont,
  type DesignIcon,
  type DesignPalette,
  type ProjectBrandConfig,
} from "./design-types"

export namespace ProjectBrand {
  function projectId(root: string) {
    return `project:${createHash("sha256").update(root).digest("hex").slice(0, 12)}`
  }

  function fact(entityId: string, root: string, attr: string) {
    const detail = Trellis.storeEntity(entityId, root)
    return detail?.facts.find((item: { a: string; v: unknown }) => item.a === attr)?.v
  }

  function brandFromEntity(entityId: string, root: string): Brand | undefined {
    const detail = Trellis.storeEntity(entityId, root)
    if (!detail) return undefined
    const type = detail.facts.find((f: { a: string; v: unknown }) => f.a === "type")?.v
    if (type !== "Brand") return undefined
    return {
      id: entityId,
      name: String(fact(entityId, root, "name") ?? "Brand"),
      description:
        typeof fact(entityId, root, "description") === "string" ? String(fact(entityId, root, "description")) : undefined,
      logoPath:
        typeof fact(entityId, root, "logoPath") === "string" ? String(fact(entityId, root, "logoPath")) : undefined,
      paletteIds: parseJson<string[]>(fact(entityId, root, "paletteIds"), []),
      primaryPaletteId:
        typeof fact(entityId, root, "primaryPaletteId") === "string"
          ? String(fact(entityId, root, "primaryPaletteId"))
          : undefined,
      fontIds: parseJson<string[]>(fact(entityId, root, "fontIds"), []),
      headingFontId:
        typeof fact(entityId, root, "headingFontId") === "string" ? String(fact(entityId, root, "headingFontId")) : undefined,
      bodyFontId:
        typeof fact(entityId, root, "bodyFontId") === "string" ? String(fact(entityId, root, "bodyFontId")) : undefined,
      monoFontId:
        typeof fact(entityId, root, "monoFontId") === "string" ? String(fact(entityId, root, "monoFontId")) : undefined,
      iconLibrary: (String(fact(entityId, root, "iconLibrary") ?? "lucide") as Brand["iconLibrary"]) || "lucide",
      enabledIconIds: parseJson<string[]>(fact(entityId, root, "enabledIconIds"), []),
      tokens: parseJson<BrandTokens | undefined>(fact(entityId, root, "tokens"), undefined),
      semantics: parseJson<BrandSemantics | undefined>(fact(entityId, root, "semantics"), undefined),
      createdAt: String(fact(entityId, root, "createdAt") ?? ""),
    }
  }

  function configFromEntity(root: string): ProjectBrandConfig | undefined {
    const detail = Trellis.storeEntity(PROJECT_BRAND_CONFIG_ID, root)
    if (!detail) return undefined
    const type = detail.facts.find((f: { a: string; v: unknown }) => f.a === "type")?.v
    if (type !== "ProjectBrandConfig") return undefined
    return {
      id: PROJECT_BRAND_CONFIG_ID,
      activeBrandId:
        typeof fact(PROJECT_BRAND_CONFIG_ID, root, "activeBrandId") === "string"
          ? String(fact(PROJECT_BRAND_CONFIG_ID, root, "activeBrandId"))
          : undefined,
      activeBrandVersion:
        typeof fact(PROJECT_BRAND_CONFIG_ID, root, "activeBrandVersion") === "number"
          ? Number(fact(PROJECT_BRAND_CONFIG_ID, root, "activeBrandVersion"))
          : undefined,
      localBrandId:
        typeof fact(PROJECT_BRAND_CONFIG_ID, root, "localBrandId") === "string"
          ? String(fact(PROJECT_BRAND_CONFIG_ID, root, "localBrandId"))
          : undefined,
      cloudBrandSpec:
        typeof fact(PROJECT_BRAND_CONFIG_ID, root, "cloudBrandSpec") === "string"
          ? String(fact(PROJECT_BRAND_CONFIG_ID, root, "cloudBrandSpec"))
          : undefined,
      overrides: parseJson<BrandOverrides | undefined>(fact(PROJECT_BRAND_CONFIG_ID, root, "overrides"), undefined),
      resolvedSnapshot: parseJson<BrandSnapshot | undefined>(
        fact(PROJECT_BRAND_CONFIG_ID, root, "resolvedSnapshot"),
        undefined,
      ),
    }
  }

  function ensureConfig(root: string) {
    const existing = configFromEntity(root)
    if (existing) return existing
    const now = new Date().toISOString()
    StoreSDK.defineEntity(
      "ProjectBrandConfig",
      PROJECT_BRAND_CONFIG_ID,
      { createdAt: now },
      root,
    )
    StoreSDK.relate(projectId(root), "knows", PROJECT_BRAND_CONFIG_ID, root)
    return configFromEntity(root)
  }

  function applyOverrides(brand: Brand, overrides?: BrandOverrides): Brand {
    if (!overrides) return brand
    return {
      ...brand,
      primaryPaletteId: overrides.primaryPaletteId ?? brand.primaryPaletteId,
      headingFontId: overrides.headingFontId ?? brand.headingFontId,
      bodyFontId: overrides.bodyFontId ?? brand.bodyFontId,
      monoFontId: overrides.monoFontId ?? brand.monoFontId,
      enabledIconIds: overrides.enabledIconIds ?? brand.enabledIconIds,
      tokens: overrides.tokens ? { ...brand.tokens, ...overrides.tokens } : brand.tokens,
      semantics: overrides.semantics ? { ...brand.semantics, ...overrides.semantics } : brand.semantics,
    }
  }

  function lookupPalette(id: string, root: string): DesignPalette | undefined {
    return DesignEntities.listPalettes({ limit: 500 }, root).find((item) => item.id === id)
  }

  function lookupFont(id: string, root: string): DesignFont | undefined {
    return DesignEntities.listFonts({ limit: 500 }, root).find((item) => item.id === id)
  }

  function lookupIcon(id: string, root: string): DesignIcon | undefined {
    return DesignEntities.listIcons({ limit: 500 }, root).find((item) => item.id === id)
  }

  export function resolve(dir?: string, opts?: { persist?: boolean }): BrandSnapshot | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const config = getConfig(root)
    const brandId = config?.localBrandId ?? listBrands(root)[0]?.id
    if (!brandId) return undefined

    const brand = brandFromEntity(brandId, root)
    if (!brand) return undefined

    const merged = applyOverrides(brand, config?.overrides)
    const palettes = merged.paletteIds.map((id) => lookupPalette(id, root)).filter((item): item is DesignPalette => !!item)
    const fonts = merged.fontIds.map((id) => lookupFont(id, root)).filter((item): item is DesignFont => !!item)
    const icons =
      merged.enabledIconIds.length > 0
        ? merged.enabledIconIds.map((id) => lookupIcon(id, root)).filter((item): item is DesignIcon => !!item)
        : DesignEntities.listIcons({ limit: 500 }, root)

    const snapshot: BrandSnapshot = {
      ...merged,
      resolvedAt: new Date().toISOString(),
      palettes,
      fonts,
      icons,
      cloudTemplateId: config?.activeBrandId,
      cloudTemplateVersion: config?.activeBrandVersion,
    }

    if (opts?.persist !== false) {
      ensureConfig(root)
      StoreSDK.updateEntity(
        PROJECT_BRAND_CONFIG_ID,
        { resolvedSnapshot: JSON.stringify(snapshot) },
        root,
      )
    }

    return snapshot
  }

  export function getConfig(dir?: string): ProjectBrandConfig | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    return configFromEntity(root)
  }

  export function getResolved(dir?: string): BrandSnapshot | undefined {
    const root = dir ?? Instance.directory
    const config = getConfig(root)
    if (config?.resolvedSnapshot) return config.resolvedSnapshot
    return resolve(root)
  }

  export function setConfig(
    patch: {
      localBrandId?: string | null
      activeBrandId?: string | null
      activeBrandVersion?: number | null
      cloudBrandSpec?: string | null
      overrides?: BrandOverrides | null
    },
    dir?: string,
  ) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    ensureConfig(root)

    const attrs: Record<string, string | number | null> = {}
    if (patch.localBrandId !== undefined) attrs.localBrandId = patch.localBrandId
    if (patch.activeBrandId !== undefined) attrs.activeBrandId = patch.activeBrandId
    if (patch.activeBrandVersion !== undefined) attrs.activeBrandVersion = patch.activeBrandVersion
    if (patch.cloudBrandSpec !== undefined) attrs.cloudBrandSpec = patch.cloudBrandSpec
    if (patch.overrides !== undefined) {
      attrs.overrides = patch.overrides ? JSON.stringify(patch.overrides) : null
    }

    StoreSDK.updateEntity(PROJECT_BRAND_CONFIG_ID, attrs, root)
    return getConfig(root)
  }

  export function refreshSnapshot(dir?: string) {
    return resolve(dir, { persist: true })
  }

  export function listBrands(dir?: string): Brand[] {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return []
    return Trellis.storeEntities(root, { type: "Brand", limit: 50 })
      .map((entity) => brandFromEntity(entity.id, root))
      .filter((item): item is Brand => !!item)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  export function createBrand(
    input: {
      name: string
      description?: string
      logoPath?: string | null
      paletteIds?: string[]
      primaryPaletteId?: string
      fontIds?: string[]
      headingFontId?: string
      bodyFontId?: string
      monoFontId?: string
      iconLibrary?: Brand["iconLibrary"]
      enabledIconIds?: string[]
      tokens?: BrandTokens
      semantics?: BrandSemantics
    },
    dir?: string,
  ): Brand | undefined {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const existing = listBrands(root).find((brand) => brand.name.toLowerCase() === input.name.trim().toLowerCase())
    if (existing) return existing

    const now = new Date().toISOString()
    const id = slugId("brand", input.name)
    const attrs: Record<string, string | number | boolean> = {
      name: input.name.trim(),
      paletteIds: JSON.stringify(input.paletteIds ?? []),
      fontIds: JSON.stringify(input.fontIds ?? []),
      iconLibrary: input.iconLibrary ?? "lucide",
      enabledIconIds: JSON.stringify(input.enabledIconIds ?? []),
      createdAt: now,
    }
    if (input.description) attrs.description = input.description
    if (input.logoPath) attrs.logoPath = input.logoPath
    if (input.primaryPaletteId) attrs.primaryPaletteId = input.primaryPaletteId
    if (input.headingFontId) attrs.headingFontId = input.headingFontId
    if (input.bodyFontId) attrs.bodyFontId = input.bodyFontId
    if (input.monoFontId) attrs.monoFontId = input.monoFontId
    if (input.tokens) attrs.tokens = JSON.stringify(input.tokens)
    if (input.semantics) attrs.semantics = JSON.stringify(input.semantics)

    StoreSDK.defineEntity("Brand", id, attrs, root)
    StoreSDK.relate(projectId(root), "knows", id, root)
    return brandFromEntity(id, root)
  }

  export function updateBrand(
    id: string,
    patch: {
      name?: string
      description?: string | null
      logoPath?: string | null
      paletteIds?: string[]
      primaryPaletteId?: string | null
      fontIds?: string[]
      headingFontId?: string | null
      bodyFontId?: string | null
      monoFontId?: string | null
      iconLibrary?: Brand["iconLibrary"]
      enabledIconIds?: string[]
      tokens?: BrandTokens | null
      semantics?: BrandSemantics | null
    },
    dir?: string,
  ) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined
    if (!brandFromEntity(id, root)) return undefined

    const attrs: Record<string, string | null> = {}
    if (patch.name !== undefined) attrs.name = patch.name
    if (patch.description !== undefined) attrs.description = patch.description
    if (patch.logoPath !== undefined) attrs.logoPath = patch.logoPath
    if (patch.paletteIds !== undefined) attrs.paletteIds = JSON.stringify(patch.paletteIds)
    if (patch.primaryPaletteId !== undefined) attrs.primaryPaletteId = patch.primaryPaletteId
    if (patch.fontIds !== undefined) attrs.fontIds = JSON.stringify(patch.fontIds)
    if (patch.headingFontId !== undefined) attrs.headingFontId = patch.headingFontId
    if (patch.bodyFontId !== undefined) attrs.bodyFontId = patch.bodyFontId
    if (patch.monoFontId !== undefined) attrs.monoFontId = patch.monoFontId
    if (patch.iconLibrary !== undefined) attrs.iconLibrary = patch.iconLibrary
    if (patch.enabledIconIds !== undefined) attrs.enabledIconIds = JSON.stringify(patch.enabledIconIds)
    if (patch.tokens !== undefined) attrs.tokens = patch.tokens ? JSON.stringify(patch.tokens) : null
    if (patch.semantics !== undefined) attrs.semantics = patch.semantics ? JSON.stringify(patch.semantics) : null

    StoreSDK.updateEntity(id, attrs, root)
    return brandFromEntity(id, root)
  }

  function matchFamily(family: string | undefined, candidate: string) {
    if (!family) return false
    return family.trim().toLowerCase() === candidate.trim().toLowerCase()
  }

  export function applyCloudTemplate(template: CloudBrandTemplate, dir?: string) {
    const root = dir ?? Instance.directory
    if (!Trellis.storeStats(root)) return undefined

    const spec = template.spec
    const paletteIds: string[] = []
    let primaryPaletteId: string | undefined

    for (const palette of spec.palettes ?? []) {
      const materialized = DesignEntities.createPalette(
        {
          name: palette.name,
          description: palette.description,
          swatches: { ...palette.swatches },
          tags: palette.tags,
        },
        root,
      )
      if (!materialized) continue
      paletteIds.push(materialized.id)
      if (matchFamily(spec.primaryPaletteName, palette.name)) primaryPaletteId = materialized.id
    }
    if (!primaryPaletteId && paletteIds.length) primaryPaletteId = paletteIds[0]

    const fontIds: string[] = []
    let headingFontId: string | undefined
    let bodyFontId: string | undefined
    let monoFontId: string | undefined

    for (const font of spec.fonts ?? []) {
      const materialized = DesignEntities.materializeFont(
        {
          family: font.family,
          category: font.category,
          variants: font.variants,
          catalogRef: font.catalogRef,
          tags: font.tags,
        },
        root,
      )
      if (!materialized) continue
      fontIds.push(materialized.id)
      if (matchFamily(spec.headingFontFamily, font.family)) headingFontId = materialized.id
      if (matchFamily(spec.bodyFontFamily, font.family)) bodyFontId = materialized.id
      if (matchFamily(spec.monoFontFamily, font.family)) monoFontId = materialized.id
    }

    const enabledIconIds: string[] = []
    for (const icon of spec.icons ?? []) {
      const materialized = DesignEntities.materializeIcon(
        {
          key: icon.key,
          library: icon.library ?? "lucide",
          category: icon.category,
          tags: icon.tags,
        },
        root,
      )
      if (materialized) enabledIconIds.push(materialized.id)
    }

    const existing = listBrands(root).find((brand) => brand.name.toLowerCase() === spec.name.trim().toLowerCase())
    const brandInput = {
      name: spec.name,
      description: spec.description,
      paletteIds,
      primaryPaletteId,
      fontIds,
      headingFontId,
      bodyFontId,
      monoFontId,
      iconLibrary: spec.iconLibrary ?? ("lucide" as Brand["iconLibrary"]),
      enabledIconIds,
      tokens: spec.tokens,
      semantics: spec.semantics,
    }

    const brand = existing
      ? updateBrand(existing.id, brandInput, root)
      : createBrand(brandInput, root)
    if (!brand) return undefined

    setConfig(
      {
        activeBrandId: template.id,
        activeBrandVersion: template.version,
        cloudBrandSpec: JSON.stringify(template),
        localBrandId: brand.id,
      },
      root,
    )

    return refreshSnapshot(root)
  }

  export function needsCloudTemplateRefresh(dir?: string) {
    const config = getConfig(dir)
    if (!config?.activeBrandId || config.activeBrandVersion == null || !config.cloudBrandSpec) return false
    const cached = parseJson<CloudBrandTemplate | undefined>(config.cloudBrandSpec, undefined)
    return !!cached && cached.version > config.activeBrandVersion
  }
}

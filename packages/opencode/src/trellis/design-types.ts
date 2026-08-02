export type DesignIcon = {
  id: string
  key: string
  library: "lucide" | "custom" | "brand"
  category?: string
  tags: string[]
  aliases: string[]
  description?: string
  catalogRef?: string
  createdAt: string
}

export type DesignFont = {
  id: string
  family: string
  category?: string
  variants: string[]
  tags: string[]
  description?: string
  catalogRef?: string
  createdAt: string
}

export type DesignPalette = {
  id: string
  name: string
  description?: string
  swatches: Record<string, string>
  tags: string[]
  createdAt: string
}

export type BrandTokens = {
  radius?: string
  spacing?: string
  elevation?: string
  motion?: string
}

export type BrandSemantics = {
  /** Long-form brand voice guidance for agents and copy */
  voice?: string
  /** Short adjective tags (e.g. clear, warm, professional) */
  adjectives?: string[]
  values?: string[]
  tone?: string[]
  mood?: string[]
  audience?: string[]
  avoid?: string[]
}

export type Brand = {
  id: string
  name: string
  description?: string
  /** Workspace-relative path to logo image (e.g. .trellis/brand/logo.png) */
  logoPath?: string
  paletteIds: string[]
  primaryPaletteId?: string
  fontIds: string[]
  headingFontId?: string
  bodyFontId?: string
  monoFontId?: string
  iconLibrary: "lucide" | "custom" | "brand"
  enabledIconIds: string[]
  tokens?: BrandTokens
  semantics?: BrandSemantics
  createdAt: string
}

export type BrandOverrides = Partial<{
  primaryPaletteId: string
  headingFontId: string
  bodyFontId: string
  monoFontId: string
  enabledIconIds: string[]
  semantics: BrandSemantics
  tokens: BrandTokens
}>

export type BrandTemplateSpec = {
  name: string
  description?: string
  iconLibrary?: Brand["iconLibrary"]
  semantics?: BrandSemantics
  tokens?: BrandTokens
  palettes?: Array<{
    name: string
    description?: string
    swatches: Record<string, string>
    tags?: string[]
  }>
  fonts?: Array<{
    family: string
    category?: string
    variants?: string[]
    catalogRef?: string
    tags?: string[]
  }>
  icons?: Array<{
    key: string
    library?: "lucide" | "custom"
    category?: string
    tags?: string[]
  }>
  primaryPaletteName?: string
  headingFontFamily?: string
  bodyFontFamily?: string
  monoFontFamily?: string
}

export type CloudBrandTemplate = {
  id: string
  name: string
  description?: string
  version: number
  spec: BrandTemplateSpec
}

export type ProjectBrandConfig = {
  id: string
  activeBrandId?: string
  activeBrandVersion?: number
  localBrandId?: string
  cloudBrandSpec?: string
  overrides?: BrandOverrides
  resolvedSnapshot?: BrandSnapshot
}

export type BrandSnapshot = Brand & {
  resolvedAt: string
  palettes: DesignPalette[]
  fonts: DesignFont[]
  icons: DesignIcon[]
  cloudTemplateId?: string
  cloudTemplateVersion?: number
}

export const PROJECT_BRAND_CONFIG_ID = "project-brand:config"

export function slugId(prefix: string, raw: string) {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${prefix}:${slug || "item"}`
}

export function parseTags(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24)
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function joinTags(tags?: string[]) {
  return tags?.length ? tags.join(", ") : undefined
}

export function storageKeyFromCatalogRef(catalogRef: string) {
  if (catalogRef.startsWith("custom:")) {
    return { key: catalogRef.slice("custom:".length), library: "custom" as const }
  }
  if (catalogRef.startsWith("lucide:")) {
    return { key: catalogRef.slice("lucide:".length), library: "lucide" as const }
  }
  return { key: catalogRef, library: "lucide" as const }
}

export function catalogRefForIcon(key: string, library: "lucide" | "custom" | "brand") {
  if (library === "lucide") return `lucide:${key}`
  if (library === "custom") return `custom:${key}`
  return `brand:${key}`
}

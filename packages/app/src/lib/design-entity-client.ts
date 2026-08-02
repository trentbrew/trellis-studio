import { formatIconKey, parseIconKey } from "./icon-key"

export function designEntitySlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function iconEntityId(stored: string) {
  const parsed = parseIconKey(stored)
  if (!parsed) return null
  const slug = parsed.library === "lucide" ? parsed.key : `${parsed.library}-${parsed.key}`
  return `icon:${designEntitySlug(slug)}`
}

export function iconEntityFacts(stored: string, extra?: { category?: string; tags?: string[] }) {
  const parsed = parseIconKey(stored)
  if (!parsed) return null
  const id = iconEntityId(stored)
  if (!id) return null
  const catalogRef = parsed.library === "lucide" ? `lucide:${parsed.key}` : formatIconKey(parsed.library, parsed.key)
  const facts: Array<{ e: string; a: string; v: string }> = [
    { e: id, a: "type", v: "Icon" },
    { e: id, a: "key", v: parsed.key },
    { e: id, a: "library", v: parsed.library },
    { e: id, a: "catalogRef", v: catalogRef },
    { e: id, a: "createdAt", v: new Date().toISOString() },
  ]
  if (extra?.category) facts.push({ e: id, a: "category", v: extra.category })
  if (extra?.tags?.length) facts.push({ e: id, a: "tags", v: extra.tags.join(", ") })
  return facts
}

export function fontEntityId(family: string) {
  return `font:${designEntitySlug(family)}`
}

export function fontEntityFacts(input: {
  family: string
  category?: string
  variants?: string[]
  catalogRef?: string
  tags?: string[]
}) {
  const id = fontEntityId(input.family)
  const facts: Array<{ e: string; a: string; v: string }> = [
    { e: id, a: "type", v: "Font" },
    { e: id, a: "family", v: input.family },
    { e: id, a: "variants", v: JSON.stringify(input.variants ?? ["regular"]) },
    { e: id, a: "createdAt", v: new Date().toISOString() },
  ]
  if (input.category) facts.push({ e: id, a: "category", v: input.category })
  if (input.catalogRef) facts.push({ e: id, a: "catalogRef", v: input.catalogRef })
  if (input.tags?.length) facts.push({ e: id, a: "tags", v: input.tags.join(", ") })
  return facts
}

export function paletteEntityId(name: string) {
  return `palette:${designEntitySlug(name)}`
}

export function paletteEntityFacts(input: {
  name: string
  description?: string
  swatches: Record<string, string>
  tags?: string[]
}) {
  const id = paletteEntityId(input.name)
  const facts: Array<{ e: string; a: string; v: string }> = [
    { e: id, a: "type", v: "ColorPalette" },
    { e: id, a: "name", v: input.name },
    { e: id, a: "swatches", v: JSON.stringify(input.swatches) },
    { e: id, a: "createdAt", v: new Date().toISOString() },
  ]
  if (input.description) facts.push({ e: id, a: "description", v: input.description })
  if (input.tags?.length) facts.push({ e: id, a: "tags", v: input.tags.join(", ") })
  return facts
}

export const CURATED_FONTS = [
  { family: "Inter", category: "sans-serif", variants: ["regular", "500", "600", "700"] },
  { family: "Roboto", category: "sans-serif", variants: ["regular", "500", "700"] },
  { family: "Open Sans", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Montserrat", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Poppins", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Lora", category: "serif", variants: ["regular", "600", "700"] },
  { family: "JetBrains Mono", category: "monospace", variants: ["regular", "500", "700"] },
  { family: "Fira Code", category: "monospace", variants: ["regular", "500", "700"] },
] as const

export const DEFAULT_PALETTE_SWATCHES: Record<string, string> = {
  primary: "#18181b",
  secondary: "#52525b",
  accent: "#2563eb",
  surface: "#fafafa",
  background: "#ffffff",
  border: "#e4e4e7",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
}

export function parseJsonFact<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function entityFact(facts: Array<{ e: string; a: string; v: unknown }>, entityId: string, attr: string) {
  return facts.find((fact) => fact.e === entityId && fact.a === attr)?.v
}

export const PROJECT_BRAND_CONFIG_ID = "project-brand:config"

export type BrandSemanticsView = {
  voice?: string
  adjectives?: string[]
  values?: string[]
  tone?: string[]
  mood?: string[]
  audience?: string[]
  avoid?: string[]
}

export type BrandSnapshotView = {
  id: string
  name: string
  description?: string
  logoPath?: string
  primaryPaletteId?: string
  headingFontId?: string
  bodyFontId?: string
  monoFontId?: string
  iconLibrary: string
  semantics?: BrandSemanticsView
  resolvedAt?: string
  activeBrandId?: string
  activeBrandVersion?: number
  palettes: Array<{ id: string; name: string; swatches: Record<string, string> }>
  fonts: Array<{ id: string; family: string }>
  icons: Array<{ id: string; key: string; library: string }>
}

function livePalette(facts: Array<{ e: string; a: string; v: unknown }>, id: string) {
  const name = String(entityFact(facts, id, "name") ?? id)
  const swatches = parseJsonFact<Record<string, string>>(entityFact(facts, id, "swatches"), {})
  if (!Object.keys(swatches).length) return undefined
  return { id, name, swatches }
}

function liveFont(facts: Array<{ e: string; a: string; v: unknown }>, id: string) {
  const family = String(entityFact(facts, id, "family") ?? "")
  if (!family) return undefined
  return { id, family }
}

function liveIcon(
  facts: Array<{ e: string; a: string; v: unknown }>,
  entities: Array<{ id: string; type: string }>,
  id: string,
) {
  const key = String(entityFact(facts, id, "key") ?? "")
  if (!key) return undefined
  return {
    id,
    key,
    library: String(entityFact(facts, id, "library") ?? "lucide"),
  }
}

function overlayLiveBrand(
  stored: BrandSnapshotView,
  facts: Array<{ e: string; a: string; v: unknown }>,
  entities: Array<{ id: string; type: string }>,
): BrandSnapshotView {
  const brandId = stored.id
  const paletteIds = parseJsonFact<string[]>(entityFact(facts, brandId, "paletteIds"), stored.palettes.map((p) => p.id))
  const fontIds = parseJsonFact<string[]>(entityFact(facts, brandId, "fontIds"), stored.fonts.map((f) => f.id))
  const enabledIconIds = parseJsonFact<string[]>(
    entityFact(facts, brandId, "enabledIconIds"),
    stored.icons.map((i) => i.id),
  )

  const palettes = paletteIds
    .map((id) => livePalette(facts, id))
    .filter((palette): palette is NonNullable<typeof palette> => !!palette)

  const fonts = fontIds
    .map((id) => liveFont(facts, id))
    .filter((font): font is NonNullable<typeof font> => !!font)

  const icons = (enabledIconIds.length ? enabledIconIds : entities.filter((e) => e.type === "Icon").map((e) => e.id))
    .map((id) => liveIcon(facts, entities, id))
    .filter((icon): icon is NonNullable<typeof icon> => !!icon)

  return {
    ...stored,
    name: String(entityFact(facts, brandId, "name") ?? stored.name),
    description:
      typeof entityFact(facts, brandId, "description") === "string"
        ? String(entityFact(facts, brandId, "description"))
        : stored.description,
    logoPath:
      typeof entityFact(facts, brandId, "logoPath") === "string"
        ? String(entityFact(facts, brandId, "logoPath"))
        : stored.logoPath,
    primaryPaletteId:
      typeof entityFact(facts, brandId, "primaryPaletteId") === "string"
        ? String(entityFact(facts, brandId, "primaryPaletteId"))
        : stored.primaryPaletteId,
    headingFontId:
      typeof entityFact(facts, brandId, "headingFontId") === "string"
        ? String(entityFact(facts, brandId, "headingFontId"))
        : stored.headingFontId,
    bodyFontId:
      typeof entityFact(facts, brandId, "bodyFontId") === "string"
        ? String(entityFact(facts, brandId, "bodyFontId"))
        : stored.bodyFontId,
    monoFontId:
      typeof entityFact(facts, brandId, "monoFontId") === "string"
        ? String(entityFact(facts, brandId, "monoFontId"))
        : stored.monoFontId,
    iconLibrary: String(entityFact(facts, brandId, "iconLibrary") ?? stored.iconLibrary),
    semantics: parseJsonFact<BrandSemanticsView | undefined>(
      entityFact(facts, brandId, "semantics"),
      stored.semantics,
    ),
    palettes: palettes.length ? palettes : stored.palettes,
    fonts: fonts.length ? fonts : stored.fonts,
    icons: icons.length ? icons : stored.icons,
  }
}

export function readBrandSnapshot(
  facts: Array<{ e: string; a: string; v: unknown }>,
  entities: Array<{ id: string; type: string }>,
): BrandSnapshotView | null {
  const stored = parseJsonFact<BrandSnapshotView | null>(
    entityFact(facts, PROJECT_BRAND_CONFIG_ID, "resolvedSnapshot"),
    null,
  )
  if (stored?.name) {
    const activeBrandId =
      typeof entityFact(facts, PROJECT_BRAND_CONFIG_ID, "activeBrandId") === "string"
        ? String(entityFact(facts, PROJECT_BRAND_CONFIG_ID, "activeBrandId"))
        : stored.activeBrandId
    const activeBrandVersionRaw = entityFact(facts, PROJECT_BRAND_CONFIG_ID, "activeBrandVersion")
    const activeBrandVersion =
      typeof activeBrandVersionRaw === "number"
        ? activeBrandVersionRaw
        : stored.activeBrandVersion
    return overlayLiveBrand(
      { ...stored, activeBrandId, activeBrandVersion },
      facts,
      entities,
    )
  }

  const localBrandId = String(entityFact(facts, PROJECT_BRAND_CONFIG_ID, "localBrandId") ?? "")
  const brandId =
    localBrandId ||
    entities.find((entity) => entity.type === "Brand")?.id ||
    entities.find((entity) => entity.id.startsWith("brand:"))?.id ||
    ""
  if (!brandId) return null

  const paletteIds = parseJsonFact<string[]>(entityFact(facts, brandId, "paletteIds"), [])
  const fontIds = parseJsonFact<string[]>(entityFact(facts, brandId, "fontIds"), [])
  const enabledIconIds = parseJsonFact<string[]>(entityFact(facts, brandId, "enabledIconIds"), [])

  const palettes = paletteIds
    .map((id) => {
      const name = String(entityFact(facts, id, "name") ?? id)
      const swatches = parseJsonFact<Record<string, string>>(entityFact(facts, id, "swatches"), {})
      return { id, name, swatches }
    })
    .filter((palette) => Object.keys(palette.swatches).length > 0)

  const fonts = fontIds
    .map((id) => ({ id, family: String(entityFact(facts, id, "family") ?? id) }))
    .filter((font) => font.family)

  const icons = (enabledIconIds.length ? enabledIconIds : entities.filter((entity) => entity.type === "Icon").map((e) => e.id))
    .map((id) => ({
      id,
      key: String(entityFact(facts, id, "key") ?? id),
      library: String(entityFact(facts, id, "library") ?? "lucide"),
    }))
    .filter((icon) => icon.key)

  return {
    id: brandId,
    name: String(entityFact(facts, brandId, "name") ?? "Brand"),
    description:
      typeof entityFact(facts, brandId, "description") === "string"
        ? String(entityFact(facts, brandId, "description"))
        : undefined,
    logoPath:
      typeof entityFact(facts, brandId, "logoPath") === "string"
        ? String(entityFact(facts, brandId, "logoPath"))
        : undefined,
    primaryPaletteId:
      typeof entityFact(facts, brandId, "primaryPaletteId") === "string"
        ? String(entityFact(facts, brandId, "primaryPaletteId"))
        : undefined,
    headingFontId:
      typeof entityFact(facts, brandId, "headingFontId") === "string"
        ? String(entityFact(facts, brandId, "headingFontId"))
        : undefined,
    bodyFontId:
      typeof entityFact(facts, brandId, "bodyFontId") === "string"
        ? String(entityFact(facts, brandId, "bodyFontId"))
        : undefined,
    monoFontId:
      typeof entityFact(facts, brandId, "monoFontId") === "string"
        ? String(entityFact(facts, brandId, "monoFontId"))
        : undefined,
    iconLibrary: String(entityFact(facts, brandId, "iconLibrary") ?? "lucide"),
    semantics: parseJsonFact<BrandSemanticsView | undefined>(entityFact(facts, brandId, "semantics"), undefined),
    palettes,
    fonts,
    icons,
  }
}

export function brandSnapshotFacts(snapshot: BrandSnapshotView) {
  const resolved = { ...snapshot, resolvedAt: new Date().toISOString() }
  return [
    { e: PROJECT_BRAND_CONFIG_ID, a: "type", v: "ProjectBrandConfig" },
    { e: PROJECT_BRAND_CONFIG_ID, a: "localBrandId", v: snapshot.id },
    { e: PROJECT_BRAND_CONFIG_ID, a: "resolvedSnapshot", v: JSON.stringify(resolved) },
    { e: PROJECT_BRAND_CONFIG_ID, a: "createdAt", v: new Date().toISOString() },
  ]
}

import z from "zod"
import { Tool } from "./tool"
import { DesignEntities } from "../trellis/design-entities"
import { DesignSeed } from "../trellis/design-seed"
import { ProjectBrand } from "../trellis/project-brand"
import { findBrandTemplatePreset } from "../trellis/brand-template-presets"
import type { CloudBrandTemplate } from "../trellis/design-types"
import { searchCatalogIcons, searchCuratedFonts } from "../design/catalog"
import { Trellis } from "../trellis"

const semanticsSchema = z.object({
  voice: z.string().trim().max(4000).optional(),
  adjectives: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  values: z.array(z.string()).optional(),
  tone: z.array(z.string()).optional(),
  mood: z.array(z.string()).optional(),
  audience: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
})

const tokensSchema = z.object({
  radius: z.string().optional(),
  spacing: z.string().optional(),
  elevation: z.string().optional(),
  motion: z.string().optional(),
})

const overridesSchema = z.object({
  primaryPaletteId: z.string().optional(),
  headingFontId: z.string().optional(),
  bodyFontId: z.string().optional(),
  monoFontId: z.string().optional(),
  enabledIconIds: z.array(z.string()).optional(),
  semantics: semanticsSchema.optional(),
  tokens: tokensSchema.optional(),
})

const swatchesSchema = z.record(z.string(), z.string())

const params = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list_icons"),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("list_fonts"),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("list_palettes"),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("search_catalog_icons"),
    query: z.string().trim().min(1).max(200),
    library: z.enum(["lucide", "custom", "all"]).optional(),
    limit: z.number().int().min(1).max(80).optional(),
  }),
  z.object({
    action: z.literal("materialize_icon"),
    key: z.string().trim().min(1).max(120),
    library: z.enum(["lucide", "custom", "brand"]).optional(),
  }),
  z.object({
    action: z.literal("materialize_font"),
    family: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("create_palette"),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    swatches: swatchesSchema,
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  }),
  z.object({
    action: z.literal("seed_defaults"),
  }),
  z.object({
    action: z.literal("get_brand"),
  }),
  z.object({
    action: z.literal("refresh_brand"),
  }),
  z.object({
    action: z.literal("set_brand_overrides"),
    overrides: overridesSchema,
  }),
  z.object({
    action: z.literal("update_brand_semantics"),
    semantics: semanticsSchema,
  }),
  z.object({
    action: z.literal("update_brand"),
    name: z.string().trim().min(1).max(120).optional(),
    logoPath: z.string().trim().max(500).nullable().optional(),
    headingFontFamily: z.string().trim().min(1).max(120).optional(),
    bodyFontFamily: z.string().trim().min(1).max(120).optional(),
    monoFontFamily: z.string().trim().min(1).max(120).optional(),
    primaryPaletteId: z.string().trim().min(1).max(120).optional(),
    enabledIconIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
    semantics: semanticsSchema.optional(),
  }),
  z.object({
    action: z.literal("update_palette"),
    paletteId: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    swatches: swatchesSchema,
  }),
  z.object({
    action: z.literal("apply_brand_template"),
    templateId: z.string().trim().min(1).max(120).optional(),
    template: z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        version: z.number().int().min(1),
        spec: z.object({}).passthrough(),
      })
      .optional(),
  }),
])

function formatIcon(item: ReturnType<typeof DesignEntities.listIcons>[number]) {
  return `${item.id} — ${item.library}:${item.key}${item.category ? ` (${item.category})` : ""}`
}

function formatFont(item: ReturnType<typeof DesignEntities.listFonts>[number]) {
  return `${item.id} — ${item.family}${item.category ? ` (${item.category})` : ""}`
}

function formatPalette(item: ReturnType<typeof DesignEntities.listPalettes>[number]) {
  const roles = Object.keys(item.swatches).slice(0, 6).join(", ")
  return `${item.id} — ${item.name}${roles ? ` [${roles}]` : ""}`
}

function formatBrand(snapshot: NonNullable<ReturnType<typeof ProjectBrand.getResolved>>) {
  const heading = snapshot.fonts.find((f) => f.id === snapshot.headingFontId)?.family
  const body = snapshot.fonts.find((f) => f.id === snapshot.bodyFontId)?.family
  const mono = snapshot.fonts.find((f) => f.id === snapshot.monoFontId)?.family
  const primary = snapshot.palettes.find((p) => p.id === snapshot.primaryPaletteId)

  const lines = [
    `${snapshot.name} (${snapshot.id})`,
    snapshot.description ? `Description: ${snapshot.description}` : undefined,
    snapshot.logoPath ? `Logo: ${snapshot.logoPath}` : undefined,
    `Primary palette: ${primary?.name ?? snapshot.primaryPaletteId ?? "none"}`,
    `Fonts: heading=${heading ?? "none"}, body=${body ?? "none"}, mono=${mono ?? "none"}`,
    `Icon library: ${snapshot.iconLibrary} (${snapshot.icons.length} enabled)`,
  ].filter(Boolean)

  if (snapshot.semantics?.voice) lines.push(`Voice: ${snapshot.semantics.voice.slice(0, 200)}${snapshot.semantics.voice.length > 200 ? "…" : ""}`)
  if (snapshot.semantics?.adjectives?.length) lines.push(`Adjectives: ${snapshot.semantics.adjectives.join(", ")}`)
  if (snapshot.semantics?.tone?.length) lines.push(`Tone: ${snapshot.semantics.tone.join(", ")}`)
  if (snapshot.semantics?.mood?.length) lines.push(`Mood: ${snapshot.semantics.mood.join(", ")}`)
  if (snapshot.semantics?.audience?.length) lines.push(`Audience: ${snapshot.semantics.audience.join(", ")}`)
  if (snapshot.semantics?.avoid?.length) lines.push(`Avoid: ${snapshot.semantics.avoid.join(", ")}`)
  if (primary?.swatches) {
    lines.push(`Palette swatches: ${Object.entries(primary.swatches).map(([r, c]) => `${r}=${c}`).join(", ")}`)
  }

  lines.push(`Resolved: ${snapshot.resolvedAt}`)
  return lines.join("\n")
}

function materializeFontFamily(family: string) {
  const curated = searchCuratedFonts(family, 1)[0]
  return DesignEntities.materializeFont({
    family,
    category: curated?.category,
    variants: curated ? [...curated.variants] : ["regular"],
    catalogRef: curated ? `google-fonts:${curated.family}` : undefined,
  })
}

export const DesignTool = Tool.define<typeof params, Record<string, any>>("design", {
  description: [
    "Manage project design primitives and brand stored as Trellis entities: Icon, Font, ColorPalette, Brand.",
    "",
    "For questions about project feel, tone, palette, fonts, or icons — call **get_brand** first.",
    "Prefer **list_*** actions for project-enabled inventory before picking individual primitives.",
    "Use **search_catalog_icons** only when the user explicitly asks to find/add icons outside the project set.",
    "",
    "**get_brand** — Resolved project brand snapshot (semantics + linked palettes/fonts/icons).",
    "**refresh_brand** — Rebuild and persist the brand snapshot after primitive changes.",
    "**update_brand** — Set name, logo path, font families, palette link, icons, or voice/adjectives.",
    "**update_palette** — Replace swatches on a project palette (by paletteId or name).",
    "**set_brand_overrides** / **update_brand_semantics** — Layer project-specific brand adjustments.",
    "**apply_brand_template** — Materialize a cloud or built-in brand template into the project.",
    "**list_icons** / **list_fonts** / **list_palettes** — Project-enabled design inventory.",
    "**materialize_icon** / **materialize_font** / **create_palette** — Add a primitive to the project.",
    "**search_catalog_icons** — Search reference Lucide/custom catalogs.",
    "**seed_defaults** — Ensure default icons, fonts, palettes, and brand exist.",
  ].join("\n"),
  parameters: params,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "edit",
      patterns: [".trellis/*"],
      always: [".trellis/*"],
      metadata: { action: input.action },
    })

    if (input.action === "seed_defaults") {
      const result = DesignSeed.ensure()
      return {
        title: "Design seed",
        output: `Seeded ${result.icons} icons, ${result.fonts} fonts, ${result.palettes} palettes, ${result.brand} brand.`,
        metadata: result,
      }
    }

    if (input.action === "get_brand") {
      const snapshot = ProjectBrand.getResolved()
      if (!snapshot) {
        return {
          title: "Brand",
          output: "No project brand configured yet. Call seed_defaults first.",
          metadata: {},
        }
      }
      return {
        title: snapshot.name,
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "refresh_brand") {
      const snapshot = ProjectBrand.refreshSnapshot()
      if (!snapshot) {
        return { title: "Brand", output: "Failed to refresh brand snapshot.", metadata: {} }
      }
      return {
        title: "Brand refreshed",
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "set_brand_overrides") {
      ProjectBrand.setConfig({ overrides: input.overrides })
      const snapshot = ProjectBrand.refreshSnapshot()
      if (!snapshot) return { title: "Brand", output: "Failed to apply overrides.", metadata: {} }
      return {
        title: "Brand overrides applied",
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "update_brand_semantics") {
      const config = ProjectBrand.getConfig()
      const brandId = config?.localBrandId
      if (!brandId) {
        return { title: "Brand", output: "No active local brand. Call seed_defaults first.", metadata: {} }
      }
      const existing = ProjectBrand.getResolved()
      const semantics = existing?.semantics ? { ...existing.semantics, ...input.semantics } : input.semantics
      ProjectBrand.updateBrand(brandId, { semantics })
      const snapshot = ProjectBrand.refreshSnapshot()
      if (!snapshot) return { title: "Brand", output: "Failed to update semantics.", metadata: {} }
      return {
        title: "Brand semantics updated",
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "update_brand") {
      const config = ProjectBrand.getConfig()
      const brandId = config?.localBrandId
      if (!brandId) {
        return { title: "Brand", output: "No active local brand. Call seed_defaults first.", metadata: {} }
      }
      const current = ProjectBrand.getResolved()
      if (!current) {
        return { title: "Brand", output: "No resolved brand. Call seed_defaults first.", metadata: {} }
      }

      const patch: Parameters<typeof ProjectBrand.updateBrand>[1] = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.logoPath !== undefined) patch.logoPath = input.logoPath
      if (input.primaryPaletteId !== undefined) patch.primaryPaletteId = input.primaryPaletteId
      if (input.enabledIconIds !== undefined) patch.enabledIconIds = input.enabledIconIds

      const fontIds = new Set(current.fontIds)
      if (input.headingFontFamily) {
        const font = materializeFontFamily(input.headingFontFamily)
        if (!font) return { title: "Brand", output: "Failed to materialize heading font.", metadata: {} }
        fontIds.add(font.id)
        patch.headingFontId = font.id
      }
      if (input.bodyFontFamily) {
        const font = materializeFontFamily(input.bodyFontFamily)
        if (!font) return { title: "Brand", output: "Failed to materialize body font.", metadata: {} }
        fontIds.add(font.id)
        patch.bodyFontId = font.id
      }
      if (input.monoFontFamily) {
        const font = materializeFontFamily(input.monoFontFamily)
        if (!font) return { title: "Brand", output: "Failed to materialize mono font.", metadata: {} }
        fontIds.add(font.id)
        patch.monoFontId = font.id
      }
      if (fontIds.size) patch.fontIds = [...fontIds]

      if (input.semantics) {
        patch.semantics = current.semantics ? { ...current.semantics, ...input.semantics } : input.semantics
      }

      ProjectBrand.updateBrand(brandId, patch)
      const snapshot = ProjectBrand.refreshSnapshot()
      if (!snapshot) return { title: "Brand", output: "Failed to update brand.", metadata: {} }
      return {
        title: "Brand updated",
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "update_palette") {
      const palette =
        (input.paletteId ? DesignEntities.listPalettes({ limit: 500 }).find((p) => p.id === input.paletteId) : undefined) ??
        (input.name ? DesignEntities.findPaletteByName(input.name) : undefined)
      if (!palette) {
        return {
          title: "Palette",
          output: "Palette not found. Provide paletteId or name from list_palettes.",
          metadata: {},
        }
      }
      const updated = DesignEntities.updatePalette(palette.id, { swatches: input.swatches })
      if (!updated) return { title: "Palette", output: "Failed to update palette.", metadata: {} }
      const snapshot = ProjectBrand.refreshSnapshot()
      return {
        title: updated.name,
        output: [
          `Updated palette ${updated.id}`,
          `Swatches: ${Object.entries(updated.swatches).map(([r, c]) => `${r}=${c}`).join(", ")}`,
          snapshot ? `\n${formatBrand(snapshot)}` : "",
        ].join("\n"),
        metadata: { palette: updated, brand: snapshot },
      }
    }

    if (input.action === "apply_brand_template") {
      const template =
        input.template ??
        (input.templateId ? findBrandTemplatePreset(input.templateId) : undefined)
      if (!template) {
        return {
          title: "Brand",
          output: "Provide templateId (built-in preset) or an inline template payload.",
          metadata: {},
        }
      }
      const snapshot = ProjectBrand.applyCloudTemplate(template as CloudBrandTemplate)
      if (!snapshot) {
        return { title: "Brand", output: "Failed to apply brand template.", metadata: {} }
      }
      void Trellis.record({
        tool: "design.apply_brand_template",
        sessionID: ctx.sessionID,
        args: { templateId: template.id, version: template.version },
        output: snapshot.id,
        agent: ctx.agent,
      }).catch(() => undefined)
      return {
        title: `Applied ${template.name}`,
        output: formatBrand(snapshot),
        metadata: snapshot,
      }
    }

    if (input.action === "list_icons") {
      const items = DesignEntities.listIcons({ query: input.query, limit: input.limit ?? 80 })
      if (!items.length) {
        return { title: "Icons", output: "No project icons enabled yet. Call seed_defaults or materialize_icon.", metadata: { count: 0 } }
      }
      return {
        title: `${items.length} project icons`,
        output: items.map(formatIcon).join("\n"),
        metadata: { count: items.length, items },
      }
    }

    if (input.action === "list_fonts") {
      const items = DesignEntities.listFonts({ query: input.query, limit: input.limit ?? 80 })
      if (!items.length) {
        return { title: "Fonts", output: "No project fonts enabled yet. Call seed_defaults or materialize_font.", metadata: { count: 0 } }
      }
      return {
        title: `${items.length} project fonts`,
        output: items.map(formatFont).join("\n"),
        metadata: { count: items.length, items },
      }
    }

    if (input.action === "list_palettes") {
      const items = DesignEntities.listPalettes({ query: input.query, limit: input.limit ?? 80 })
      if (!items.length) {
        return { title: "Palettes", output: "No project palettes yet. Call seed_defaults or create_palette.", metadata: { count: 0 } }
      }
      return {
        title: `${items.length} project palettes`,
        output: items.map(formatPalette).join("\n"),
        metadata: { count: items.length, items },
      }
    }

    if (input.action === "search_catalog_icons") {
      const items = searchCatalogIcons(input.query, input.library ?? "all", input.limit ?? 40)
      if (!items.length) {
        return { title: "Catalog", output: `No catalog icons matched "${input.query}".`, metadata: { count: 0 } }
      }
      const lines = items.map((icon) => `${icon.library}:${icon.key}${icon.category ? ` (${icon.category})` : ""}`)
      return {
        title: `${items.length} catalog matches`,
        output: lines.join("\n"),
        metadata: { count: items.length, items },
      }
    }

    if (input.action === "materialize_icon") {
      const item = DesignEntities.materializeIcon({ key: input.key, library: input.library })
      if (!item) return { title: "Icon", output: "Failed to materialize icon.", metadata: {} }
      void Trellis.record({
        tool: "design.materialize_icon",
        sessionID: ctx.sessionID,
        args: { key: item.key, library: item.library },
        output: item.id,
        agent: ctx.agent,
      }).catch(() => undefined)
      const snapshot = ProjectBrand.refreshSnapshot()
      return {
        title: item.id,
        output: `Enabled project icon ${item.library}:${item.key} (${item.id})${snapshot ? `\n${formatBrand(snapshot)}` : ""}`,
        metadata: { icon: item, brand: snapshot },
      }
    }

    if (input.action === "materialize_font") {
      const item = materializeFontFamily(input.family)
      if (!item) return { title: "Font", output: "Failed to materialize font.", metadata: {} }
      void Trellis.record({
        tool: "design.materialize_font",
        sessionID: ctx.sessionID,
        args: { family: item.family },
        output: item.id,
        agent: ctx.agent,
      }).catch(() => undefined)
      const snapshot = ProjectBrand.refreshSnapshot()
      return {
        title: item.id,
        output: `Enabled project font ${item.family} (${item.id})${snapshot ? `\n${formatBrand(snapshot)}` : ""}`,
        metadata: { font: item, brand: snapshot },
      }
    }

    const item = DesignEntities.createPalette({
      name: input.name,
      description: input.description,
      swatches: input.swatches,
      tags: input.tags,
    })
    if (!item) return { title: "Palette", output: "Failed to create palette.", metadata: {} }
    void Trellis.record({
      tool: "design.create_palette",
      sessionID: ctx.sessionID,
      args: { name: item.name },
      output: item.id,
      agent: ctx.agent,
    }).catch(() => undefined)
    const snapshot = ProjectBrand.refreshSnapshot()
    return {
      title: item.id,
      output: `Created palette ${item.name} (${item.id})${snapshot ? `\n${formatBrand(snapshot)}` : ""}`,
      metadata: { palette: item, brand: snapshot },
    }
  },
})

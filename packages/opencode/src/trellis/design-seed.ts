import { readFileSync } from "node:fs"
import path from "node:path"
import { DesignEntities } from "./design-entities"
import { ProjectBrand } from "./project-brand"
import { Trellis } from "./index"

const DEFAULT_LUCIDE_ICONS = [
  "heart",
  "star",
  "home",
  "user",
  "settings",
  "search",
  "mail",
  "phone",
  "calendar",
  "clock",
  "check",
  "x",
  "plus",
  "minus",
  "arrow-right",
  "arrow-left",
  "chevron-down",
  "menu",
  "image",
  "file",
  "folder",
  "link",
  "globe",
  "sun",
  "moon",
  "cloud",
  "zap",
  "bell",
  "bookmark",
  "tag",
  "palette",
  "type",
  "layers",
  "sparkles",
  "circle-alert",
  "info",
  "lock",
  "unlock",
  "trash-2",
  "pencil",
] as const

const DEFAULT_FONTS = [
  { family: "Inter", category: "sans-serif", variants: ["regular", "500", "600", "700"], catalogRef: "google-fonts:Inter" },
  { family: "Roboto", category: "sans-serif", variants: ["regular", "500", "700"], catalogRef: "google-fonts:Roboto" },
  { family: "Open Sans", category: "sans-serif", variants: ["regular", "600", "700"], catalogRef: "google-fonts:Open Sans" },
  { family: "Lora", category: "serif", variants: ["regular", "600", "700"], catalogRef: "google-fonts:Lora" },
  { family: "JetBrains Mono", category: "monospace", variants: ["regular", "500", "700"], catalogRef: "google-fonts:JetBrains Mono" },
  { family: "system-ui", category: "sans-serif", variants: ["regular"], tags: ["system", "native"] },
] as const

const DEFAULT_PALETTES = [
  {
    name: "Neutral",
    description: "Balanced neutral palette for product UI",
    swatches: {
      primary: "#18181b",
      secondary: "#52525b",
      accent: "#2563eb",
      surface: "#fafafa",
      background: "#ffffff",
      border: "#e4e4e7",
      success: "#16a34a",
      warning: "#f59e0b",
      danger: "#dc2626",
    },
    tags: ["neutral", "default"],
  },
  {
    name: "Warm Studio",
    description: "Warm editorial palette for creative projects",
    swatches: {
      primary: "#7c2d12",
      secondary: "#a16207",
      accent: "#ea580c",
      surface: "#fff7ed",
      background: "#fffbeb",
      border: "#fed7aa",
      success: "#15803d",
      warning: "#ca8a04",
      danger: "#b91c1c",
    },
    tags: ["warm", "editorial"],
  },
] as const

type CatalogIcon = {
  key: string
  library: "lucide" | "custom"
  category?: string
  tags?: string[]
}

type CatalogFile = {
  icons: CatalogIcon[]
}

let lucideCatalogCache: CatalogFile | undefined
let customCatalogCache: CatalogFile | undefined

function loadCatalog(name: "lucide-catalog" | "custom-catalog"): CatalogFile {
  if (name === "lucide-catalog") {
    if (!lucideCatalogCache) {
      const file = path.join(import.meta.dir, "../design/catalog/lucide-catalog.json")
      lucideCatalogCache = JSON.parse(readFileSync(file, "utf-8")) as CatalogFile
    }
    return lucideCatalogCache
  }
  if (!customCatalogCache) {
    const file = path.join(import.meta.dir, "../design/catalog/custom-catalog.json")
    customCatalogCache = JSON.parse(readFileSync(file, "utf-8")) as CatalogFile
  }
  return customCatalogCache
}

function catalogEntry(key: string, library: "lucide" | "custom") {
  const catalog = library === "custom" ? loadCatalog("custom-catalog") : loadCatalog("lucide-catalog")
  return catalog.icons.find((icon) => icon.key === key && icon.library === library)
}

export namespace DesignSeed {
  export function ensure(dir?: string) {
    if (!Trellis.storeStats(dir)) return { icons: 0, fonts: 0, palettes: 0, brand: 0 }

    let icons = 0
    let fonts = 0
    let palettes = 0

    if (DesignEntities.listIcons({ limit: 1 }, dir).length === 0) {
      for (const key of DEFAULT_LUCIDE_ICONS) {
        const entry = catalogEntry(key, "lucide")
        if (
          DesignEntities.materializeIcon(
            {
              key,
              library: "lucide",
              category: entry?.category,
              tags: entry?.tags,
              catalogRef: `lucide:${key}`,
            },
            dir,
          )
        ) {
          icons++
        }
      }
    }

    if (DesignEntities.listFonts({ limit: 1 }, dir).length === 0) {
      for (const font of DEFAULT_FONTS) {
        if (
          DesignEntities.materializeFont(
            {
              family: font.family,
              category: font.category,
              variants: [...font.variants],
              tags: "tags" in font ? [...font.tags] : undefined,
              catalogRef: "catalogRef" in font ? font.catalogRef : undefined,
            },
            dir,
          )
        ) {
          fonts++
        }
      }
    }

    if (DesignEntities.listPalettes({ limit: 1 }, dir).length === 0) {
      for (const palette of DEFAULT_PALETTES) {
        if (
          DesignEntities.createPalette(
            {
              name: palette.name,
              description: palette.description,
              swatches: { ...palette.swatches },
              tags: [...palette.tags],
            },
            dir,
          )
        ) {
          palettes++
        }
      }
    }

    let brand = 0
    if (ProjectBrand.listBrands(dir).length === 0) {
      const neutral = DesignEntities.findPaletteByName("Neutral", dir)
      const warm = DesignEntities.findPaletteByName("Warm Studio", dir)
      const inter = DesignEntities.findFontByFamily("Inter", dir)
      const mono = DesignEntities.findFontByFamily("JetBrains Mono", dir)
      const icons = DesignEntities.listIcons({ limit: 500 }, dir)
      const paletteIds = [neutral?.id, warm?.id].filter((id): id is string => !!id)
      const fontIds = DesignEntities.listFonts({ limit: 20 }, dir).map((font) => font.id)

      const created = ProjectBrand.createBrand(
        {
          name: "Project Brand",
          description: "Default project design direction for agents and UI.",
          paletteIds,
          primaryPaletteId: neutral?.id,
          fontIds,
          headingFontId: inter?.id,
          bodyFontId: inter?.id,
          monoFontId: mono?.id,
          iconLibrary: "lucide",
          enabledIconIds: icons.map((icon) => icon.id),
          semantics: {
            tone: ["clear", "professional"],
            mood: ["focused"],
            audience: ["builders"],
          },
        },
        dir,
      )

      if (created) {
        ProjectBrand.setConfig({ localBrandId: created.id }, dir)
        ProjectBrand.refreshSnapshot(dir)
        brand = 1
      }
    }

    return { icons, fonts, palettes, brand }
  }
}

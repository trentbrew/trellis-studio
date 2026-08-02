import { readFileSync } from "node:fs"
import path from "node:path"

export type CatalogIcon = {
  key: string
  library: "lucide" | "custom" | "brand"
  tags: string[]
  category?: string
}

type CatalogFile = {
  icons: CatalogIcon[]
}

let lucide: CatalogFile | undefined
let custom: CatalogFile | undefined

function load(name: "lucide-catalog" | "custom-catalog") {
  const file = path.join(import.meta.dir, "catalog", `${name}.json`)
  return JSON.parse(readFileSync(file, "utf-8")) as CatalogFile
}

export function lucideCatalog() {
  lucide ??= load("lucide-catalog")
  return lucide
}

export function customCatalog() {
  custom ??= load("custom-catalog")
  return custom
}

export function searchCatalogIcons(query: string, library: "lucide" | "custom" | "all" = "all", limit = 40) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const pool =
    library === "lucide"
      ? lucideCatalog().icons
      : library === "custom"
        ? customCatalog().icons
        : [...lucideCatalog().icons, ...customCatalog().icons]

  const matches: CatalogIcon[] = []
  for (const icon of pool) {
    const haystack = [icon.key, icon.category ?? "", ...icon.tags].join(" ").toLowerCase()
    if (haystack.includes(q)) {
      matches.push(icon)
      if (matches.length >= limit) break
    }
  }
  return matches
}

export const CURATED_FONTS = [
  { family: "Inter", category: "sans-serif", variants: ["regular", "500", "600", "700"] },
  { family: "Roboto", category: "sans-serif", variants: ["regular", "500", "700"] },
  { family: "Open Sans", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Montserrat", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Poppins", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "Lora", category: "serif", variants: ["regular", "600", "700"] },
  { family: "Merriweather", category: "serif", variants: ["regular", "700"] },
  { family: "Playfair Display", category: "serif", variants: ["regular", "700"] },
  { family: "JetBrains Mono", category: "monospace", variants: ["regular", "500", "700"] },
  { family: "Fira Code", category: "monospace", variants: ["regular", "500", "700"] },
  { family: "Space Grotesk", category: "sans-serif", variants: ["regular", "600", "700"] },
  { family: "DM Sans", category: "sans-serif", variants: ["regular", "500", "700"] },
] as const

export function searchCuratedFonts(query: string, limit = 20) {
  const q = query.trim().toLowerCase()
  if (!q) return CURATED_FONTS.slice(0, limit)
  return CURATED_FONTS.filter((font) => [font.family, font.category].join(" ").toLowerCase().includes(q)).slice(0, limit)
}

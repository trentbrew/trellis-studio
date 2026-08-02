import customCatalog from "./catalog/custom-catalog.json"
import lucideCatalog from "./catalog/lucide-catalog.json"
import { formatIconKey, type IconLibrary } from "./icon-key"

export type IconCatalogEntry = {
  key: string
  library: IconLibrary
  tags: string[]
  category?: string
}

export type IconCatalogCategory = {
  name: string
  icons: IconCatalogEntry[]
}

export type IconCatalog = {
  icons: IconCatalogEntry[]
  categories: IconCatalogCategory[]
  totalCount: number
}

export const LUCIDE_ICON_CATALOG = lucideCatalog as IconCatalog
export const CUSTOM_ICON_CATALOG = customCatalog as IconCatalog

export function catalogStorageValue(entry: IconCatalogEntry): string {
  return formatIconKey(entry.library, entry.key)
}

function entryHaystack(entry: IconCatalogEntry): string {
  return [entry.key, entry.category ?? "", ...entry.tags].join(" ").toLowerCase()
}

export function searchIconCatalog(catalog: IconCatalog, query: string, limit = 400): IconCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return catalog.icons
  const matches: IconCatalogEntry[] = []
  for (const icon of catalog.icons) {
    if (entryHaystack(icon).includes(q)) {
      matches.push(icon)
      if (matches.length >= limit) break
    }
  }
  return matches
}

export function lucideCategoryNames(): string[] {
  return LUCIDE_ICON_CATALOG.categories.map((category) => category.name)
}

export function lucideIconsForCategory(name: string): IconCatalogEntry[] {
  return LUCIDE_ICON_CATALOG.categories.find((category) => category.name === name)?.icons ?? []
}

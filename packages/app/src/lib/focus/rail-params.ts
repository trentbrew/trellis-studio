import { getFilename } from "@opencode-ai/util/path"
import { getProjection } from "@/lib/projections"
import type { TopTab } from "@/pages/session/helpers"

export type RailSearchParams = Record<string, string | string[] | undefined>

export function searchParamOne(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined
  return value || undefined
}

export function patchSearchParams(
  current: RailSearchParams,
  patch: Record<string, string | undefined | null>,
): RailSearchParams | null {
  const next: RailSearchParams = { ...current }
  let changed = false
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") {
      if (key in next && next[key] !== undefined) {
        delete next[key]
        changed = true
      }
      continue
    }
    if (next[key] !== value) {
      next[key] = value
      changed = true
    }
  }
  return changed ? next : null
}

const SECTION_LABELS: Record<string, string> = {
  brand: "Brand",
  icons: "Icons",
  colors: "Colors",
  type: "Type",
  tokens: "Tokens",
  components: "Components",
  assets: "Images",
  videos: "Videos",
  documents: "Documents",
  links: "Links",
  audio: "Audio",
  models: "3D models",
  sprites: "Sprite sheets",
}

function humanize(slug: string) {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function sectionLabel(section: string) {
  return SECTION_LABELS[section] ?? humanize(section)
}

function assetSectionFromProjection(lens: string): string | undefined {
  const def = getProjection(lens)
  if (!def || def.query.kind !== "assets") return undefined
  const cats = def.query.category ?? []
  if (cats.includes("audio")) return "audio"
  if (cats.includes("links")) return "links"
  if (cats.includes("video")) return "videos"
  if (cats.includes("document")) return "documents"
  if (cats.includes("model3d") || cats.includes("texture")) return "models"
  if (cats.includes("sprites") || cats.includes("sprite") || cats.includes("spritesheet")) return "sprites"
  return "assets"
}

export type ParsedRailRoute = {
  surface: "cms" | "assets" | "design" | "projection" | "graph" | "plan" | "preview" | "review" | "shell"
  routeSlug: string
  routeLabel: string
  itemSlug?: string
  itemLabel?: string
  payload: Record<string, unknown>
}

export function parseRailRoute(routeTab: TopTab, params: RailSearchParams): ParsedRailRoute | null {
  const lens = searchParamOne(params.lens)
  const section = searchParamOne(params.section)
  const asset = searchParamOne(params.asset)
  const cmsCollection = searchParamOne(params.cmsCollection)
  const cmsEntry = searchParamOne(params.cmsEntry)

  if (routeTab === "cms" || (routeTab === "projection" && lens && getProjection(lens)?.query.kind === "cms")) {
    const collection = cmsCollection ?? (cmsEntry?.includes(":") ? cmsEntry.slice(0, cmsEntry.indexOf(":")) : undefined)
    const routeSlug = collection ?? "cms"
    const routeLabel = collection ? humanize(collection) : "CMS"
    const itemSlug = cmsEntry
    const itemLabel = itemSlug ? (itemSlug.includes(":") ? itemSlug.slice(itemSlug.indexOf(":") + 1) : itemSlug) : undefined
    return {
      surface: "cms",
      routeSlug,
      routeLabel,
      itemSlug,
      itemLabel,
      payload: {
        view: routeTab,
        ...(lens ? { lens } : {}),
        ...(collection ? { collection } : {}),
        ...(itemSlug ? { entry: itemSlug } : {}),
      },
    }
  }

  if (routeTab === "assets" || routeTab === "design" || (routeTab === "projection" && lens && getProjection(lens)?.query.kind === "assets")) {
    const projection = lens ? getProjection(lens) : undefined
    const routeSlug = section ?? (lens ? assetSectionFromProjection(lens) : undefined) ?? (routeTab === "design" ? "brand" : "assets")
    const surface = routeTab === "design" ? "design" : "assets"
    const rootLabel = projection?.label ?? (surface === "design" ? "Design" : "Assets")
    const routeLabel = sectionLabel(routeSlug)
    const itemSlug = asset
    const itemLabel = itemSlug ? getFilename(itemSlug) : undefined
    return {
      surface,
      routeSlug,
      routeLabel: projection ? `${projection.label}` : routeLabel,
      itemSlug,
      itemLabel,
      payload: {
        view: routeTab,
        section: routeSlug,
        ...(lens ? { lens } : {}),
        ...(itemSlug ? { asset: itemSlug } : {}),
      },
    }
  }

  if (routeTab === "projection" && lens) {
    const def = getProjection(lens)
    return {
      surface: "projection",
      routeSlug: lens,
      routeLabel: def?.label ?? humanize(lens),
      payload: { view: routeTab, lens },
    }
  }

  const generic: Partial<Record<TopTab, { surface: ParsedRailRoute["surface"]; label: string; slug: string }>> = {
    graph: { surface: "graph", label: "Graph", slug: "graph" },
    plan: { surface: "plan", label: "Plan", slug: "plan" },
    preview: { surface: "preview", label: "Preview", slug: "preview" },
    browser: { surface: "preview", label: "Browser", slug: "browser" },
    review: { surface: "review", label: "Review", slug: "review" },
    logs: { surface: "shell", label: "Logs", slug: "logs" },
    code: { surface: "shell", label: "Editor", slug: "code" },
    home: { surface: "shell", label: "Home", slug: "home" },
  }

  const mapped = generic[routeTab]
  if (!mapped) return null
  return {
    surface: mapped.surface,
    routeSlug: mapped.slug,
    routeLabel: mapped.label,
    payload: { view: routeTab },
  }
}

export function railFocusLabel(route: ParsedRailRoute) {
  if (route.surface === "cms") {
    return route.itemLabel
      ? `CMS · ${route.routeLabel} · ${route.itemLabel}`
      : route.routeSlug === "cms"
        ? "CMS"
        : `CMS · ${route.routeLabel}`
  }
  if (route.surface === "assets") {
    const sectionPart =
      typeof route.payload.section === "string" ? sectionLabel(route.payload.section) : route.routeLabel
    return route.itemLabel ? `Assets · ${sectionPart} · ${route.itemLabel}` : `Assets · ${sectionPart}`
  }
  if (route.surface === "design") {
    return route.itemLabel
      ? `Design · ${route.routeLabel} · ${route.itemLabel}`
      : `Design · ${route.routeLabel}`
  }
  if (route.surface === "projection") {
    return `Projection · ${route.routeLabel}`
  }
  return route.routeLabel
}

export function railFocusKey(route: ParsedRailRoute) {
  if (route.itemSlug) {
    if (route.surface === "cms") return route.itemSlug
    if (route.surface === "assets" || route.surface === "design") return `asset:${route.itemSlug}`
  }
  if (route.surface === "cms" && route.routeSlug !== "cms") return `collection:${route.routeSlug}`
  if (route.surface === "assets" || route.surface === "design") return `section:${route.routeSlug}`
  return route.routeSlug
}

export function railFocusSummary(route: ParsedRailRoute) {
  const bits: string[] = []
  if (route.itemSlug && route.surface === "cms") bits.push(route.itemSlug)
  if (route.itemSlug && (route.surface === "assets" || route.surface === "design")) bits.push(route.itemSlug)
  return bits.length > 0 ? bits.join(" · ") : undefined
}

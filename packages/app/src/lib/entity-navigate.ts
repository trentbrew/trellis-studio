import type { useFile } from "@/context/file"
import type { useLayout } from "@/context/layout"
import type { useEntityDialog } from "@/components/entity-dialog"
import { entityFromHref } from "@opencode-ai/ui/lib/entity-ref"
import { browse } from "@/lib/preview-url"
import { pushCmsNav } from "@/lib/cms-navigate"
import { resolveEntityRoute, type EntityFact, type EntityRoute } from "@/lib/entity-route"
import { entityTab, shellOpensAsTab } from "@/lib/entity-tab"
import { looksLikeFile } from "@/lib/wiki-link"

type FileApi = ReturnType<typeof useFile>
type LayoutApi = ReturnType<typeof useLayout>
type DialogApi = ReturnType<typeof useEntityDialog>

export type EntityNav = {
  navigate: (path: string) => void
  setSearchParams: (params: Record<string, string | undefined>, options?: { replace?: boolean }) => void
  searchParams: Record<string, string | string[] | undefined>
  sessionKey: string
  file?: FileApi
  layout: LayoutApi
  dialog?: DialogApi
  lookup?: (id: string) => Promise<EntityFact[] | undefined>
}

export type EntityNavOptions = {
  /** Open in dialog only — do not change session view or navigate away. */
  dialogOnly?: boolean
}

const openFile = (raw: string, nav: EntityNav) => {
  const file = nav.file
  if (!file) return
  const path = raw.startsWith("file:") ? raw.slice(5) : raw
  if (!path) return
  void (async () => {
    const resolved = await file.resolve(path)
    file.load(resolved)
    const tab = file.tab(resolved)
    const tabs = nav.layout.tabs(nav.sessionKey)
    tabs.open(tab)
    tabs.setActive(tab)
    nav.setSearchParams(params(nav, "code"))
  })()
}

const openEntityTab = (id: string, nav: EntityNav) => {
  const tab = entityTab(id)
  const tabs = nav.layout.tabs(nav.sessionKey)
  tabs.open(tab)
  tabs.setActive(tab)
  nav.setSearchParams(params(nav, "code"))
}

const params = (nav: EntityNav, view: string) =>
  ({ ...nav.searchParams, view }) as Record<string, string | undefined>

const pushDialog = (nav: EntityNav, id: string, type: string) => {
  nav.dialog?.push(id, type)
}

export function applyEntityRoute(route: EntityRoute, nav: EntityNav, opts?: EntityNavOptions) {
  const dialogOnly = opts?.dialogOnly ?? false

  if (route.kind === "trellis") {
    if (dialogOnly && nav.dialog) {
      pushDialog(nav, `issue:${route.issue}`, "issue")
      return
    }
    nav.navigate(`/trellis?issue=${encodeURIComponent(route.issue)}`)
    return
  }

  if (route.kind === "file") {
    openFile(route.path, nav)
    return
  }

  if (route.kind === "cms") {
    const collection = route.collection ?? route.entry.split(":")[0]
    nav.setSearchParams({
      ...nav.searchParams,
      view: "cms",
      cmsCollection: collection,
      cmsEntry: route.entry,
    })
    pushCmsNav({ collection: route.collection, entry: route.entry })
    return
  }

  if (route.kind === "design") {
    const assetSections = new Set(["assets", "videos", "documents", "models", "audio", "links", "sprites"])
    const view = route.section && assetSections.has(route.section) ? "assets" : "design"
    nav.setSearchParams({
      ...params(nav, view),
      section: route.section,
      asset: route.path ?? undefined,
    })
    window.dispatchEvent(
      new CustomEvent("design-navigate", {
        detail: { section: route.section, entity: route.entity, path: route.path },
      }),
    )
    return
  }

  // Document + container shells open as session tabs (not modal dialogs).
  if (shellOpensAsTab(route.type)) {
    openEntityTab(route.id, nav)
    return
  }

  pushDialog(nav, route.id, route.type)
  if (!dialogOnly) nav.setSearchParams(params(nav, "graph"))
}

export async function openEntityRef(id: string, nav: EntityNav, opts?: EntityNavOptions) {
  const ref = id.trim()
  if (!ref) return false
  const route = await resolveEntityRoute(ref, nav.lookup)
  applyEntityRoute(route, nav, { dialogOnly: true, ...opts })
  return true
}

export function handleReferenceClick(href: string, nav: EntityNav, event?: MouseEvent) {
  if (browse(href)) {
    event?.preventDefault()
    return true
  }

  const entity = entityFromHref(href)
  if (entity) {
    event?.preventDefault()
    if (looksLikeFile(entity)) {
      openFile(entity, nav)
      return true
    }
    void openEntityRef(entity, nav)
    return true
  }

  if (href.startsWith("wiki://")) {
    event?.preventDefault()
    const rest = href.slice("wiki://".length)
    const slash = rest.indexOf("/")
    const ns = slash === -1 ? rest : rest.slice(0, slash)
    const target = decodeURIComponent(slash === -1 ? "" : rest.slice(slash + 1))
    if (ns === "issue") {
      void openEntityRef(`issue:${target}`, nav)
      return true
    }
    if (ns === "entity") {
      void openEntityRef(target, nav)
      return true
    }
    if (ns === "file") {
      openFile(target, nav)
      return true
    }
    void openEntityRef(`${ns}:${target}`, nav)
    return true
  }

  return false
}

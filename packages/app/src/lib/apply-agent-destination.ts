import { browse } from "@/lib/preview-url"
import { pushCmsNav } from "@/lib/cms-navigate"
import { dispatchProjectionFocus } from "@/lib/projection-focus"
import { whiteboardProjectionParams } from "@/lib/whiteboard-navigate"
import type { AgentTurnDestination } from "@/lib/agent-turn-destinations"
import type { EntityNav } from "@/lib/entity-navigate"

export async function applyAgentTurnDestination(dest: AgentTurnDestination, nav: EntityNav) {
  if (nav.sessionKey) nav.layout.session.setFullscreen(nav.sessionKey, false)

  switch (dest.kind) {
    case "file": {
      nav.file.load(dest.path)
      const tab = nav.file.tab(dest.path)
      const tabs = nav.layout.tabs(nav.sessionKey)
      tabs.open(tab)
      tabs.setActive(tab)
      nav.setSearchParams({ ...nav.searchParams, view: "code", lens: undefined })
      return
    }
    case "whiteboard": {
      nav.setSearchParams(whiteboardProjectionParams(dest.path, nav.searchParams) as Record<string, string | undefined>)
      dispatchProjectionFocus({ lens: "whiteboards", path: dest.path })
      return
    }
    case "cms-entry": {
      if (nav.lookup) {
        const facts = await nav.lookup(dest.entry)
        if (!facts?.length) {
          const { showToast } = await import("@opencode-ai/ui/toast")
          showToast({
            variant: "error",
            title: "Entry not found",
            description: `"${dest.entry}" is not in the database. Opening the collection instead.`,
          })
          nav.setSearchParams({
            ...nav.searchParams,
            view: "cms",
            cmsCollection: dest.collection,
            cmsEntry: undefined,
            lens: undefined,
          })
          pushCmsNav({ collection: dest.collection })
          return
        }
      }
      nav.setSearchParams({
        ...nav.searchParams,
        view: "cms",
        cmsCollection: dest.collection,
        cmsEntry: dest.entry,
        lens: undefined,
      })
      pushCmsNav({ collection: dest.collection, entry: dest.entry })
      return
    }
    case "cms-collection": {
      nav.setSearchParams({
        ...nav.searchParams,
        view: "cms",
        cmsCollection: dest.collection,
        cmsEntry: undefined,
      })
      pushCmsNav({ collection: dest.collection })
      return
    }
    case "projection": {
      const next: Record<string, string | undefined> = {
        ...nav.searchParams,
        view: "projection",
        lens: dest.lens,
      }
      if (dest.lens === "whiteboards" && dest.path) {
        Object.assign(next, whiteboardProjectionParams(dest.path, nav.searchParams))
      } else {
        next.whiteboard = undefined
      }
      nav.setSearchParams(next as Record<string, string | undefined>)
      if (dest.entityId || dest.path) {
        dispatchProjectionFocus({ lens: dest.lens, entityId: dest.entityId, path: dest.path })
      }
      return
    }
    case "design": {
      const assetView =
        dest.section && ["assets", "videos", "documents", "models", "audio", "links", "sprites"].includes(dest.section)
          ? "assets"
          : "design"
      nav.setSearchParams({
        ...nav.searchParams,
        view: assetView,
        section: dest.section,
        asset: dest.path ?? undefined,
      })
      window.dispatchEvent(
        new CustomEvent("design-navigate", {
          detail: { section: dest.section, entity: dest.entityId, path: dest.path },
        }),
      )
      return
    }
    case "browser": {
      nav.setSearchParams({ ...nav.searchParams, view: "browser" })
      browse(dest.url, dest.name)
      return
    }
    case "review": {
      nav.setSearchParams({ ...nav.searchParams, view: "review" })
      return
    }
    case "view": {
      nav.setSearchParams({ ...nav.searchParams, view: dest.view })
      return
    }
  }
}

import { useNavigate, useSearchParams } from "@solidjs/router"
import { useEntityDialogOptional } from "@/components/entity-dialog"
import { useFileOptional } from "@/context/file"
import { useLayout } from "@/context/layout"
import { useTrellisOptional } from "@/context/trellis"
import { handleReferenceClick, openEntityRef, type EntityNav } from "@/lib/entity-navigate"
import { useSessionKey } from "@/pages/session/session-layout"
import { getWorkspaceKey } from "@/pages/session/helpers"
import { useParams } from "@solidjs/router"

export function useEntityLinkNav() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useParams()
  const { sessionKey } = useSessionKey()
  const workspaceKey = () => getWorkspaceKey(params.dir) || sessionKey()
  const file = useFileOptional()
  const layout = useLayout()
  const dialog = useEntityDialogOptional()
  const trellis = useTrellisOptional()

  const nav = (): EntityNav => ({
    navigate,
    setSearchParams,
    searchParams,
    sessionKey: workspaceKey(),
    file,
    layout,
    dialog,
    lookup: async (id) => {
      const entity = await trellis?.fetchEntity(id)
      return entity?.facts
    },
  })

  const onLinkClick = (href: string, event?: MouseEvent) => {
    if (handleReferenceClick(href, nav(), event)) return true
    const anchor = event?.currentTarget as HTMLAnchorElement | undefined
    if (!anchor?.classList.contains("file-link")) return false
    if (!file) return false
    event?.preventDefault()
    const path = href.replace(/^(\.\/|\/)/, "")
    if (!path) return false
    file.load(path)
    const tab = file.tab(path)
    const tabs = layout.tabs(workspaceKey())
    tabs.open(tab)
    tabs.setActive(tab)
    return true
  }

  const mentionNavigate = (attrs: { type: string; id: string }) => {
    if (attrs.type === "file") {
      if (!file) return
      const key = workspaceKey()
      void (async () => {
        const path = await file.resolve(attrs.id)
        file.load(path)
        const tab = file.tab(path)
        const tabs = layout.tabs(key)
        tabs.open(tab)
        tabs.setActive(tab)
      })()
      return
    }
    void openEntityRef(attrs.id, nav())
  }

  return { nav, onLinkClick, mentionNavigate }
}

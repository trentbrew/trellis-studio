import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import { useLayout } from "@/context/layout"
import { getSessionKey, getWorkspaceKey } from "@/pages/session/helpers"

export const useSessionKey = () => {
  const params = useParams()
  const sessionKey = createMemo(() => getSessionKey(params.dir, params.id))
  const workspaceKey = createMemo(() => getWorkspaceKey(params.dir))
  return { params, sessionKey, workspaceKey }
}

export const useSessionLayout = () => {
  const layout = useLayout()
  const { params, sessionKey, workspaceKey } = useSessionKey()
  return {
    params,
    sessionKey,
    workspaceKey,
    tabs: createMemo(() => layout.tabs(workspaceKey)),
    view: createMemo(() => layout.view(workspaceKey)),
  }
}

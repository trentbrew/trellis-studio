import type { CloudSandboxStatus } from "@/context/cloud-sandbox"

export type FileTreeDirState = {
  loaded?: boolean
  loading?: boolean
  error?: string
}

export type FileTreePanelState = "loading" | "error" | "empty" | "tree"

export function isCloudWorkspaceReady(status: CloudSandboxStatus): boolean {
  const lifecycle = status.lifecycle
  if (
    lifecycle === "provisioning" ||
    lifecycle === "resuming" ||
    lifecycle === "paused" ||
    lifecycle === "none"
  ) {
    return false
  }
  if (lifecycle === "failed") return false
  if (status.runtime === "paused" || status.runtime === "stopped") return false
  if (status.runtime === "running" && !status.studioReachable) return false
  return true
}

export function resolveFileTreePanelState(input: {
  root: FileTreeDirState | undefined
  childCount: number
  syncLoading: boolean
  serverHealthy: boolean | undefined
  cloudActive: boolean
  cloudStatus?: CloudSandboxStatus
}): FileTreePanelState {
  const root = input.root

  if (root?.error) return "error"

  const workspacePending =
    input.syncLoading ||
    input.serverHealthy !== true ||
    (input.cloudActive && input.cloudStatus && !isCloudWorkspaceReady(input.cloudStatus))

  if (root?.loading || workspacePending) return "loading"

  if (!root?.loaded) return "loading"

  if (input.childCount === 0 && workspacePending) return "loading"

  if (input.childCount === 0) return "empty"

  return "tree"
}

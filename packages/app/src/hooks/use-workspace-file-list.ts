import { createResource, type Accessor } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useWorkspaceFileCatalog } from "./use-workspace-file-catalog"

/**
 * Loads a workspace-scoped file list and refetches when the directory changes or
 * files are added, removed, or renamed (see file context catalog revision).
 */
export function useWorkspaceFileList<T>(
  loader: () => Promise<T>,
  extraDeps?: Accessor<readonly unknown[]>,
) {
  const sdk = useSDK()
  const catalog = useWorkspaceFileCatalog()
  return createResource(
    () => [sdk.directory, catalog(), ...(extraDeps?.() ?? [])] as const,
    loader,
  )
}

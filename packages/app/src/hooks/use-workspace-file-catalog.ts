import { createMemo } from "solid-js"
import { useFile } from "@/context/file"

/** Reactive generation counter for workspace file inventories (lists, sidebars). */
export function useWorkspaceFileCatalog() {
  const file = useFile()
  return createMemo(() => file.catalogRevision())
}

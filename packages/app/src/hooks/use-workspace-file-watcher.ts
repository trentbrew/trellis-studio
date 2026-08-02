import { createSignal, onCleanup, onMount } from "solid-js"
import { useSDK } from "@/context/sdk"
import {
  parseWorkspaceFileWatcherEvent,
  type WorkspaceFileWatcherKind,
} from "@/context/file/catalog"

/**
 * Local generation counter bumped on matching file.watcher.updated events.
 * Use for derived indexes (vault scans, filtered caches) that are not find.files lists.
 */
export function useWorkspaceFileWatcher(opts?: {
  match?: (path: string) => boolean
  kinds?: WorkspaceFileWatcherKind[]
}) {
  const sdk = useSDK()
  const [generation, setGeneration] = createSignal(0)
  const kinds = () => opts?.kinds ?? (["add", "unlink", "change"] as const)

  onMount(() => {
    const stop = sdk.event.listen((e) => {
      const parsed = parseWorkspaceFileWatcherEvent(e.details)
      if (!parsed) return
      if (parsed.path.startsWith(".git/")) return
      if (!kinds().includes(parsed.kind)) return
      if (opts?.match && !opts.match(parsed.path)) return
      setGeneration((value) => value + 1)
    })
    onCleanup(stop)
  })

  return generation
}

import { createEffect, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useActiveTask } from "@/context/active-task"

/**
 * Reactive bridge that observes SyncProvider state and synthesizes
 * background jobs into ActiveTaskContext.
 *
 * Tracks: session streaming (generate), directory bootstrap (sync).
 * Must be rendered inside both SyncProvider and ActiveTaskProvider.
 */
export function JobBridge() {
  const sync = useSync()
  const task = useActiveTask()
  const params = useParams()

  let generate: string | undefined
  let bootstrap: string | undefined

  // Session streaming → generate job
  createEffect(() => {
    const id = params.id
    if (!id) {
      if (generate) {
        task.removeJob(generate)
        generate = undefined
      }
      return
    }

    const status = sync.data.session_status[id]?.type ?? "idle"

    if (status !== "idle") {
      if (!generate) {
        generate = task.addJob({ type: "generate", label: "Generating...", status: "running" })
      }
    } else if (generate) {
      task.removeJob(generate)
      generate = undefined
    }
  })

  // Directory bootstrap → sync job
  createEffect(() => {
    const status = sync.data.status

    if (status === "loading" || status === "partial") {
      if (!bootstrap) {
        bootstrap = task.addJob({ type: "sync", label: "Syncing project...", status: "running" })
      }
    } else if (bootstrap) {
      task.removeJob(bootstrap)
      bootstrap = undefined
    }
  })

  onCleanup(() => {
    if (generate) task.removeJob(generate)
    if (bootstrap) task.removeJob(bootstrap)
    generate = undefined
    bootstrap = undefined
  })

  return null
}

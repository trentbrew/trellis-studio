import { retry } from "@opencode-ai/util/retry"
import { useParams } from "@solidjs/router"
import { createEffect, onCleanup, onMount } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { isSessionStatusStale, isSessionWorking } from "@/lib/session-working"

const POLL_MS = 3000

/** Reconcile session state when SSE drops updates (common in cloud iframes). */
export function useBusySessionPoll() {
  const params = useParams()
  const sdk = useSDK()
  const sync = useSync()
  const globalSDK = useGlobalSDK()

  // Pull the open session's messages + status from the server, discarding the
  // local copy. The recovery primitive for any case where live events were lost.
  const reconcile = (sessionID: string) => {
    void sync.session.sync(sessionID, { force: true })
  }

  // The event stream is live-only: on reconnect the server replays nothing, so
  // any message/status events emitted while we were disconnected are gone. The
  // server sends `server.connected` at the top of every (re)connection — resync
  // the open session each time so a response that finished during the gap shows
  // up without a manual refresh. Skip the first connect; the page already loads.
  onMount(() => {
    let first = true
    const unsub = globalSDK.event.on("global", (payload) => {
      if (payload?.type !== "server.connected") return
      if (first) {
        first = false
        return
      }
      const sessionID = params.id
      if (sessionID) reconcile(sessionID)
    })
    onCleanup(unsub)
  })

  createEffect(() => {
    const sessionID = params.id
    if (!sessionID) return

    const status = sync.data.session_status[sessionID]
    const messages = sync.data.message[sessionID] ?? []
    const working = isSessionWorking(status, messages)
    const stale = isSessionStatusStale(status, messages)
    if (!working && !stale) return

    const tick = () => {
      void retry(() => sdk.client.session.status()).then((res) => {
        const next = res.data?.[sessionID]
        if (next) sync.set("session_status", sessionID, next)
        // Server reports a terminal status, but the client still believes the
        // turn is in flight (e.g. a pending assistant whose completion event was
        // dropped). Status is no longer "busy", so isSessionStatusStale won't
        // fire — reconcile the messages directly to pull the finished turn.
        const terminal = (next?.type ?? "idle") !== "busy" && next?.type !== "retry"
        const stillWorking = isSessionWorking(sync.data.session_status[sessionID], sync.data.message[sessionID])
        if (terminal && stillWorking) reconcile(sessionID)
      })
      const currentStatus = sync.data.session_status[sessionID]
      const currentMessages = sync.data.message[sessionID]
      if (isSessionStatusStale(currentStatus, currentMessages)) {
        reconcile(sessionID)
      }
    }

    tick()
    const interval = setInterval(tick, POLL_MS)
    onCleanup(() => clearInterval(interval))
  })
}

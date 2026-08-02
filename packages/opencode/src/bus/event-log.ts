import { EventEmitter } from "events"
import { GlobalBus } from "./global"

/**
 * In-memory replay buffer for the global SSE stream.
 *
 * The event stream is otherwise live-only: a client that disconnects (proxy
 * idle-cutoff, tab backgrounding, network blip) and reconnects misses every
 * event emitted during the gap. This log assigns a monotonic id to each event,
 * keeps the last `CAP`, and lets a reconnecting stream replay everything after
 * its `Last-Event-ID`. The SDK's SSE client already tracks `id:` and resends
 * `Last-Event-ID` on reconnect, so the server side is the only missing half.
 *
 * Replay is best-effort: if a client was gone long enough that its cursor fell
 * out of the buffer window, `since` returns only what remains and the client
 * falls back to a full session resync (see use-busy-session-poll.ts).
 */
export namespace EventLog {
  export type Frame = { id: number; data: string }

  const CAP = 1000
  let seq = 0
  const buf: Frame[] = []
  const emitter = new EventEmitter()
  let started = false

  function ensure() {
    if (started) return
    started = true
    emitter.setMaxListeners(0)
    GlobalBus.on("event", (event) => {
      const frame: Frame = { id: ++seq, data: JSON.stringify(event) }
      buf.push(frame)
      if (buf.length > CAP) buf.shift()
      emitter.emit("frame", frame)
    })
  }

  /** Buffered frames with id greater than `lastId`, oldest first. */
  export function since(lastId: number): Frame[] {
    ensure()
    if (!Number.isFinite(lastId)) return []
    return buf.filter((f) => f.id > lastId)
  }

  /** Subscribe to live frames. Returns an unsubscribe function. */
  export function subscribe(cb: (frame: Frame) => void): () => void {
    ensure()
    emitter.on("frame", cb)
    return () => emitter.off("frame", cb)
  }
}

import { createStore } from "solid-js/store"
import type { TrellisGraphData } from "@/context/trellis"

type FetchFn = (opts?: {
  includeHidden?: boolean
  includeImports?: boolean
  includeLinks?: boolean
  includeOps?: boolean
}) => Promise<TrellisGraphData>

// Module-level store — no SolidJS context hooks. Any component can write to
// it; any component can read from it without needing to be in the same tree.
const [store, setStore] = createStore<{ data: TrellisGraphData | null; loading: boolean }>({
  data: null,
  loading: false,
})

export const graphPreload = store

let ctrl: AbortController | null = null
let reqId = 0

const canPreload = () => {
  if (typeof window !== "undefined" && window.innerWidth < 768) return false
  const conn = (navigator as any).connection
  if (conn?.saveData || conn?.type === "cellular") return false
  return true
}

export async function preload(fetch: FetchFn) {
  if (store.data || store.loading || !canPreload()) return
  const id = ++reqId
  if (ctrl) {
    ctrl.abort()
    ctrl = null
  }
  ctrl = new AbortController()
  setStore("loading", true)
  const data = await fetch({ includeHidden: true, includeImports: true, includeLinks: true, includeOps: true }).catch(
    () => null,
  )
  if (data && id === reqId && !ctrl.signal.aborted) setStore("data", data)
  if (id === reqId) {
    setStore("loading", false)
    ctrl = null
  }
}

export function invalidatePreload() {
  if (ctrl) {
    ctrl.abort()
    ctrl = null
  }
  setStore("data", null)
  setStore("loading", false)
}

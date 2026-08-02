// Graph layout persistence, keyed per workspace directory.
//
// We write only to localStorage — no backend round-trip — because layout is a
// view preference, not a source of truth, and losing it is harmless. Writes
// are debounced and a final flush is triggered on teardown.

const VERSION = 1
const KEY_PREFIX = "trellis.graph.layout:v1:"

export type LayoutPos = { x: number; y: number }
export type LayoutZoom = { x: number; y: number; k: number }
export type Layout = {
  v: number
  zoom?: LayoutZoom
  positions: Record<string, LayoutPos>
}

const storageKey = (dir: string) => KEY_PREFIX + dir

export function loadLayout(dir: string): Layout | undefined {
  if (typeof localStorage === "undefined") return
  try {
    const raw = localStorage.getItem(storageKey(dir))
    if (!raw) return
    const parsed = JSON.parse(raw) as Layout
    if (parsed?.v !== VERSION) return
    if (!parsed.positions || typeof parsed.positions !== "object") return
    return parsed
  } catch {
    return
  }
}

export function writeLayout(dir: string, layout: Layout) {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(storageKey(dir), JSON.stringify({ ...layout, v: VERSION }))
  } catch {
    // Quota / access errors are non-fatal — the graph still works without persistence.
  }
}

// Debounced writer. Call `save` with the latest state and only the final call
// in a quiet window actually hits storage. Call `flush` to force an immediate
// write (e.g. on unmount).
export function createLayoutSaver(dir: string, delay = 800) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Layout | undefined

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (pending) {
      writeLayout(dir, pending)
      pending = undefined
    }
  }

  const save = (layout: Layout) => {
    pending = layout
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (pending) {
        writeLayout(dir, pending)
        pending = undefined
      }
    }, delay)
  }

  return { save, flush }
}

// Extract a serializable snapshot from live d3 nodes.
export function snapshot<T extends { id: string; x?: number; y?: number }>(
  nodes: readonly T[],
  zoom: LayoutZoom | undefined,
): Layout {
  const positions: Record<string, LayoutPos> = {}
  for (const n of nodes) {
    if (typeof n.x === "number" && typeof n.y === "number" && isFinite(n.x) && isFinite(n.y)) {
      positions[n.id] = { x: n.x, y: n.y }
    }
  }
  return { v: VERSION, zoom, positions }
}

// Hydrate live nodes with persisted positions. Mutates in place.
// Returns the number of nodes that got a position from storage.
export function hydrate<T extends { id: string; x?: number; y?: number; vx?: number; vy?: number }>(
  nodes: T[],
  layout: Layout | undefined,
): number {
  if (!layout) return 0
  let hit = 0
  for (const n of nodes) {
    const pos = layout.positions[n.id]
    if (!pos) continue
    n.x = pos.x
    n.y = pos.y
    n.vx = 0
    n.vy = 0
    hit++
  }
  return hit
}

// Shared primitives for the graph renderer.
//
// The SVG path (graphs ≤ TIER.light nodes) and the Canvas2D path (larger
// graphs) both consume from this module so their visuals stay consistent.
// Only put things here that are genuinely renderer-agnostic — anything that
// reaches into d3-selection or fiddles with DOM nodes belongs in the caller.

import * as d3Force from "d3-force"
import * as d3Zoom from "d3-zoom"
import { ENTITY_ICONS, entityColor, entityIcon } from "@/lib/entity-theme"
import type { TrellisGraphEdge, TrellisGraphNode } from "@/context/trellis"
import type { Layout } from "./graph-layout"

// Node count tiers that select renderer + physics behavior.
// Easy to tune — the call sites read these constants directly.
export const TIER = {
  // ≤ light  → SVG renderer, full fidelity
  light: 800,
  // > light, ≤ heavy → Canvas2D base + SVG overlay, live physics
  // > heavy → Canvas2D base + SVG overlay, physics frozen after settle
  heavy: 15000,
} as const

/** Zoom level below which node/edge labels are hidden and not repositioned each tick. */
export const GRAPH_LABEL_MIN_ZOOM = 0.65

/** d3-force stops when alpha drops below this (library default is 0.001). Higher = snappier settle. */
export const GRAPH_SIM_ALPHA_MIN = 0.02

/** Applied to size-based alphaDecay heuristics in SVG and Canvas renderers. */
export const GRAPH_SIM_DECAY_MUL = 1.35

// Minimap canvas size (desktop) — keep the graph overlay panel aligned.
export const GRAPH_MINIMAP_W = 180
export const GRAPH_MINIMAP_W_MOBILE = 96

// Lucide default stroke; matches EntityIcon in entity-theme.tsx.
export const NODE_ICON_STROKE = 2

export type SimNode = TrellisGraphNode & {
  color?: string
  icon?: string
  fresh?: boolean
} & d3Force.SimulationNodeDatum
export type SimLink = d3Force.SimulationLinkDatum<SimNode> & {
  type: TrellisGraphEdge["type"]
}

export type GraphCallbacks = {
  onSelect: (node: SimNode) => void
  onDeselect: () => void
  getSelectedId: () => string | null
  inset?: () => number
  layout?: LayoutPersistence
  /** Fade bottom-left graph chrome when the return beacon would sit underneath it. */
  onBeaconChromeDim?: (dimmed: boolean) => void
}

export type LayoutPersistence = {
  load: () => Layout | undefined
  save: (layout: Layout) => void
  flush: () => void
}

export type RenderHandle = {
  stop: () => void
  focus: (id: string | null) => void
  fit: () => void
  recenter: (inset: number) => void
  /** Fit the node cloud when the viewport is off-screen; returns whether a flight ran. */
  goToNodesIfOffscreen: () => boolean
  setHoveredId: (id: string | null) => void
  setPhysics: (p: Physics) => void
}

// User-controllable physics multipliers. Applied on top of size-based heuristics
// in `cfg()`. 1.0 = default, <1 = tighter/weaker, >1 = looser/stronger.
export type Physics = {
  dist: number // link distance multiplier
  charge: number // node repulsion multiplier (more negative when >1)
  collide: number // collision radius multiplier
  decay: number // alpha decay multiplier (higher = settles faster)
}

export const DEFAULT_PHYSICS: Physics = { dist: 1.5, charge: 1.5, collide: 1, decay: 1 }

export function nodeColor(n: SimNode) {
  return entityColor(n.type, n.status, n.color)
}

export function nodeIcon(n: SimNode) {
  return entityIcon(n.type, n.icon)
}

export function nodeRadius(n: SimNode) {
  if (n.type === "issue") return 15
  if (n.type === "project") return 13
  if (n.type === "sprite") return 12
  if (n.type === "roadmap") return 11
  if (n.type === "epic") return 10
  if (n.type === "cycle") return 8
  if (n.type === "suggestion") return 6
  if (n.type === "directory") return 8
  if (n.type === "whiteboard") return 8
  // Ops are high-volume causal-stream dots — kept small so a cap of 100+
  // doesn't swamp the canvas visually.
  if (n.type === "op") return 4
  if (n.type === "file") {
    if (!n.size) return 6
    // log2 scale: ~1KB→6, ~10KB→9, ~100KB→12, ~1MB→15, capped at 18
    return Math.min(18, 6 + Math.max(0, Math.log2(n.size / 512)) * 1.5)
  }
  return 7
}

// Padding in world pixels used for viewport culling. Scales inversely with
// zoom so culling boundaries expand when zoomed out.
const CULL_PAD = 140

export type ViewBounds = { left: number; top: number; right: number; bottom: number }

export function bounds(t: d3Zoom.ZoomTransform, width: number, height: number): ViewBounds {
  const pad = CULL_PAD / Math.min(1, t.k)
  return {
    left: (-t.x - pad) / t.k,
    top: (-t.y - pad) / t.k,
    right: (width - t.x + pad) / t.k,
    bottom: (height - t.y + pad) / t.k,
  }
}

export function visible(n: SimNode, box: ViewBounds) {
  const x = n.x ?? 0
  const y = n.y ?? 0
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

// ---------------------------------------------------------------------------
// Pan / zoom helpers
// ---------------------------------------------------------------------------

export type ZoomState = { x: number; y: number; k: number }

/** Normalize wheel deltas to CSS pixels (consistent across deltaMode / browsers). */
export function wheelDeltaPixels(e: WheelEvent, viewportHeight: number, linePx = 16): { dx: number; dy: number } {
  let dx = e.deltaX
  let dy = e.deltaY
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    dx *= linePx
    dy *= linePx
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const page = viewportHeight > 0 ? viewportHeight : typeof window !== "undefined" ? window.innerHeight : 800
    dx *= page
    dy *= page
  }
  return { dx, dy }
}

/**
 * d3-zoom `translateBy` multiplies its args by k, so divide wheel deltas by k
 * to keep pan speed constant in screen pixels at any zoom level.
 */
export function wheelPanBy(zoomK: number, e: WheelEvent, viewportHeight: number): [number, number] {
  const { dx, dy } = wheelDeltaPixels(e, viewportHeight)
  const k = Math.max(zoomK, 1e-6)
  return [-dx / k, -dy / k]
}

export type NodeBounds = { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number }

export function nodeClusterBounds(nodes: readonly SimNode[]): NodeBounds | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const x = n.x ?? 0
    const y = n.y ?? 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

export function viewportIntersectsBounds(box: ViewBounds, b: NodeBounds, margin = 0): boolean {
  return !(
    box.right < b.minX - margin ||
    box.left > b.maxX + margin ||
    box.bottom < b.minY - margin ||
    box.top > b.maxY + margin
  )
}

export function countVisibleNodes(nodes: readonly SimNode[], box: ViewBounds): number {
  let count = 0
  for (const n of nodes) {
    if (visible(n, box)) count++
  }
  return count
}

/** Whether the viewport has drifted away from the node cloud (blank canvas). */
export function shouldShowGraphBeacon(
  nodes: readonly SimNode[],
  zoom: ZoomState,
  viewW: number,
  viewH: number,
): { show: boolean; cluster: NodeBounds | null } {
  const cluster = nodeClusterBounds(nodes)
  if (!cluster) return { show: false, cluster: null }
  const t = d3Zoom.zoomIdentity.translate(zoom.x, zoom.y).scale(zoom.k)
  const box = bounds(t, viewW, viewH)
  if (!viewportIntersectsBounds(box, cluster, 80)) return { show: true, cluster }
  if (countVisibleNodes(nodes, box) === 0) return { show: true, cluster }
  return { show: false, cluster }
}

export type BeaconPlacement = { x: number; y: number; rotationDeg: number }

/** Screen rect of the minimap + Graph options stack (bottom-left chrome). */
export function graphChromeRect(viewW: number, viewH: number, mobile: boolean) {
  const mapW = mobile ? GRAPH_MINIMAP_W_MOBILE : GRAPH_MINIMAP_W
  const mapH = mobile ? 64 : 120
  const panelBottom = 144
  const panelMaxH = mobile ? 200 : 320
  const margin = 12
  return {
    left: 0,
    top: Math.max(0, viewH - panelBottom - panelMaxH - mapH - margin),
    right: mapW + margin * 2,
    bottom: viewH,
  }
}

/** True when the beacon circle would sit under the minimap / Graph accordion. */
export function beaconOverlapsGraphChrome(
  place: BeaconPlacement,
  viewW: number,
  viewH: number,
  mobile: boolean,
  radius = 22,
): boolean {
  const chrome = graphChromeRect(viewW, viewH, mobile)
  const pad = 6
  return (
    place.x + radius >= chrome.left - pad &&
    place.x - radius <= chrome.right + pad &&
    place.y + radius >= chrome.top - pad &&
    place.y - radius <= chrome.bottom + pad
  )
}

/** Place a control on the viewport edge, pointing toward a screen-space target. */
export function beaconPlacement(viewW: number, viewH: number, targetSx: number, targetSy: number, inset = 56): BeaconPlacement {
  const cx = viewW / 2
  const cy = viewH / 2
  const dx = targetSx - cx
  const dy = targetSy - cy
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy, rotationDeg: 0 }
  const hw = Math.max(24, viewW / 2 - inset)
  const hh = Math.max(24, viewH / 2 - inset)
  const scale = Math.min(Math.abs(hw / dx), Math.abs(hh / dy))
  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
    rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  }
}

export function fitClusterTransform(
  nodes: readonly SimNode[],
  viewW: number,
  viewH: number,
  opts?: { pad?: number; minScale?: number; maxScale?: number },
): d3Zoom.ZoomTransform | null {
  const cluster = nodeClusterBounds(nodes)
  if (!cluster) return null
  const pad = opts?.pad ?? 120
  const bw = cluster.maxX - cluster.minX + pad * 2
  const bh = cluster.maxY - cluster.minY + pad * 2
  const minScale = opts?.minScale ?? 0.05
  const maxScale = opts?.maxScale ?? 2
  const scale = Math.max(minScale, Math.min(viewW / Math.max(bw, 1), viewH / Math.max(bh, 1), maxScale))
  return d3Zoom.zoomIdentity.translate(viewW / 2 - cluster.cx * scale, viewH / 2 - cluster.cy * scale).scale(scale)
}

export type GraphBeaconLayout = {
  show: boolean
  place: BeaconPlacement | null
  overlapsChrome: boolean
}

export type GraphBeaconHandle = {
  update: (opts: { viewW: number; viewH: number; zoom: ZoomState; show: boolean; cluster: NodeBounds | null }) => void
  destroy: () => void
}

export function createGraphBeacon(
  container: HTMLElement,
  onRecenter: () => void,
  opts?: { mobile?: boolean; onLayout?: (layout: GraphBeaconLayout) => void },
): GraphBeaconHandle {
  const el = container.appendChild(document.createElement("button"))
  el.type = "button"
  el.className = "graph-beacon"
  el.setAttribute("aria-label", "Return to graph nodes")
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
  el.style.cssText =
    "position:absolute;z-index:25;display:none;align-items:center;justify-content:center;" +
    "width:40px;height:40px;padding:0;border-radius:999px;border:1px solid var(--border-base);" +
    "background:color-mix(in srgb, var(--surface-raised-base) 90%, transparent);" +
    "color:var(--text-base);box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;" +
    "pointer-events:auto;opacity:0;transform:translate(-50%,-50%) scale(0.92);" +
    "transition:opacity 120ms ease-out, transform 120ms ease-out;"
  el.addEventListener("click", (e) => {
    e.stopPropagation()
    onRecenter()
  })

  let shown = false
  const mobile = opts?.mobile ?? false

  return {
    update({ viewW, viewH, zoom, show, cluster }) {
      if (!show || !cluster) {
        if (shown) {
          shown = false
          el.style.opacity = "0"
          el.style.display = "none"
        }
        opts?.onLayout?.({ show: false, place: null, overlapsChrome: false })
        return
      }
      const sx = cluster.cx * zoom.k + zoom.x
      const sy = cluster.cy * zoom.k + zoom.y
      const place = beaconPlacement(viewW, viewH, sx, sy)
      const overlapsChrome = beaconOverlapsGraphChrome(place, viewW, viewH, mobile)
      el.style.display = "flex"
      el.style.left = `${place.x}px`
      el.style.top = `${place.y}px`
      el.style.transform = `translate(-50%, -50%) rotate(${place.rotationDeg}deg) scale(1)`
      opts?.onLayout?.({ show: true, place, overlapsChrome })
      if (!shown) {
        shown = true
        requestAnimationFrame(() => {
          el.style.opacity = "1"
        })
      }
    },
    destroy() {
      el.remove()
    },
  }
}

export function visibleLink(l: d3Force.SimulationLinkDatum<SimNode>, box: ViewBounds) {
  const s = l.source as SimNode
  const t = l.target as SimNode
  const sx = s.x ?? 0
  const sy = s.y ?? 0
  const tx = t.x ?? 0
  const ty = t.y ?? 0
  return (
    Math.max(sx, tx) >= box.left &&
    Math.min(sx, tx) <= box.right &&
    Math.max(sy, ty) >= box.top &&
    Math.min(sy, ty) <= box.bottom
  )
}

// Adjacency + id lookup. `getClosure(id)` returns self + 1-hop neighbors,
// memoized on first request. Lazy so massive graphs don't eagerly allocate
// N Sets just to serve a few hover events.
export type Adjacency = {
  byId: Map<string, SimNode>
  adjacency: Map<string, Set<string>>
  getClosure: (id: string) => Set<string>
}

export function buildAdjacency(
  nodes: readonly SimNode[],
  links: readonly { source: string | SimNode; target: string | SimNode }[],
): Adjacency {
  const byId = new Map<string, SimNode>()
  for (const n of nodes) byId.set(n.id, n)
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const l of links) {
    const s = typeof l.source === "string" ? l.source : l.source.id
    const t = typeof l.target === "string" ? l.target : l.target.id
    adj.get(s)?.add(t)
    adj.get(t)?.add(s)
  }
  const closures = new Map<string, Set<string>>()
  const getClosure = (id: string): Set<string> => {
    const hit = closures.get(id)
    if (hit) return hit
    const neigh = adj.get(id) ?? new Set<string>()
    const cls = new Set<string>([id, ...neigh])
    closures.set(id, cls)
    return cls
  }
  return { byId, adjacency: adj, getClosure }
}

// Spatial grid hash over node positions. Canvas2D has no native DOM
// hit-testing so we bucket world space into cells and scan the handful of
// cells around the cursor to find the nearest node.
//
// A rebuild is O(n). Hit-tests are effectively O(k) where k is the average
// number of nodes per cell within the search radius. Cell size should be a
// small multiple of the largest expected node radius.
export class SpatialGrid {
  private cell: number
  private buckets = new Map<number, SimNode[]>()

  constructor(cell = 40) {
    this.cell = cell
  }

  private key(cx: number, cy: number) {
    // Szudzik-like pairing without negative-index pitfalls. 100003 is prime
    // and large enough to avoid collisions at reasonable graph sizes.
    return cx * 100003 + cy
  }

  rebuild(nodes: readonly SimNode[]) {
    this.buckets.clear()
    const cell = this.cell
    for (const n of nodes) {
      const cx = Math.floor((n.x ?? 0) / cell)
      const cy = Math.floor((n.y ?? 0) / cell)
      const k = this.key(cx, cy)
      const bucket = this.buckets.get(k)
      if (bucket) bucket.push(n)
      else this.buckets.set(k, [n])
    }
  }

  // Nearest node whose effective radius contains (x, y), within searchRadius
  // world pixels. Returns null if nothing is close enough.
  find(x: number, y: number, searchRadius: number, hitRadius: (n: SimNode) => number): SimNode | null {
    const cell = this.cell
    const cells = Math.max(1, Math.ceil(searchRadius / cell))
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    let best: SimNode | null = null
    let bestD2 = Infinity
    for (let dx = -cells; dx <= cells; dx++) {
      for (let dy = -cells; dy <= cells; dy++) {
        const bucket = this.buckets.get(this.key(cx + dx, cy + dy))
        if (!bucket) continue
        for (const n of bucket) {
          const px = (n.x ?? 0) - x
          const py = (n.y ?? 0) - y
          const d2 = px * px + py * py
          const r = hitRadius(n)
          if (d2 <= r * r && d2 < bestD2) {
            bestD2 = d2
            best = n
          }
        }
      }
    }
    return best
  }
}

// Pre-rasterized entity icon cache. Each (inner-svg, color, size) combo is
// drawn once to an offscreen canvas at DPR and then blit per frame via
// ctx.drawImage(). Icon paths come from ENTITY_ICONS (Lucide glyphs at
// viewBox 0 0 24 24) so we can parse the tiny inline SVG as Path2D / shapes.
export class IconCache {
  private cache = new Map<string, HTMLCanvasElement>()
  constructor(private dpr: number) {}

  entity(type: string, color: string, size: number, strokeWidth = NODE_ICON_STROKE, icon?: string): HTMLCanvasElement | null {
    const inner = icon ? entityIcon(type, icon) : (ENTITY_ICONS[type] ?? ENTITY_ICONS.entity)
    if (!inner) return null
    const key = `${type}|${icon ?? ""}|${color}|${size}|${strokeWidth}|${this.dpr}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const px = Math.max(4, Math.round(size * this.dpr))
    const c = document.createElement("canvas")
    c.width = px
    c.height = px
    const ctx = c.getContext("2d")
    if (!ctx) return null
    // ENTITY_ICONS are authored at viewBox 24×24; scale to our target size.
    const s = px / 24
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = color
    ctx.lineWidth = strokeWidth
    rasterizeIconInner(ctx, inner)
    this.cache.set(key, c)
    return c
  }

  clear() {
    this.cache.clear()
  }
}

// Parse the subset of SVG inner markup that ENTITY_ICONS emits (paths,
// circles, rects, lines — all self-closing with quoted attrs) and stroke
// each shape onto the provided 2D context.
function rasterizeIconInner(ctx: CanvasRenderingContext2D, inner: string) {
  const RE = /<(path|circle|rect|line)\b([^/>]*)\/>/g
  let m: RegExpExecArray | null
  while ((m = RE.exec(inner))) {
    const tag = m[1]
    const attrs = parseAttrs(m[2])
    if (tag === "path" && attrs.d) {
      try {
        ctx.stroke(new Path2D(attrs.d))
      } catch {
        // Path2D can throw on unsupported grammar — skip rather than crash.
      }
    } else if (tag === "circle") {
      const cx = num(attrs.cx)
      const cy = num(attrs.cy)
      const r = num(attrs.r)
      if (r > 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (tag === "rect") {
      const rx = num(attrs.x)
      const ry = num(attrs.y)
      const rw = num(attrs.width)
      const rh = num(attrs.height)
      if (rw > 0 && rh > 0) ctx.strokeRect(rx, ry, rw, rh)
    } else if (tag === "line") {
      const x1 = num(attrs.x1)
      const y1 = num(attrs.y1)
      const x2 = num(attrs.x2)
      const y2 = num(attrs.y2)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out[m[1]] = m[2]
  return out
}

function num(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Tooltip helper
// ---------------------------------------------------------------------------
//
// An HTML div floated over the graph surface. Content is populated by the
// caller (hover handler) because the SVG and Canvas renderers have access to
// the same SimNode shape.

export type TooltipHandle = {
  show: (html: string, target: { x: number; y: number; r: number }, viewBox: { w: number; h: number }) => void
  hide: () => void
  reposition: (target: { x: number; y: number; r: number }, viewBox: { w: number; h: number }) => void
  destroy: () => void
}

export function createTooltip(container: HTMLElement): TooltipHandle {
  const el = container.appendChild(document.createElement("div"))
  el.setAttribute("class", "graph-tooltip")
  el.style.cssText =
    "position:absolute;pointer-events:none;z-index:20;display:none;" +
    "padding:0;border-radius:8px;font-size:11px;line-height:1.4;" +
    "background:color-mix(in srgb, var(--surface-raised-base) 85%, transparent);" +
    "backdrop-filter:blur(4px);" +
    "border:1px solid var(--border-base);" +
    "color:var(--text-strong);box-shadow:0 6px 20px rgba(0,0,0,.35);" +
    "width:max-content;max-width:min(480px,90vw);" +
    "opacity:0;transform:translateY(2px);" +
    "transition:opacity 80ms ease-out,transform 80ms ease-out;"

  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const reposition = (target: { x: number; y: number; r: number }, viewBox: { w: number; h: number }) => {
    const tw = el.offsetWidth
    const th = el.offsetHeight
    let left = target.x - tw / 2
    let top = target.y - target.r - th - 10
    if (top < 4) top = target.y + target.r + 10
    if (left < 4) left = 4
    if (left + tw > viewBox.w - 4) left = viewBox.w - tw - 4
    el.style.left = left + "px"
    el.style.top = top + "px"
  }

  return {
    show(html, target, viewBox) {
      el.innerHTML = html
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
      el.style.display = "block"
      reposition(target, viewBox)
      requestAnimationFrame(() => {
        el.style.opacity = "1"
        el.style.transform = "translateY(0)"
      })
    },
    reposition,
    hide() {
      el.style.opacity = "0"
      el.style.transform = "translateY(4px)"
      hideTimer = setTimeout(() => {
        el.style.display = "none"
        hideTimer = null
      }, 140)
    },
    destroy() {
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
      el.remove()
    },
  }
}

// Escape a string for safe insertion as HTML text content.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

// Standard tooltip body used by both renderers — keeps them visually identical.
export function tooltipHtml(d: SimNode): string {
  const color = nodeColor(d)
  const type = escapeHtml(d.type.replace(/_/g, " "))
  const label = escapeHtml(d.label)
  const status = d.status
    ? `<div style="color:var(--text-weaker);margin-top:1px">Status: ${escapeHtml(d.status.replace(/_/g, " "))}</div>`
    : ""
  const priority = d.priority ? `<div style="color:var(--text-weaker)">Priority: ${escapeHtml(d.priority)}</div>` : ""
  return (
    `<div style="padding:10px 24px 10px 12px">` +
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">` +
    `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>` +
    `<span style="font-weight:600;text-transform:capitalize">${type}</span>` +
    `</div>` +
    `<div style="color:var(--text-weak);white-space:nowrap">${label}</div>` +
    status +
    priority +
    `</div>`
  )
}

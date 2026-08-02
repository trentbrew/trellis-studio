// Canvas2D base renderer for the entity graph.
//
// Used for graphs above TIER.light. Keeps the existing SVG element in the
// DOM as a thin overlay (focused subgraph only) so hover/selection still get
// full-fidelity icons, rings, and labels. The 99%+ of non-focused nodes are
// drawn as colored dots on a single canvas — this is what makes 10k–100k+
// nodes stay smooth at 60fps.
//
// Parity notes (things that must behave identically to the SVG path):
//   - pan/zoom gestures (wheel, ctrl/cmd+wheel, middle-click, space+drag)
//   - hover highlight + tooltip
//   - click-to-select, click-background-to-deselect
//   - drag to reposition (with layout persistence)
//   - focus(id) camera flight
//   - minimap (click/drag to pan, viewport rect, node dots)
//   - layout hydration + persistence

import * as d3Force from "d3-force"
import * as d3Select from "d3-selection"
import * as d3Zoom from "d3-zoom"
import { chooseIconName, fileIconSpriteUrl } from "@opencode-ai/ui/file-icon"
import { ENTITY_ICON_VIEWBOX } from "@/lib/entity-theme"
import {
  TIER,
  GRAPH_LABEL_MIN_ZOOM,
  GRAPH_SIM_ALPHA_MIN,
  GRAPH_SIM_DECAY_MUL,
  GRAPH_MINIMAP_W,
  GRAPH_MINIMAP_W_MOBILE,
  bounds,
  buildAdjacency,
  createGraphBeacon,
  createTooltip,
  fitClusterTransform,
  IconCache,
  NODE_ICON_STROKE,
  nodeColor,
  nodeIcon,
  nodeRadius,
  shouldShowGraphBeacon,
  SpatialGrid,
  tooltipHtml,
  visible,
  visibleLink,
  wheelPanBy,
  type GraphCallbacks,
  type Physics,
  type RenderHandle,
  type SimNode,
  type ViewBounds,
  DEFAULT_PHYSICS,
} from "./graph-shared"
import { createLayoutSaver, hydrate as hydrateLayout, loadLayout, snapshot } from "./graph-layout"

type SimLink = d3Force.SimulationLinkDatum<SimNode> & { type: string }

type CanvasLinkInput = { source: string; target: string; type: string }

export function renderCanvas(
  svgEl: SVGSVGElement,
  nodes: SimNode[],
  links: CanvasLinkInput[],
  cb: GraphCallbacks,
  physics: Physics = DEFAULT_PHYSICS,
): RenderHandle {
  const container = svgEl.parentElement
  if (!container) throw new Error("graph-canvas: svgEl must be in a container")

  const width = () => svgEl.clientWidth || container.clientWidth || 800
  const height = () => svgEl.clientHeight || container.clientHeight || 600
  const dpr = window.devicePixelRatio || 1
  const freezePhysics = nodes.length > TIER.heavy

  // Hydrate persisted positions BEFORE handing nodes to d3's force layout.
  // If most nodes are already placed, the simulation keeps them roughly in
  // the same spot and only rearranges new/missing nodes.
  const hydrated = hydrateLayout(nodes, cb.layout?.load())
  const warmStart = hydrated > 0 && hydrated >= Math.floor(nodes.length * 0.6)

  // Seed any unpositioned nodes with random positions near center so they're
  // visible immediately (prevents blank canvas while physics computes).
  const cx = width() / 2
  const cy = height() / 2
  const seedRadius = Math.min(width(), height()) * 0.3
  for (const n of nodes) {
    if (n.x == null || n.y == null || Number.isNaN(n.x) || Number.isNaN(n.y)) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * seedRadius
      n.x = cx + Math.cos(angle) * dist
      n.y = cy + Math.sin(angle) * dist
    }
  }

  // ---------------------------------------------------------------------------
  // DOM setup — canvas behind, overlay SVG on top (passive).
  // ---------------------------------------------------------------------------
  const canvas = document.createElement("canvas")
  canvas.className = "graph-canvas"
  canvas.setAttribute("tabindex", "0")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none;"
  container.insertBefore(canvas, svgEl)
  const ctx0 = canvas.getContext("2d", { alpha: true })
  if (!ctx0) throw new Error("graph-canvas: 2D context unavailable")
  const ctx: CanvasRenderingContext2D = ctx0

  // Save and neutralize the SVG so it acts as a passive overlay. We restore
  // these on teardown so the caller sees the original element.
  const savedSvgStyle = {
    pointerEvents: svgEl.style.pointerEvents,
    position: svgEl.style.position,
    inset: svgEl.style.inset,
    zIndex: svgEl.style.zIndex,
  }
  svgEl.style.pointerEvents = "none"
  svgEl.style.position = "absolute"
  svgEl.style.inset = "0"
  svgEl.style.zIndex = "2"
  canvas.style.zIndex = "1"

  const svg = d3Select.select(svgEl)
  svg.selectAll("*").remove()

  // Keyframe for edge flow animation (overlay only) — matches SVG path.
  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style")
  styleEl.textContent =
    "@keyframes edgeFlow{to{stroke-dashoffset:-16}}.edge-flow{animation:edgeFlow 0.5s linear infinite}"
  svgEl.prepend(styleEl)

  // All overlay content sits in this single group so it participates in the
  // shared zoom transform.
  const overlayG = svg.append("g")

  // Canvas sizing — handle DPR and resize.
  function resize() {
    const w = width()
    const h = height()
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"
  }
  resize()
  // Track last viewport size so we can shift the zoom transform on resize.
  // When the container grows/shrinks (e.g. side panel opens/closes), the
  // world point currently at the visible center should stay near the new
  // center instead of getting nudged to a corner. The shift is ΔW/2, ΔH/2
  // since the transform's translate is in screen pixels.
  let lastW = width()
  let lastH = height()
  const resizeObs = new ResizeObserver(() => {
    const w = width()
    const h = height()
    if ((w !== lastW || h !== lastH) && lastW > 0 && lastH > 0) {
      const dx = (w - lastW) / 2
      const dy = (h - lastH) / 2
      const next = d3Zoom.zoomIdentity.translate(zoom.x + dx, zoom.y + dy).scale(zoom.k)
      zoom = next
      d3Select.select(canvas).call(zoomBehavior.transform, next)
    }
    lastW = w
    lastH = h
    resize()
    markDirty()
    scheduleMinimap()
  })
  resizeObs.observe(container)

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const { byId, adjacency, getClosure } = buildAdjacency(nodes, links)
  const iconCache = new IconCache(dpr)

  // Cell sizing: at least 2× the largest file node (~18px radius). A cell
  // of ~40px keeps bucket populations small enough that find() stays O(1).
  const grid = new SpatialGrid(40)

  let zoom: d3Zoom.ZoomTransform = d3Zoom.zoomIdentity
  const savedLayout = cb.layout?.load()
  if (savedLayout?.zoom) {
    zoom = d3Zoom.zoomIdentity.translate(savedLayout.zoom.x, savedLayout.zoom.y).scale(savedLayout.zoom.k)
  }

  let hoveredId: string | null = null
  let drag: SimNode | null = null
  let spacePressed = false
  let rafDraw = 0
  let simulation: d3Force.Simulation<SimNode, SimLink> | undefined
  const birthIds = new Set(nodes.filter((n) => n.fresh).map((n) => n.id))
  const birthStart = Date.now()
  let birthRaf = 0

  // Hoisted up here (rather than near the draw/minimap definitions) so any
  // listener that fires during synchronous setup — e.g. a ResizeObserver
  // notification from `observe()` or a d3-zoom transform restore — can't
  // hit a Temporal Dead Zone when it touches these via closure.
  let minimapRaf = 0
  let hoverAnimRaf = 0
  let dirty = true
  let lastZoomK = 0
  let lastZoomX = 0
  let lastZoomY = 0
  let lastHoveredId: string | null = null
  let lastPrimaryId: string | null = null
  const edgeOpacityDefault = 0.18
  const ringOpacityDefault = 0.35
  const EDGE_ANIM_ZOOM = 1.0
  const HOVER_MIN_ZOOM = 0
  const ZOOM_MIN = 0.05
  const NODE_HIT_PX = 12

  // Throttled layout persistence — reuses the same debounced saver.
  const saver = cb.layout ? { save: cb.layout.save, flush: cb.layout.flush } : { save: () => {}, flush: () => {} }
  const persist = () => {
    saver.save(snapshot(nodes, { x: zoom.x, y: zoom.y, k: zoom.k }))
  }

  // ---------------------------------------------------------------------------
  // Force simulation
  // ---------------------------------------------------------------------------
  const simLinks: SimLink[] = links.map((l) => ({ source: l.source, target: l.target, type: l.type }))

  // Force parameters scale with node count — same heuristic as the SVG path.
  const size = nodes.length
  const baseDist = size > 2200 ? 45 : size > 1200 ? 60 : 90
  const baseCharge = size > 2200 ? -90 : size > 1200 ? -130 : -250
  const baseCollide = size > 2200 ? 11 : size > 1200 ? 15 : 22
  const baseDecay = (size > 2200 ? 0.09 : size > 1200 ? 0.07 : 0.05) * GRAPH_SIM_DECAY_MUL

  let activePhysics: Physics = { ...physics }
  const physDist = () => baseDist * activePhysics.dist
  const physCharge = () => baseCharge * activePhysics.charge
  const physCollide = () => baseCollide * activePhysics.collide
  const physDecay = () => baseDecay * activePhysics.decay

  simulation = d3Force
    .forceSimulation<SimNode>(nodes)
    .force(
      "link",
      d3Force
        .forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(physDist()),
    )
    .force("charge", d3Force.forceManyBody<SimNode>().strength(physCharge()))
    .force("collide", d3Force.forceCollide<SimNode>(physCollide()))
    .alphaDecay(physDecay())
    .alphaMin(GRAPH_SIM_ALPHA_MIN)

  if (!warmStart) {
    simulation.force("center", d3Force.forceCenter(width() / 2, height() / 2))
  }
  if (warmStart) simulation.alpha(0.15).alphaTarget(0)

  simulation.on("tick", () => {
    markDirty()
  })
  simulation.on("end", () => {
    grid.rebuild(nodes)
    persist()
  })

  // Massive tier: run ticks asynchronously in chunks to prevent UI freezing.
  // Yields control back to the browser every 16ms so loading indicators
  // animate and the user gets immediate visual feedback.
  if (freezePhysics) {
    const target = warmStart ? 30 : Math.min(300, Math.max(60, Math.floor(nodes.length / 120)))
    const start = simulation
    start.alpha(warmStart ? 0.15 : 1)
    start.stop() // Stop auto-ticking, we'll drive manually

    // Initial draw so graph isn't blank while computing
    // Defer to next frame so render state is ready
    requestAnimationFrame(() => {
      draw()
      paintMinimap()
    })

    let ticked = 0
    function tickChunk() {
      const chunkSize = 8 // ~8ms of work per frame @ 60fps
      for (let i = 0; i < chunkSize && ticked < target; i++) {
        start.tick()
        ticked++
      }
      if (ticked < target) {
        requestAnimationFrame(tickChunk)
      } else {
        start.stop()
        grid.rebuild(nodes)
        persist()
      }
    }
    requestAnimationFrame(tickChunk)
  } else {
    // Live physics — seed the grid immediately so hit-tests work before the
    // first tick rebuild.
    grid.rebuild(nodes)
  }

  // ---------------------------------------------------------------------------
  // Zoom / pan
  // ---------------------------------------------------------------------------
  const zoomBehavior = d3Zoom
    .zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([ZOOM_MIN, 4])
    .extent((): [[number, number], [number, number]] => [
      [0, 0],
      [width(), height()],
    ])
    .filter((event: any) => {
      // ctrl/cmd+wheel → zoom; bare wheel is our own two-finger pan handler
      if (event.type === "wheel") return event.ctrlKey || event.metaKey
      // Decline left-button mousedown if it lands on a node — our manual
      // drag handler takes over in that case.
      if (event.type === "mousedown" && event.button === 0) {
        const n = hitTestFromEvent(event as MouseEvent)
        if (n) return false
      }
      return event.button === 0 || event.button === 1
    })
    .on("zoom", (event: d3Zoom.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
      zoom = event.transform
      markDirty()
      scheduleMinimap()
      refreshBeacon()
      persist()
    })

  const canvasSel = d3Select.select(canvas)
  canvasSel.call(zoomBehavior)
  const mini = window.matchMedia("(max-width: 767px)").matches
  // NOTE: saved zoom transform restoration is deferred to the end of this
  // function — calling zoomBehavior.transform synchronously fires the
  // "zoom" listener which uses scheduleDraw + paintMinimap, both of which
  // touch closure vars declared further down. Restoring after all decls
  // are reached avoids TDZ errors.

  // Figma gestures: two-finger scroll → pan. Pinch sends ctrlKey and the
  // zoom behavior handles it.
  //
  // translateBy multiplies its args by the current k internally, so passing
  // raw pixel deltas makes pan speed scale with zoom. Divide by k so a given
  // gesture moves the same screen distance regardless of zoom level.
  canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const [dx, dy] = wheelPanBy(zoom.k, e, height())
      canvasSel.call(zoomBehavior.translateBy, dx, dy)
    },
    { passive: false },
  )

  function goToNodes() {
    const w = width()
    const h = height()
    const next = fitClusterTransform(nodes, w, h, { minScale: ZOOM_MIN, maxScale: 2 })
    if (!next) return
    canvasSel
      .transition()
      .duration(550)
      .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
      .call(zoomBehavior.transform, next)
  }

  // Middle-mouse cursor feedback
  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      canvas.style.cursor = "grabbing"
    }
  })
  canvas.addEventListener("mouseup", (e: MouseEvent) => {
    if (e.button === 1 && !spacePressed) canvas.style.cursor = "default"
  })

  // Space+drag to pan. Skip when the user is typing in an editable element so
  // Space keystrokes still reach prompt inputs, textareas, and contenteditable
  // surfaces elsewhere in the app.
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    return false
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "Space" || spacePressed) return
    if (isEditableTarget(e.target)) return
    e.preventDefault()
    spacePressed = true
    canvas.style.cursor = "grab"
    zoomBehavior.scaleExtent([zoom.k, zoom.k])
  }
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code !== "Space") return
    if (!spacePressed) return
    e.preventDefault()
    spacePressed = false
    canvas.style.cursor = "default"
    zoomBehavior.scaleExtent([ZOOM_MIN, 4])
  }
  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)

  canvas.focus()

  // ---------------------------------------------------------------------------
  // Hit testing + hover + click + drag
  // ---------------------------------------------------------------------------
  function toWorld(e: MouseEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - r.left - zoom.x) / zoom.k,
      y: (e.clientY - r.top - zoom.y) / zoom.k,
    }
  }

  function hitTestFromEvent(e: MouseEvent): SimNode | null {
    const w = toWorld(e)
    // Search radius expands when zoomed out so small dots are still grabbable.
    return grid.find(w.x, w.y, Math.max(8, NODE_HIT_PX / zoom.k), hitRadius)
  }

  function hitRadius(n: SimNode): number {
    return Math.max(nodeRadius(n), NODE_HIT_PX / zoom.k)
  }

  // Hover animation state (matches SVG parity: 1 → hoverScale on enter, back
  // to 1 on leave, even if the cursor has already left the node).
  const hoverScale = 2.1
  let hoverAnim = 1
  let hoverAnimTarget = 1
  let hoverAnimId: string | null = null
  function tickHoverAnim() {
    hoverAnimRaf = 0
    const diff = hoverAnimTarget - hoverAnim
    if (Math.abs(diff) < 0.005) {
      hoverAnim = hoverAnimTarget
      if (hoverAnimTarget === 1) hoverAnimId = null
      markDirty()
      return
    }
    hoverAnim += diff * 0.28
    markDirty()
    hoverAnimRaf = requestAnimationFrame(tickHoverAnim)
  }
  function startHoverAnim(id: string | null) {
    if (id) {
      hoverAnimId = id
      hoverAnimTarget = hoverScale
    } else {
      hoverAnimTarget = 1
    }
    if (!hoverAnimRaf) hoverAnimRaf = requestAnimationFrame(tickHoverAnim)
  }

  function nodeScale(d: SimNode): number {
    if (hoverAnimId === d.id) return hoverAnim
    return 1
  }

  const tooltip = createTooltip(container)

  function setHover(id: string | null) {
    if (hoveredId === id) return
    hoveredId = id
    if (id) {
      const n = byId.get(id)
      if (n) {
        tooltip.show(
          tooltipHtml(n),
          { x: (n.x ?? 0) * zoom.k + zoom.x, y: (n.y ?? 0) * zoom.k + zoom.y, r: nodeRadius(n) * zoom.k },
          { w: width(), h: height() },
        )
        startHoverAnim(id)
      }
    } else {
      tooltip.hide()
      startHoverAnim(null)
    }
    markDirty()
  }

  canvas.addEventListener("mousemove", throttledMouseMove)
  canvas.addEventListener("mouseleave", () => {
    if (hoveredId) setHover(null)
  })

  // Distinguish click from drag-pan: suppress click if the mouse has moved
  // more than a few pixels since mousedown.
  let mouseDownAt: { x: number; y: number } | null = null
  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return
    mouseDownAt = { x: e.clientX, y: e.clientY }
    const n = hitTestFromEvent(e)
    if (n) {
      e.preventDefault()
      e.stopPropagation()
      drag = n
      if (simulation && !freezePhysics && !(e as any).active) simulation.alphaTarget(0.3).restart()
      n.fx = n.x
      n.fy = n.y
    }
  })
  const onWindowMove = (e: MouseEvent) => {
    if (!drag) return
    const w = toWorld(e)
    drag.fx = w.x
    drag.fy = w.y
    if (freezePhysics) {
      // No simulation to tick us — snap position and redraw. Also keep the
      // node's x/y in sync so hit-tests and grid rebuild stay accurate.
      drag.x = w.x
      drag.y = w.y
    }
    markDirty()
  }
  const onWindowUp = () => {
    if (mouseDownAt) mouseDownAt = null
    if (!drag) return
    if (simulation && !freezePhysics) simulation.alphaTarget(0)
    drag.fx = null
    drag.fy = null
    grid.rebuild(nodes)
    persist()
    drag = null
  }
  window.addEventListener("mousemove", onWindowMove)
  window.addEventListener("mouseup", onWindowUp)

  canvas.addEventListener("click", (e: MouseEvent) => {
    // Ignore clicks that followed a meaningful drag of the canvas (pan).
    if (mouseDownAt) {
      const dx = e.clientX - mouseDownAt.x
      const dy = e.clientY - mouseDownAt.y
      mouseDownAt = null
      if (dx * dx + dy * dy > 9) return
    }
    const n = hitTestFromEvent(e)
    if (n) cb.onSelect(n)
    else cb.onDeselect()
  })

  // ---------------------------------------------------------------------------
  // Minimap (canvas, bottom-left) — same layout as SVG path.
  // ---------------------------------------------------------------------------
  const MAP_W = mini ? GRAPH_MINIMAP_W_MOBILE : GRAPH_MINIMAP_W
  const MAP_H = mini ? 64 : 120
  const MAP_PAD = mini ? 4 : 6
  const minimap = container.appendChild(document.createElement("canvas"))
  minimap.width = MAP_W * dpr
  minimap.height = MAP_H * dpr
  minimap.setAttribute("class", "graph-minimap")
  minimap.style.cssText =
    "position:absolute;left:12px;bottom:12px;z-index:15;" +
    `width:${MAP_W}px;height:${MAP_H}px;` +
    "background:color-mix(in srgb, var(--bg-elevated) 88%, transparent);" +
    "border:1px solid var(--border-base);border-radius:6px;" +
    "box-shadow:0 2px 10px rgba(0,0,0,.35);" +
    "cursor:pointer;transition:opacity 180ms ease-out;"
  const mctx = minimap.getContext("2d")!
  mctx.scale(dpr, dpr)

  const miniColors = new Map<string, string>()
  function miniColor(n: SimNode): string {
    const hit = miniColors.get(n.type)
    if (hit) return hit
    const c = nodeColor(n)
    miniColors.set(n.type, c)
    return c
  }

  type MBounds = { minX: number; minY: number; maxX: number; maxY: number; scale: number }
  function worldBounds(): MBounds {
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
    const w = width()
    const h = height()
    const vx0 = -zoom.x / zoom.k
    const vy0 = -zoom.y / zoom.k
    const vx1 = (w - zoom.x) / zoom.k
    const vy1 = (h - zoom.y) / zoom.k
    minX = Math.min(minX, vx0)
    minY = Math.min(minY, vy0)
    maxX = Math.max(maxX, vx1)
    maxY = Math.max(maxY, vy1)
    if (!Number.isFinite(minX)) {
      minX = 0
      minY = 0
      maxX = w
      maxY = h
    }
    const dx = maxX - minX || 1
    const dy = maxY - minY || 1
    const scale = Math.min((MAP_W - MAP_PAD * 2) / dx, (MAP_H - MAP_PAD * 2) / dy)
    return { minX, minY, maxX, maxY, scale }
  }
  function toMap(x: number, y: number, b: MBounds): [number, number] {
    return [MAP_PAD + (x - b.minX) * b.scale, MAP_PAD + (y - b.minY) * b.scale]
  }

  function scheduleMinimap() {
    paintMinimap()
  }

  function paintMinimap() {
    if (minimapRaf) return
    minimapRaf = requestAnimationFrame(() => {
      minimapRaf = 0
      mctx.clearRect(0, 0, MAP_W, MAP_H)
      const b = worldBounds()
      mctx.globalAlpha = 0.7
      const byColor = new Map<string, SimNode[]>()
      for (const n of nodes) {
        const c = miniColor(n)
        const arr = byColor.get(c)
        if (arr) arr.push(n)
        else byColor.set(c, [n])
      }
      for (const [color, arr] of byColor) {
        mctx.fillStyle = color
        for (const n of arr) {
          const [mx, my] = toMap(n.x ?? 0, n.y ?? 0, b)
          mctx.fillRect(mx - 0.75, my - 0.75, 1.5, 1.5)
        }
      }
      mctx.globalAlpha = 1
      const w = width()
      const h = height()
      const vx0 = -zoom.x / zoom.k
      const vy0 = -zoom.y / zoom.k
      const vw = w / zoom.k
      const vh = h / zoom.k
      const [rx, ry] = toMap(vx0, vy0, b)
      const rw = vw * b.scale
      const rh = vh * b.scale
      mctx.fillStyle = "rgba(0,0,0,0.45)"
      const mask = new Path2D()
      mask.rect(0, 0, MAP_W, MAP_H)
      mask.rect(rx, ry, rw, rh)
      mctx.fill(mask, "evenodd")
      mctx.strokeStyle = "rgba(255,255,255,0.9)"
      mctx.lineWidth = 1
      mctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1)
      refreshBeacon()
    })
  }

  function minimapTo(e: MouseEvent): [number, number] | null {
    const r = minimap.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    if (mx < 0 || my < 0 || mx > MAP_W || my > MAP_H) return null
    const b = worldBounds()
    return [(mx - MAP_PAD) / b.scale + b.minX, (my - MAP_PAD) / b.scale + b.minY]
  }
  function panTo(wx: number, wy: number) {
    const k = zoom.k
    const tx = width() / 2 - wx * k
    const ty = height() / 2 - wy * k
    canvasSel.call(zoomBehavior.transform, d3Zoom.zoomIdentity.translate(tx, ty).scale(k))
  }
  let minimapDragging = false
  const onMinimapDown = (e: MouseEvent) => {
    e.preventDefault()
    minimapDragging = true
    const p = minimapTo(e)
    if (p) panTo(p[0], p[1])
  }
  const onMinimapMove = (e: MouseEvent) => {
    if (!minimapDragging) return
    const p = minimapTo(e)
    if (p) panTo(p[0], p[1])
  }
  const onMinimapUp = () => {
    minimapDragging = false
  }
  minimap.addEventListener("mousedown", onMinimapDown)
  window.addEventListener("mousemove", onMinimapMove)
  window.addEventListener("mouseup", onMinimapUp)

  const beacon = createGraphBeacon(container, goToNodes, {
    mobile: mini,
    onLayout: (layout) => {
      const dim = layout.show && layout.overlapsChrome
      minimap.style.opacity = dim ? "0.12" : "1"
      minimap.style.pointerEvents = dim ? "none" : "auto"
      cb.onBeaconChromeDim?.(dim)
    },
  })
  const refreshBeacon = () => {
    const w = width()
    const h = height()
    const state = shouldShowGraphBeacon(nodes, zoom, w, h)
    beacon.update({ viewW: w, viewH: h, zoom, show: state.show, cluster: state.cluster })
  }

  function goToNodesIfOffscreen(): boolean {
    const w = width()
    const h = height()
    const state = shouldShowGraphBeacon(nodes, zoom, w, h)
    if (!state.show) return false
    goToNodes()
    return true
  }

  refreshBeacon()

  // ---------------------------------------------------------------------------
  // Draw loop with dirty checking
  // ---------------------------------------------------------------------------
  // Initialize dirty-tracking state (declarations hoisted earlier)
  dirty = true
  lastZoomK = zoom.k
  lastZoomX = zoom.x
  lastZoomY = zoom.y
  lastHoveredId = null
  lastPrimaryId = null

  function markDirty() {
    dirty = true
    scheduleDraw()
  }

  function scheduleDraw() {
    if (rafDraw) return
    rafDraw = requestAnimationFrame(() => {
      rafDraw = 0
      if (dirty) {
        draw()
        dirty = false
      }
      // Minimap uses separate RAF to avoid blocking main draw
      scheduleMinimap()
    })
  }

  // Throttled mousemove for hover - limits hit-test frequency during pan
  let mouseMoveRaf = 0
  let pendingMouseX: number | null = null
  let pendingMouseY: number | null = null

  function throttledMouseMove(e: MouseEvent) {
    if (mouseMoveRaf) return
    pendingMouseX = e.clientX
    pendingMouseY = e.clientY
    mouseMoveRaf = requestAnimationFrame(() => {
      mouseMoveRaf = 0
      if (pendingMouseX !== null && pendingMouseY !== null) {
        processMouseMove(pendingMouseX, pendingMouseY)
        pendingMouseX = null
        pendingMouseY = null
      }
    })
  }

  function processMouseMove(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect()
    const w = {
      x: (clientX - rect.left - zoom.x) / zoom.k,
      y: (clientY - rect.top - zoom.y) / zoom.k,
    }
    if (drag) return
    if (zoom.k < HOVER_MIN_ZOOM) {
      if (hoveredId) setHover(null)
    } else {
      const n = grid.find(w.x, w.y, Math.max(8, NODE_HIT_PX / zoom.k), hitRadius)
      setHover(n?.id ?? null)
    }
  }

  function tickBirth() {
    birthRaf = 0
    if (Date.now() - birthStart >= 5_600) return
    markDirty()
    birthRaf = requestAnimationFrame(tickBirth)
  }

  // Cache of pre-resolved type colors (same pattern as minimap) — avoids
  // resolving CSS vars per node per frame.
  const typeColors = new Map<string, string>()
  function typeColor(n: SimNode): string {
    const key = n.type + "|" + (n.status ?? "") + "|" + (n.color ?? "")
    const hit = typeColors.get(key)
    if (hit) return hit
    const c = nodeColor(n)
    typeColors.set(key, c)
    return c
  }

  // Cache visible nodes grouped by color - rebuilt only when zoom changes significantly
  let cachedNodeGroups: Map<string, SimNode[]> | null = null
  let cachedZoomKey = ""
  let cachedBox: ViewBounds | null = null

  function getNodeGroups(box: ViewBounds): Map<string, SimNode[]> {
    const zoomKey = `${zoom.k.toFixed(2)}_${zoom.x.toFixed(0)}_${zoom.y.toFixed(0)}`
    if (cachedNodeGroups && cachedZoomKey === zoomKey) return cachedNodeGroups

    const groups = new Map<string, SimNode[]>()
    for (const n of nodes) {
      if (!visible(n, box)) continue
      const c = typeColor(n)
      const arr = groups.get(c)
      if (arr) arr.push(n)
      else groups.set(c, [n])
    }
    cachedNodeGroups = groups
    cachedZoomKey = zoomKey
    return groups
  }

  function draw() {
    const w = width()
    const h = height()

    // Smart dirty checking: skip draw if nothing changed
    const selectedId = cb.getSelectedId()
    const primaryId = hoveredId ?? selectedId
    const zoomChanged = zoom.k !== lastZoomK || zoom.x !== lastZoomX || zoom.y !== lastZoomY
    const hoverChanged = hoveredId !== lastHoveredId
    const primaryChanged = primaryId !== lastPrimaryId

    if (!zoomChanged && !hoverChanged && !primaryChanged && !freezePhysics) {
      // Only tooltip position updates - skip full redraw
      if (hoveredId) {
        const n = byId.get(hoveredId)
        if (n) {
          tooltip.reposition(
            { x: (n.x ?? 0) * zoom.k + zoom.x, y: (n.y ?? 0) * zoom.k + zoom.y, r: nodeRadius(n) * zoom.k },
            { w, h },
          )
        }
      }
      return
    }

    // Update last-known state
    lastZoomK = zoom.k
    lastZoomX = zoom.x
    lastZoomY = zoom.y
    lastHoveredId = hoveredId
    lastPrimaryId = primaryId

    // Reset transform to clear the whole device canvas cleanly.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // World coord system: DPR × user zoom.
    ctx.setTransform(dpr * zoom.k, 0, 0, dpr * zoom.k, dpr * zoom.x, dpr * zoom.y)

    const box = bounds(zoom, w, h)
    cachedBox = box

    // Build focus closure (hovered > selected, neighbors included).
    const secondaryId = hoveredId && selectedId && selectedId !== hoveredId ? selectedId : null
    const primaryClosure = primaryId ? getClosure(primaryId) : null
    const secondaryClosure = secondaryId ? getClosure(secondaryId) : null

    // --- Edges ------------------------------------------------------------
    // Two-pass draw: dim edges first, then focused edges on top so they win
    // the overdraw. Within each pass, group by dash pattern so we can use a
    // single beginPath()/stroke() per group. This is the big win over SVG.
    ctx.lineWidth = 1 / zoom.k
    ctx.strokeStyle = getCssVar("--text-weak")

    const edgeDash = (type: string, k: number) => {
      if (type === "imports") return [3 / k, 3 / k]
      if (type === "links") return [1 / k, 4 / k]
      return []
    }

    // Pass 1 — unfocused solid edges
    ctx.setLineDash([])
    ctx.globalAlpha = edgeOpacityDefault
    ctx.beginPath()
    for (const l of simLinks) {
      const t = (l as any).type
      if (t === "imports" || t === "links") continue
      if (!visibleLink(l, box)) continue
      if (isFocusedLink(l, primaryId, secondaryId)) continue
      const s = l.source as SimNode
      const tgt = l.target as SimNode
      ctx.moveTo(s.x ?? 0, s.y ?? 0)
      ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0)
    }
    ctx.stroke()

    // Pass 2 — unfocused dashed imports edges
    ctx.setLineDash([3 / zoom.k, 3 / zoom.k])
    ctx.beginPath()
    for (const l of simLinks) {
      if ((l as any).type !== "imports") continue
      if (!visibleLink(l, box)) continue
      if (isFocusedLink(l, primaryId, secondaryId)) continue
      const s = l.source as SimNode
      const t = l.target as SimNode
      ctx.moveTo(s.x ?? 0, s.y ?? 0)
      ctx.lineTo(t.x ?? 0, t.y ?? 0)
    }
    ctx.stroke()

    // Pass 2b — unfocused dotted links edges (markdown/wiki links)
    ctx.setLineDash([1 / zoom.k, 4 / zoom.k])
    ctx.beginPath()
    for (const l of simLinks) {
      if ((l as any).type !== "links") continue
      if (!visibleLink(l, box)) continue
      if (isFocusedLink(l, primaryId, secondaryId)) continue
      const s = l.source as SimNode
      const t = l.target as SimNode
      ctx.moveTo(s.x ?? 0, s.y ?? 0)
      ctx.lineTo(t.x ?? 0, t.y ?? 0)
    }
    ctx.stroke()

    // Pass 3 — focused edges (colored, thicker). Drawn per-edge because
    // color varies; still cheap because the count is small.
    if (primaryId) {
      ctx.setLineDash([])
      const primaryNode = byId.get(primaryId)
      const primaryColor = primaryNode ? typeColor(primaryNode) : getCssVar("--border-base")
      const secondaryNode = secondaryId ? byId.get(secondaryId) : null
      const secondaryColor = secondaryNode ? typeColor(secondaryNode) : null
      for (const l of simLinks) {
        const cls = classifyLink(l, primaryId, secondaryId)
        if (cls === 0) continue
        if (!visibleLink(l, box)) continue
        const s = l.source as SimNode
        const t = l.target as SimNode
        ctx.globalAlpha = cls === 1 ? 0.9 : 0.45
        ctx.lineWidth = (cls === 1 ? 2 : 1.5) / zoom.k
        ctx.strokeStyle = cls === 1 ? primaryColor : (secondaryColor ?? primaryColor)
        ctx.setLineDash(edgeDash((l as any).type, zoom.k))
        ctx.beginPath()
        ctx.moveTo(s.x ?? 0, s.y ?? 0)
        ctx.lineTo(t.x ?? 0, t.y ?? 0)
        ctx.stroke()
      }
    }

    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // --- Nodes ------------------------------------------------------------
    // Use cached node groups for better performance during pan/zoom
    ctx.lineWidth = 1.5 / zoom.k

    const groups = getNodeGroups(box)

    // Minimum on-screen radius (4px) in world units, so nodes stay visible
    // when zoomed out far. At k≥1 this is below the natural radius and has
    // no effect; at low k it floors how small a node can be rendered.
    const minScreenR = 4 / zoom.k
    for (const [color, arr] of groups) {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      for (const n of arr) {
        const x = n.x ?? 0
        const y = n.y ?? 0
        const r = nodeRadius(n)
        const s = nodeScale(n)
        const rr = Math.max(r * s, minScreenR)
        const focused = primaryClosure?.has(n.id) || secondaryClosure?.has(n.id)
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        // Filled disc gives the "opaque background" pass: nodes show as
        // solid dots when zoomed out, but the alpha is low enough that the
        // SVG icon overlay (high zoom) remains the dominant visual.
        ctx.globalAlpha = focused ? 0.5 : primaryId ? 0.1 : 0.2
        ctx.fill()
        // Stroke ring on top (matches existing behavior).
        ctx.globalAlpha = focused ? 1 : primaryId ? 0.35 : ringOpacityDefault
        ctx.stroke()
      }
    }
    if (birthIds.size > 0) {
      const t = Math.min(1, (Date.now() - birthStart) / 5_500)
      const a = (1 - t) * (1 - t)
      if (a > 0) {
        ctx.save()
        ctx.fillStyle = "rgba(34,197,94,0.18)"
        ctx.strokeStyle = "#22c55e"
        ctx.lineWidth = 3 / zoom.k
        ctx.shadowColor = "#22c55e"
        ctx.shadowBlur = 18 / zoom.k
        ctx.globalAlpha = a
        for (const n of nodes) {
          if (!birthIds.has(n.id) || !visible(n, box)) continue
          const r = (nodeRadius(n) + 6) * (1 + 2.4 * a)
          ctx.beginPath()
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1

    // --- Overlay (SVG) — focused subgraph with full icons/labels ---------
    paintOverlay(primaryId, secondaryId)

    // Reposition tooltip since node may have moved this frame.
    if (hoveredId) {
      const n = byId.get(hoveredId)
      if (n) {
        tooltip.reposition(
          { x: (n.x ?? 0) * zoom.k + zoom.x, y: (n.y ?? 0) * zoom.k + zoom.y, r: nodeRadius(n) * zoom.k },
          { w, h },
        )
      }
    }
  }

  function classifyLink(l: SimLink, primary: string | null, secondary: string | null): 0 | 1 | 2 {
    const s = (l.source as SimNode).id
    const t = (l.target as SimNode).id
    if (primary && (s === primary || t === primary)) return 1
    if (secondary && (s === secondary || t === secondary)) return 2
    return 0
  }

  function isFocusedLink(l: SimLink, primary: string | null, secondary: string | null): boolean {
    return classifyLink(l, primary, secondary) !== 0
  }

  // Keep a stable overlay group so d3 patches attrs instead of thrashing DOM.
  const overlayEdges = overlayG.append("g").attr("class", "overlay-edges")
  const overlayNodes = overlayG.append("g").attr("class", "overlay-nodes")

  // Cache overlay state to avoid expensive d3 re-renders when focus unchanged
  let lastOverlayPrimary: string | null = null
  let lastOverlaySecondary: string | null = null
  let lastOverlayZoomK = 0
  let lastOverlayFocusKey = ""

  function paintOverlay(primary: string | null, secondary: string | null) {
    // Sync the overlay's group transform to the zoom state so it aligns
    // pixel-perfect with the canvas layer.
    overlayG.attr("transform", `translate(${zoom.x},${zoom.y}) scale(${zoom.k})`)

    if (!primary) {
      if (lastOverlayPrimary === null) return // already cleared
      overlayEdges.selectAll("*").remove()
      overlayNodes.selectAll("*").remove()
      lastOverlayPrimary = null
      lastOverlaySecondary = null
      return
    }

    const primaryNode = byId.get(primary)
    if (!primaryNode) {
      overlayEdges.selectAll("*").remove()
      overlayNodes.selectAll("*").remove()
      lastOverlayPrimary = null
      lastOverlaySecondary = null
      return
    }

    // Compute the focused set: primary + 1-hop neighbors (+ secondary + its
    // neighbors if any).
    const focusIds = new Set<string>(getClosure(primary))
    if (secondary) {
      for (const id of getClosure(secondary)) focusIds.add(id)
    }

    // Clamp overlay size so a hover on a hub with 1000 edges doesn't blow up
    // the DOM. In that case we only render the primary + secondary nodes
    // and the (thin) focused edges; the canvas base layer already shows the
    // colored edges radiating out.
    const OVERLAY_CAP = 80
    if (focusIds.size > OVERLAY_CAP) {
      focusIds.clear()
      focusIds.add(primary)
      if (secondary) focusIds.add(secondary)
    }

    // Check if focus actually changed - skip expensive d3 re-render if not
    const focusKey = Array.from(focusIds).sort().join(",")
    const zoomKChanged = Math.abs(zoom.k - lastOverlayZoomK) > 0.01
    if (
      !zoomKChanged &&
      primary === lastOverlayPrimary &&
      secondary === lastOverlaySecondary &&
      focusKey === lastOverlayFocusKey
    ) {
      // Only update positions of existing elements, don't rebuild
      const focusNodes: SimNode[] = []
      for (const id of focusIds) {
        const n = byId.get(id)
        if (n) focusNodes.push(n)
      }
      overlayNodes
        .selectAll<SVGGElement, SimNode>("g.overlay-node")
        .data(focusNodes, (d: any) => d.id)
        .attr("transform", (d: any) => `translate(${(d as SimNode).x ?? 0},${(d as SimNode).y ?? 0})`)
      overlayEdges
        .selectAll<SVGLineElement, SimLink>("line")
        .attr("x1", (d: any) => ((d as SimLink).source as SimNode).x ?? 0)
        .attr("y1", (d: any) => ((d as SimLink).source as SimNode).y ?? 0)
        .attr("x2", (d: any) => ((d as SimLink).target as SimNode).x ?? 0)
        .attr("y2", (d: any) => ((d as SimLink).target as SimNode).y ?? 0)
      return
    }

    // Update cache
    lastOverlayPrimary = primary
    lastOverlaySecondary = secondary
    lastOverlayZoomK = zoom.k
    lastOverlayFocusKey = focusKey

    const focusNodes: SimNode[] = []
    for (const id of focusIds) {
      const n = byId.get(id)
      if (n) focusNodes.push(n)
    }

    const focusLinks = simLinks.filter((l) => {
      const s = (l.source as SimNode).id
      const t = (l.target as SimNode).id
      return focusIds.has(s) && focusIds.has(t)
    })

    const primaryColor = typeColor(primaryNode)
    const flowEdges = zoom.k >= EDGE_ANIM_ZOOM

    // Edges -------------------------------------------------------------
    const eSel = overlayEdges
      .selectAll<SVGLineElement, SimLink>("line")
      .data(focusLinks, (d: any) => (d.source as SimNode).id + "→" + (d.target as SimNode).id)
    eSel.exit().remove()
    const eEnter = eSel
      .enter()
      .append("line")
      .attr("stroke-linecap", "round")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.9)
    eEnter
      .merge(eSel as any)
      .attr("x1", (d: any) => (d.source as SimNode).x ?? 0)
      .attr("y1", (d: any) => (d.source as SimNode).y ?? 0)
      .attr("x2", (d: any) => (d.target as SimNode).x ?? 0)
      .attr("y2", (d: any) => (d.target as SimNode).y ?? 0)
      .attr("stroke", primaryColor)
      .attr("stroke-dasharray", (d: any) =>
        flowEdges ? "4 4" : d.type === "imports" ? "3,3" : d.type === "links" ? "1,4" : "none",
      )
      .classed("edge-flow", (d: any) => flowEdges && d.source && (d.source as SimNode).id === primary)

    // Nodes -------------------------------------------------------------
    const nSel = overlayNodes.selectAll<SVGGElement, SimNode>("g.overlay-node").data(focusNodes, (d: any) => d.id)
    nSel.exit().remove()
    const nEnter = nSel.enter().append("g").attr("class", "overlay-node")
    nEnter.append("circle").attr("class", "ring").attr("fill", "transparent").attr("stroke-width", 1.5)
    nEnter.append("g").attr("class", "icon-slot")
    nEnter
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "var(--text-weak)")
      .attr("pointer-events", "none")
      .attr("dy", "2.2em")

    const merged = nEnter.merge(nSel as any)
    merged.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`).style("cursor", "pointer")
    merged
      .select("circle.ring")
      .attr("r", (d: any) => nodeRadius(d) + (d.type === "file" || d.type === "directory" ? 4 : 0))
      .attr("stroke", (d: any) => typeColor(d))
      .attr("stroke-opacity", (d: any) => (d.id === primary ? 1 : 0.7))
    const showLabels = zoom.k >= GRAPH_LABEL_MIN_ZOOM
    merged
      .select("text.label")
      .text((d: any) => d.label)
      .attr("x", 0)
      .attr("y", 0)
      .style("display", showLabels ? "inline" : "none")
    merged.each(function (this: SVGGElement, d: any) {
      // Icon — file sprite or entity path. Only rebuild if the id changed.
      const g = d3Select.select(this)
      const slot = g.select<SVGGElement>("g.icon-slot")
      const existingFor = slot.attr("data-for")
      if (existingFor === d.id) return
      slot.selectAll("*").remove()
      slot.attr("data-for", d.id)
      const r = nodeRadius(d)
      if (d.type === "file" || d.type === "directory") {
        const rawPath = d.id.startsWith("file:") ? d.id.slice(5) : d.id.startsWith("dir:") ? d.id.slice(4) : d.id
        const iconName = chooseIconName(rawPath, d.type as "file" | "directory", false)
        const iconSize = Math.max(r * 1.8, 14)
        slot
          .append("svg")
          .attr("viewBox", "0 0 32 32")
          .attr("width", iconSize)
          .attr("height", iconSize)
          .attr("x", -iconSize / 2)
          .attr("y", -iconSize / 2)
          .attr("pointer-events", "none")
          .append("use")
          .attr("href", `${fileIconSpriteUrl}#${iconName}`)
      } else {
        const path = nodeIcon(d)
        if (!path) return
        const iconSize = Math.max(r * 1.05, 9)
        slot
          .append("svg")
          .attr("viewBox", ENTITY_ICON_VIEWBOX)
          .attr("width", iconSize)
          .attr("height", iconSize)
          .attr("x", -iconSize / 2)
          .attr("y", -iconSize / 2)
          .attr("fill", "none")
          .attr("stroke", typeColor(d))
          .attr("stroke-width", NODE_ICON_STROKE)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .html(path)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // focus() — camera flight to a node and its neighbors.
  // ---------------------------------------------------------------------------
  function fit() {
    const run = () => {
      if (nodes.length === 0) return
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      const w = width()
      const h = height()
      for (const n of nodes) {
        const nx = n.x ?? w / 2
        const ny = n.y ?? h / 2
        minX = Math.min(minX, nx)
        maxX = Math.max(maxX, nx)
        minY = Math.min(minY, ny)
        maxY = Math.max(maxY, ny)
      }
      const pad = 120
      const bw = maxX - minX + pad * 2
      const bh = maxY - minY + pad * 2
      const scale = Math.max(ZOOM_MIN, Math.min(w / bw, h / bh, 2))
      const x = (minX + maxX) / 2
      const y = (minY + maxY) / 2
      const next = d3Zoom.zoomIdentity.translate(w / 2 - x * scale, h / 2 - y * scale).scale(scale)
      canvasSel
        .transition()
        .duration(550)
        .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
        .call(zoomBehavior.transform, next)
    }
    if (nodes.some((n) => n.x == null || n.y == null)) requestAnimationFrame(run)
    else run()
  }

  function focus(id: string | null) {
    if (!id) {
      markDirty()
      return
    }
    const target = byId.get(id)
    if (!target) return
    const run = () => {
      const neighbors = adjacency.get(id) ?? new Set<string>()
      const connected = [
        target,
        ...Array.from(neighbors)
          .map((nid) => byId.get(nid))
          .filter((n): n is SimNode => Boolean(n)),
      ]
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of connected) {
        const nx = n.x ?? width() / 2
        const ny = n.y ?? height() / 2
        minX = Math.min(minX, nx)
        maxX = Math.max(maxX, nx)
        minY = Math.min(minY, ny)
        maxY = Math.max(maxY, ny)
      }
      const padding = 80
      const bw = maxX - minX + padding * 2
      const bh = maxY - minY + padding * 2
      const drawerW = cb.inset?.() ?? 420
      const w = width()
      const h = height()
      const viewW = w - drawerW
      const viewH = h
      const scaleX = viewW / bw
      const scaleY = viewH / bh
      const nextScale = Math.min(scaleX, scaleY, 2)
      const cxBox = (minX + maxX) / 2
      const cyBox = (minY + maxY) / 2
      const cx = (w - drawerW) / 2
      const cy = h / 2
      const next = d3Zoom.zoomIdentity.translate(cx - cxBox * nextScale, cy - cyBox * nextScale).scale(nextScale)
      canvasSel
        .transition()
        .duration(900)
        .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
        .call(zoomBehavior.transform, next)
    }
    if (target.x == null || target.y == null) requestAnimationFrame(run)
    else run()
  }

  function recenter(inset: number) {
    const w = width()
    const h = height()
    const gap = Math.max(0, Math.min(inset, w))
    const k = zoom.k
    const x = ((w - gap) / 2 - zoom.x) / k
    const y = (h / 2 - zoom.y) / k
    const next = d3Zoom.zoomIdentity.translate(w / 2 - x * k, h / 2 - y * k).scale(k)
    canvasSel
      .transition()
      .duration(560)
      .ease((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2))
      .call(zoomBehavior.transform, next)
  }

  // ---------------------------------------------------------------------------
  // External hover driver (e.g. sidebar card hover) — only applies if the
  // cursor isn't already over a real node.
  // ---------------------------------------------------------------------------
  function setHoveredIdExternal(id: string | null) {
    if (id && !byId.has(id)) return
    setHover(id)
  }

  // Kick off first paint after the overlay is initialized.
  scheduleDraw()
  if (birthIds.size > 0) birthRaf = requestAnimationFrame(tickBirth)
  scheduleMinimap()

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------
  function stop() {
    if (rafDraw) cancelAnimationFrame(rafDraw)
    if (birthRaf) cancelAnimationFrame(birthRaf)
    if (hoverAnimRaf) cancelAnimationFrame(hoverAnimRaf)
    if (minimapRaf) cancelAnimationFrame(minimapRaf)
    simulation?.stop()
    // Final flush so the view we leave is the view we return to.
    persist()
    saver.flush()
    tooltip.destroy()
    resizeObs.disconnect()
    minimap.removeEventListener("mousedown", onMinimapDown)
    window.removeEventListener("mousemove", onMinimapMove)
    window.removeEventListener("mouseup", onMinimapUp)
    window.removeEventListener("mousemove", onWindowMove)
    window.removeEventListener("mouseup", onWindowUp)
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
    minimap.remove()
    beacon.destroy()
    canvas.remove()
    // Restore the SVG to its original inline styles so the caller or the
    // next renderer sees it unchanged.
    svgEl.style.pointerEvents = savedSvgStyle.pointerEvents
    svgEl.style.position = savedSvgStyle.position
    svgEl.style.inset = savedSvgStyle.inset
    svgEl.style.zIndex = savedSvgStyle.zIndex
    svg.selectAll("*").remove()
    iconCache.clear()
  }

  return {
    stop,
    focus,
    fit,
    recenter,
    goToNodesIfOffscreen,
    setHoveredId: setHoveredIdExternal,
    setPhysics: (p: Physics) => {
      activePhysics = { ...p }
      const linkForce = simulation.force("link") as d3Force.ForceLink<SimNode, SimLink> | null
      if (linkForce) linkForce.distance(physDist())
      const chargeForce = simulation.force("charge") as d3Force.ForceManyBody<SimNode> | null
      if (chargeForce) chargeForce.strength(physCharge())
      const collideForce = simulation.force("collide") as d3Force.ForceCollide<SimNode> | null
      if (collideForce) collideForce.radius(physCollide())
      simulation.alphaDecay(physDecay())
      simulation.alphaMin(GRAPH_SIM_ALPHA_MIN)
      if (!freezePhysics) simulation.alpha(0.3).restart()
    },
  }
}

// Resolve a CSS variable at draw time. The app paints on a dark theme where
// --text-weak and --border-base are the only two we need for base layer
// rendering. Cached because getComputedStyle is expensive.
const cssVarCache = new Map<string, string>()
function getCssVar(name: string): string {
  const hit = cssVarCache.get(name)
  if (hit) return hit
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888"
  cssVarCache.set(name, v)
  return v
}

// Exported for the dispatcher to signal that loadLayout is wired through
// the shared module. Keeps this file as the sole consumer of graph-layout.ts
// when it's the active renderer.
export { loadLayout, createLayoutSaver }
